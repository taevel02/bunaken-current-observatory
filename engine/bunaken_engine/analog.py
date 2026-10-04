"""Deterministic Weighted Analog. PCI is dimensionless, never a safety score."""
import math
from collections import defaultdict

from bunaken_engine.features import finite, instant
from bunaken_engine.registry import ROOT, read_json
from bunaken_engine.time import wita_date


def effective_size(weights):
    total = sum(weights)
    squares = sum(value * value for value in weights)
    if squares <= 0: return 0.0
    count=sum(value > 0 for value in weights)
    result=min(count,total * total / squares)
    return float(count) if math.isclose(result,count,rel_tol=1e-12) else result


def feature_units(names):
    """A circular sin/cos pair contributes one logical feature."""
    result = []
    for name in names:
        if name.endswith('_cos') and name[:-4] + '_sin' in names:
            continue
        pair = name[:-4] + '_cos' if name.endswith('_sin') else None
        result.append((name, pair) if pair in names else (name,))
    return result


def target_mask(values, scaler, feature_config):
    mask, coverage = {}, {}
    for group, definition in feature_config['groups'].items():
        units = feature_units(definition['features'])
        active = [unit for unit in units if all(
            name not in feature_config.get('disabled', {}) and
            scaler['features'].get(name, {}).get('enabled') and
            finite(scaler['features'][name].get('iqr')) and scaler['features'][name]['iqr'] > 0 and
            finite(values.get(name)) for name in unit)]
        ratio = len(active) / len(units)
        if ratio >= 0.5:
            mask[group] = active
            coverage[group] = ratio
        else:
            coverage[group] = 0.0
    coverage['total'] = sum(feature_config['groups'][group]['weight'] * ratio
                            for group, ratio in coverage.items() if group != 'total')
    return mask, coverage


def environmental_distance(target, candidate, mask, scaler, feature_config):
    if not mask:
        return None
    total_weight = sum(feature_config['groups'][group]['weight'] for group in mask)
    if total_weight <= 0:
        return None
    distance = 0.0
    for group, units in mask.items():
        differences = []
        for unit in units:
            if any(not finite(candidate.get(name)) for name in unit):
                return None
            differences.append(sum(((target[name] - candidate[name]) /
                                    scaler['features'][name]['iqr']) ** 2 for name in unit))
        distance += feature_config['groups'][group]['weight'] / total_weight * sum(differences) / len(units)
    return math.sqrt(distance)


def site_weight(target, candidate, config):
    weights = config['site_weights']
    if candidate['site_id'] != target['site_id']:
        # No inferred similar-site groups; an explicit versioned geometry group is required.
        similar = target.get('geometry_group') and target.get('geometry_group') == candidate.get('geometry_group')
        return weights['verified_similar_geometry' if similar else 'other_site']
    if target.get('zone_id') is None or candidate.get('zone_id') is None:
        return weights['same_site_unknown_zone']
    return weights['same_zone' if target['zone_id'] == candidate['zone_id'] else 'same_site_other_zone']


def neighbors(target, candidates, scaler, feature_config, config):
    mask, coverage = target_mask(target['values'], scaler, feature_config)
    selected = []
    for candidate in candidates:
        distance = environmental_distance(target['values'], candidate['values'], mask, scaler, feature_config)
        if distance is None:
            continue
        similarity = math.exp(-distance * distance / (2 * config['sigma'] ** 2))
        if similarity >= config['minimum_similarity']:
            selected.append((distance, candidate['id'], similarity, candidate))
    selected.sort(key=lambda row: (row[0], row[1]))
    result = []
    for distance, _, similarity, candidate in selected[:config['maximum_neighbors']]:
        weight = similarity * site_weight(target, candidate, config) * candidate['quality_weight'] * candidate['provenance_weight']
        if finite(weight) and weight > 0:
            result.append(dict(candidate=candidate, distance=distance, similarity=similarity, weight=weight))
    return result, coverage, mask


def support_level(n_eff, days, same_site_days, same_zone_days, site_id, evidence, config):
    base = 'very_low' if n_eff < 3 else 'low'
    # Evidence must be a recomputed forward validation report, never a client confidence field.
    if not evidence or evidence.get('mode') != 'forward' or not evidence.get('operational_forecast'):
        return base
    threshold = config.get('large_error_threshold')
    metrics = evidence.get('metrics', {})
    if not finite(threshold) or threshold <= 0 or metrics.get('large_error_threshold') != threshold:
        return base
    if not (n_eff >= 5 and days >= 5 and same_site_days >= 3 and metrics.get('predicted_days', 0) >= 10):
        return base
    mae, baseline, errors, baseline_errors = (metrics.get(key) for key in
        ('mae', 'global_baseline_mae', 'large_error_rate', 'global_baseline_large_error_rate'))
    if not all(finite(value) for value in (mae, baseline, errors, baseline_errors)) or mae >= baseline or errors > baseline_errors:
        return base
    site = evidence.get('sites', {}).get(site_id, {})
    limit = config.get('high_support_mae_limit')
    if (n_eff >= 10 and days >= 10 and same_zone_days >= 5 and metrics['predicted_days'] >= 20 and
        site.get('predicted_days', 0) >= 5 and finite(limit) and limit > 0 and
        finite(site.get('mae')) and finite(site.get('site_baseline_mae')) and
        site['mae'] < site['site_baseline_mae'] and site['mae'] <= limit):
        return 'high'
    return 'medium'


