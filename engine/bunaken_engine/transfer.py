"""Explicit, unvalidated cross-Site hypothesis; never fills the baseline PCI."""
from collections import defaultdict
import math

from bunaken_engine.analog import effective_size, environmental_distance, predict, target_mask
from bunaken_engine.features import finite, instant
from bunaken_engine.registry import ROOT, read_json
from bunaken_engine.snapshots import canonical, digest
from bunaken_engine.time import wita_date


def transfer_configuration(root=ROOT):
    config = read_json(root / 'config/site-transfer.json')
    if (config['version'] != 'site-transfer-v1' or config['minimum_sites'] < 3 or
        config['minimum_n_eff_sites'] < 2 or config['minimum_n_eff_days'] < 2 or
        not 0 < config['maximum_site_share'] <= .5 or config['spatial_block_km'] <= 0):
        raise ValueError('invalid_transfer_configuration')
    return config


def transfer_features(config):
    total = sum(group['weight'] for group in config['groups'].values())
    return dict(groups={name: {**group, 'weight': group['weight'] / total}
                        for name, group in config['groups'].items()})


def predict_transfer(target, candidates, scaler, *, diagnostic=False, root=ROOT):
    config = transfer_configuration(root)
    base = read_json(root / 'config/model.json')
    if base['version'] != config['base_model_version']:
        raise ValueError('transfer_base_model_mismatch')
    features = transfer_features(config)
    mask, _ = target_mask(target['values'], scaler, features)
    # No inferred geometry groups or comparisons of differently oriented Site axes.
    by_site = defaultdict(list)
    seen = set()
    for candidate in candidates:
        if candidate['id'] in seen:
            raise ValueError('duplicate_transfer_candidate')
        seen.add(candidate['id'])
        if (candidate['site_id'] == target['site_id'] or candidate.get('zone_id') is not None or
            candidate['values'].get('reference_depth_m') != 18 or not finite(candidate.get('pci')) or candidate['pci'] < 0):
            continue
        if not diagnostic and (candidate['day'] >= wita_date(target['start_at']).isoformat() or
            candidate.get('end_at') and instant(candidate['end_at']) > instant(target['start_at'])):
            continue
        distance = environmental_distance(target['values'], candidate['values'], mask, scaler, features)
        if distance is None:
            continue
        similarity = math.exp(-distance * distance / (2 * base['sigma'] ** 2))
        raw = similarity * candidate['quality_weight'] * candidate['provenance_weight']
        if similarity >= base['minimum_similarity'] and finite(raw) and raw > 0:
            by_site[candidate['site_id']].append(dict(candidate=candidate, distance=distance, raw=raw))
    for group in by_site.values():
        group.sort(key=lambda row: (row['distance'], row['candidate']['id']))
    site_order = sorted(by_site, key=lambda site: (by_site[site][0]['distance'], site))
    selected = []
    # Round robin prevents a heavily visited Site from consuming the entire K budget.
    for rank in range(max((len(group) for group in by_site.values()), default=0)):
        for site in site_order:
            if rank < len(by_site[site]) and len(selected) < base['maximum_neighbors']:
                selected.append(by_site[site][rank])
        if len(selected) == base['maximum_neighbors']:
            break
    site_days = defaultdict(set)
    day_counts = defaultdict(int)
    for row in selected:
        candidate = row['candidate']
        site_days[candidate['site_id']].add(candidate['day'])
        day_counts[(candidate['site_id'], candidate['day'])] += 1
    sites, days = defaultdict(float), defaultdict(float)
    for row in selected:
        candidate = row['candidate']
        # Average within Site/day and then across days within Site. Repeated dives do not buy extra weight.
        row['weight'] = row['raw'] / (len(site_days[candidate['site_id']]) * day_counts[(candidate['site_id'], candidate['day'])])
        sites[candidate['site_id']] += row['weight']
        days[candidate['day']] += row['weight']
    result = predict(target, [row['candidate'] for row in selected], scaler,
                     feature_config=features, config=base, diagnostic=diagnostic, root=root)
    reasons = [reason for reason in result['reason_codes'] if reason not in
               {'missing_same_site', 'insufficient_effective_size', 'insufficient_distinct_days'}]
    weights = [row['weight'] for row in selected]
    total = sum(weights)
    n_eff = effective_size(weights)
    n_eff_days, n_eff_sites = effective_size(list(days.values())), effective_size(list(sites.values()))
    share = max(sites.values(), default=0) / total if total else 0
    if len(days) < base['minimum_days']: reasons.append('insufficient_distinct_days')
    if n_eff < base['minimum_n_eff']: reasons.append('insufficient_effective_size')
    if len(sites) < config['minimum_sites']: reasons.append('insufficient_donor_sites')
    if n_eff_sites < config['minimum_n_eff_sites']: reasons.append('insufficient_effective_sites')
    if n_eff_days < config['minimum_n_eff_days']: reasons.append('insufficient_effective_days')
    if share > config['maximum_site_share'] + 1e-12: reasons.append('dominant_donor_site')
    if target.get('zone_id') is not None: reasons.append('transfer_site_scope_only')
    result.update(pci=None if reasons else sum(row['weight'] * row['candidate']['pci'] for row in selected) / total,
                  prediction_status='insufficient' if reasons else 'experimental',
                  support='insufficient' if reasons else 'very_low', reason_codes=reasons,
                  model_version=config['version'], n_eff=n_eff, n_eff_days=n_eff_days, distinct_days=len(days),
                  same_site_days=0, same_zone_days=0, vertical_evidence=dict(status='insufficient'),
                  source_snapshot_ids=sorted(set(target.get('source_snapshot_ids', []) + [row['candidate']['snapshot_id'] for row in selected])))
    return dict(prediction=result, donor_sites=sorted(sites), donor_site_count=len(sites), n_eff_sites=n_eff_sites,
                max_site_share=share, analog_count=len(selected), validation_status='unvalidated',
                config_sha256=digest(canonical(config)))


def transfer_forecast(context, features, manifest, code_commit, *, root=ROOT):
    """Sidecar reproducible from the same frozen context; snapshot baseline remains immutable."""
    import re
    from bunaken_engine.model_data import prepare_model, replay_root
    from bunaken_engine.registry import resolve_geometry, usable_geometry
    if not re.fullmatch('[0-9a-f]{40}', code_commit or ''):
        raise ValueError('transfer_code_commit_required')
    config = transfer_configuration(root)
    estimates = []
    if context is not None:
        with replay_root(context, root) as replay:
            candidates, scaler, _ = prepare_model(context['observations'], context['training_bundles'],
                context['observer'], context['rubric'], context['cutoff'], root=replay)
            for feature in features:
                if instant(context['cutoff']) > instant(feature['start_at']):
                    raise ValueError('model_cutoff_after_target')
                point = resolve_geometry(feature['site_id'], feature['zone_id'], replay)
                target = dict(**feature, geometry_verified=usable_geometry(point),
                    reference_geometry=point['status'] == 'reference_geometry', sources_ready=manifest['status'] == 'succeeded',
                    source_snapshot_ids=[manifest['snapshot_id']])
                estimates.append(predict_transfer(target, candidates, scaler, root=replay))
    return dict(model_version=config['version'], config=config, config_sha256=digest(canonical(config)),
                model_context_sha256=digest(canonical(context)) if context is not None else None,
                code_commit=code_commit, validation_status='unvalidated', predictions=estimates,
                reason_codes=[] if context is not None else ['transfer_context_unavailable'])