def vertical_evidence(selected):
    known = [row for row in selected if row['candidate'].get('vertical') in {'none', 'down', 'up', 'mixed'}]
    days = {row['candidate']['day'] for row in known}
    none_days = {row['candidate']['day'] for row in known if row['candidate']['vertical'] == 'none'}
    n_eff = effective_size([row['weight'] for row in known])
    directions = {}
    for direction in ('down', 'up'):
        positive = [row for row in known if row['candidate']['vertical'] == direction or
                    (row['candidate']['vertical'] == 'mixed' and direction in row['candidate'].get('vertical_events', []))]
        positive_days = {row['candidate']['day'] for row in positive}
        available = len(known) >= 5 and len(days) >= 3 and len(positive_days) >= 2 and len(none_days) >= 2 and n_eff >= 3
        directions[direction] = dict(status='evidence_available' if available else 'insufficient',
                                    count=len(positive), distinct_days=len(positive_days))
    return dict(status='evidence_available' if any(row['status'] == 'evidence_available' for row in directions.values()) else 'insufficient',
                known_count=len(known), distinct_days=len(days), none_days=len(none_days), n_eff=n_eff, directions=directions)


def predict(target, candidates, scaler, *, config=None, feature_config=None, evidence=None, diagnostic=False, root=ROOT):
    config = config or read_json(root / 'config/model.json')
    feature_config = feature_config or read_json(root / 'config/features.json')
    if (config['minimum_labels'] < 3 or config['minimum_days'] < 3 or config['minimum_n_eff'] < 2 or
        config['minimum_coverage'] < .8 or not 1 <= config['maximum_neighbors'] <= 20):
        raise ValueError('model_gate_below_contract_minimum')
    if not finite(config['sigma']) or config['sigma'] <= 0:
        raise ValueError('invalid_sigma')
    # Numeric labels and vertical labels form independent pools.
    numeric = [row for row in candidates if finite(row.get('pci')) and row['pci'] >= 0]
    selected, coverage, mask = neighbors(target, numeric, scaler, feature_config, config)
    vertical_selected, _, _ = neighbors(target, candidates, scaler, feature_config, config)
    weights = [row['weight'] for row in selected]
    daily = defaultdict(float)
    for row in selected:
        daily[row['candidate']['day']] += row['weight']
    same_site = {row['candidate']['day'] for row in selected if row['candidate']['site_id'] == target['site_id']}
    same_zone = {row['candidate']['day'] for row in selected if target.get('zone_id') is not None and
                 row['candidate']['site_id'] == target['site_id'] and row['candidate'].get('zone_id') == target['zone_id']}
    n_eff = effective_size(weights)
    reasons = []
    if not target.get('geometry_verified', False): reasons.append('unverified_geometry')
    if not target.get('sources_ready', False): reasons.append('missing_required_sources')
    if not diagnostic and instant(scaler['cutoff']) > instant(target['start_at']): reasons.append('scaler_cutoff_after_target')
    if not {'tide', 'ocean'}.issubset(mask): reasons.append('missing_required_features')
    if coverage['total'] + 1e-12 < config['minimum_coverage']: reasons.append('insufficient_feature_coverage')
    if len(numeric) < config['minimum_labels']: reasons.append('insufficient_numeric_labels')
    if len(selected) < config['minimum_labels']: reasons.append('insufficient_analogs')
    if len(daily) < config['minimum_days']: reasons.append('insufficient_distinct_days')
    if n_eff < config['minimum_n_eff']: reasons.append('insufficient_effective_size')
    if not same_site: reasons.append('missing_same_site')
    pci = None if reasons else sum(row['weight'] * row['candidate']['pci'] for row in selected) / sum(weights)
    support = 'insufficient' if reasons else support_level(n_eff, len(daily), len(same_site), len(same_zone), target['site_id'], evidence, config)
    vertical = vertical_evidence(vertical_selected) if not any(reason in reasons for reason in
        ('unverified_geometry', 'missing_required_sources', 'missing_required_features', 'insufficient_feature_coverage', 'scaler_cutoff_after_target')) else dict(status='insufficient')
    reference = target.get('reference_geometry') or any(row['candidate'].get('reference_geometry') for row in selected)
    if pci is not None and reference: support='very_low'
    return dict(site_id=target['site_id'], zone_id=target.get('zone_id'), start_at=target['start_at'], duration_minutes=60,
                reference_depth_m=target['values'].get('reference_depth_m'), pci=pci,
                prediction_status='insufficient' if reasons else ('experimental' if reference or n_eff < 3 else 'available'),
                support=support, n_eff=n_eff, n_eff_days=effective_size(list(daily.values())),
                distinct_days=len(daily), same_site_days=len(same_site), same_zone_days=len(same_zone),
                vertical_evidence=vertical, feature_coverage=coverage, reason_codes=reasons,
                model_version=config['version'], source_snapshot_ids=sorted(set(target.get('source_snapshot_ids', []) +
                    [row['candidate']['snapshot_id'] for row in selected])))
