"""WITA day folds, training-only scalers, matched baselines and abstention."""
from datetime import datetime, time, timedelta, timezone
from statistics import median
from collections import defaultdict
from zoneinfo import ZoneInfo

from bunaken_engine.analog import predict
from bunaken_engine.features import finite, instant, extract_window
from bunaken_engine.model_data import checked_bundles, eligible_candidates, environment_rows, latest_revisions
from bunaken_engine.features import build_scaler
from bunaken_engine.registry import ROOT, read_json, resolve_geometry, load_geometry, usable_geometry, load_sources
from bunaken_engine.time import wita_date

WITA = ZoneInfo('Asia/Makassar')


def day_cutoff(day):
    local = datetime.combine(day - timedelta(days=1), time(20), tzinfo=WITA)
    return local.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def metrics(rows, threshold):
    predicted = [row for row in rows if row['pci'] is not None]
    result = dict(test_count=len(rows), predicted_count=len(predicted), predicted_days=len({row['day'] for row in predicted}),
                  coverage=len(predicted) / len(rows) if rows else 0.0, abstention_count=len(rows) - len(predicted),
                  mae=None, global_baseline_mae=None, site_baseline_mae=None,
                  large_error_threshold=threshold, large_error_rate=None, global_baseline_large_error_rate=None)
    if predicted:
        result['mae'] = sum(abs(row['pci'] - row['actual']) for row in predicted) / len(predicted)
        for kind in ('global', 'site'):
            matched = [row for row in predicted if row[kind + '_baseline'] is not None]
            result[kind + '_baseline_mae'] = sum(abs(row[kind + '_baseline'] - row['actual']) for row in matched) / len(matched) if matched else None
            result[kind + '_baseline_count'] = len(matched)
        if finite(threshold) and threshold > 0:
            result['large_error_rate'] = sum(abs(row['pci'] - row['actual']) > threshold for row in predicted) / len(predicted)
            matched = [row for row in predicted if row['global_baseline'] is not None]
            result['global_baseline_large_error_rate'] = sum(abs(row['global_baseline'] - row['actual']) > threshold for row in matched) / len(matched) if matched else None
    return result


def validation_target(observation, bundles, cutoff, *, operational, root=ROOT):
    start = instant(observation['start_at']); end = start + timedelta(hours=1)
    try: geometry = resolve_geometry(observation['site_id'], observation['zone_id'], root)
    except ValueError: return None
    if not usable_geometry(geometry) or not finite(observation['representative_depth_m']): return None
    available = []
    scoped = read_json(root/'config/model.json').get('comparison_scope') in {'site-18m-v1', 'site-18m-v2'}
    for bundle in bundles:
        manifest = bundle['manifest']
        from bunaken_engine.snapshots import canonical, digest
        if manifest['geometry_hash'] != digest(canonical(load_geometry(root))): continue
        if manifest['status'] != 'succeeded' or instant(manifest['valid_start']) > start or instant(manifest['valid_end']) < end: continue
        if operational and (manifest['kind'] != 'snapshot' or instant(manifest['created_at']) > instant(cutoff)): continue
        storage = bundle.get('storage_evidence', {})
        if operational and (not storage.get('storage_verified') or not storage.get('persisted_at') or instant(storage['persisted_at']) >= instant(cutoff)): continue
        if operational:
            day_start=datetime.combine(wita_date(observation['start_at']),time(),tzinfo=WITA).astimezone(timezone.utc)
            if instant(manifest['valid_start']) > day_start or instant(manifest['valid_end']) < day_start+timedelta(days=1): continue
        samples = [row for row in manifest['samples'] if row.get('site_id') == observation['site_id'] and row.get('zone_id') == observation['zone_id']]
        if not samples: continue
        if operational and any(instant(row['retrieved_at']) > instant(cutoff) or
            (row.get('issued_at') and instant(row['issued_at']) > instant(cutoff)) for row in samples): continue
        from bunaken_engine.snapshots import assess_sources
        readiness = assess_sources(samples, ['fes-height', 'copernicus-currents'], manifest['created_at'], root,
                                   reference_depth=observation['representative_depth_m'], historical=not operational)
        if any(row['status'] != 'succeeded' for row in readiness.values()): continue
        window_samples = samples
        if scoped:
            states = assess_sources(samples, list(load_sources(root)), manifest['created_at'], root,
                                    reference_depth=observation['representative_depth_m'], historical=manifest['kind'] == 'backfill')
            window_samples = [row for row in samples if states[row['source']]['status'] == 'succeeded']
        window = extract_window(window_samples, {**geometry, 'reference_depth_m': observation['representative_depth_m']}, start.isoformat(), end.isoformat())
        available.append((storage['persisted_at'] if operational else manifest['created_at'], manifest['snapshot_id'], window, 0 if manifest['kind'] == 'snapshot' else 1))
    if not available: return None
    if scoped and not operational:
        selected = min(available, key=lambda row: (row[3], -instant(row[0]).timestamp(), row[1]))
    else:
        selected = (max if operational else min)(available, key=lambda row: (instant(row[0]), row[1]))
    _, snapshot_id, window, _ = selected
    return dict(**window, site_id=observation['site_id'], zone_id=observation['zone_id'],
                geometry_verified=True, reference_geometry=geometry['status']=='reference_geometry', sources_ready=True, source_snapshot_ids=[snapshot_id])


def evaluate(observations, bundles, observer, rubric, *, mode='forward', operational=True, root=ROOT):
    if mode not in {'forward', 'leave_one_day_out'}: raise ValueError('invalid_validation_mode')
    if mode == 'leave_one_day_out': operational = False
    bundles = checked_bundles(bundles, root=root)
    if operational:
        bundles=[bundle for bundle in bundles if bundle.get('storage_evidence',{}).get('storage_verified')]
    history = observations
    observations = latest_revisions(history, root=root)
    truth = [row for row in observations if row['record_status'] in {'active', 'corrected'} and row['use_for_model'] and
             row['label_scope'] == 'dive_overall' and row['observer_id'] == observer and row['rubric_version'] == rubric and
             finite(row['overall_pci']) and finite(row['representative_depth_m'])]
    config = read_json(root / 'config/model.json'); features = read_json(root / 'config/features.json')
    names = [name for definition in features['groups'].values() for name in definition['features']]
    dates = sorted({wita_date(row['start_at']) for row in truth})
    rows, folds = [], []
    for day in dates:
        test = [row for row in truth if wita_date(row['start_at']) == day]
        cutoff = day_cutoff(day) if operational else (
            datetime.combine(day, time(), tzinfo=WITA).astimezone(timezone.utc).isoformat() if mode == 'forward' else
            max([row['updated_at'] for row in observations] + [bundle['manifest']['created_at'] for bundle in bundles], key=instant))
        as_of=latest_revisions(history,cutoff=cutoff,root=root)
        test_ids={row['id'] for row in test}
        training=[row for row in as_of if row['id'] not in test_ids and
                  (wita_date(row['start_at']) < day if mode == 'forward' else wita_date(row['start_at']) != day)]
        candidates, _ = eligible_candidates(training, bundles, observer, rubric, cutoff, root=root)
        numeric = [row for row in candidates if finite(row['pci'])]
        scaler = build_scaler(environment_rows(bundles), names, cutoff)
        from bunaken_engine.snapshots import canonical, digest
        folds.append(dict(day=day.isoformat(), cutoff=cutoff, training_ids=[row['id'] for row in candidates],
                          training_days=sorted({row['day'] for row in candidates}), scaler_sha256=digest(canonical(scaler)),
                          scaler_row_count=scaler['row_count']))
        for observation in test:
            target = validation_target(observation, bundles, cutoff, operational=operational, root=root)
            prediction = predict(target, candidates, scaler, diagnostic=mode == 'leave_one_day_out', root=root) if target else None
            same_site = [row['pci'] for row in numeric if row['site_id'] == observation['site_id']]
            rows.append(dict(id=observation['id'], site_id=observation['site_id'], day=day.isoformat(), actual=observation['overall_pci'],
                             pci=prediction['pci'] if prediction else None,
                             reason_codes=prediction['reason_codes'] if prediction else ['target_environment_unavailable'],
                             global_baseline=median([row['pci'] for row in numeric]) if numeric else None,
                             site_baseline=median(same_site) if same_site else None))
    return dict(schema_version='1.0', mode=mode, operational_forecast=operational,
                temperature_bias=None, tuning='fixed_versioned_config', folds=folds, rows=rows,
                metrics=metrics(rows, config['large_error_threshold']),
                sites={site: metrics([row for row in rows if row['site_id'] == site], config['large_error_threshold']) for site in sorted({row['site_id'] for row in rows})})


def evaluate_transfer(context, *, mode='forward', operational=True, root=ROOT):
    """Independent Site and geographic-block diagnostics, with explicit temporal provenance."""
    import math
    from bunaken_engine.transfer import predict_transfer, transfer_configuration, transfer_features
    from bunaken_engine.model_data import trusted_configuration
    from bunaken_engine.snapshots import canonical, digest, validate
    if mode not in {'forward', 'leave_one_site_out', 'spatial_block_forward'}:
        raise ValueError('invalid_transfer_validation_mode')
    validate('model-context', context, root)
    trusted_configuration(context, root)
    if mode == 'leave_one_site_out': operational = False
    bundles = checked_bundles(context['training_bundles'], root=root)
    if operational:
        bundles = [bundle for bundle in bundles if bundle.get('storage_evidence', {}).get('storage_verified')]
    history = context['observations']
    observations = latest_revisions(history, cutoff=context['cutoff'], root=root)
    truth = [row for row in observations if row['record_status'] in {'active', 'corrected'} and row['use_for_model'] and
             row['label_scope'] == 'dive_overall' and row['observer_id'] == context['observer'] and
             row['rubric_version'] == context['rubric'] and finite(row['overall_pci']) and row['representative_depth_m'] == 18 and
             row['zone_id'] is None]
    config = transfer_configuration(root)
    geometry = load_geometry(root)
    blocks = {}
    for point in geometry['sites']:
        if finite(point['lat']) and finite(point['lon']):
            # Fixed 3km geographic grid is a validation partition, never a geometry multiplier group.
            blocks[point['site_id']] = (math.floor(point['lat'] * 111.195 / config['spatial_block_km']),
                                      math.floor(point['lon'] * 111.195 / config['spatial_block_km']))
    partitions = defaultdict(list)
    for row in truth:
        day = wita_date(row['start_at']).isoformat()
        key = day if mode == 'forward' else row['site_id'] if mode == 'leave_one_site_out' else (day, blocks.get(row['site_id']))
        partitions[key].append(row)
    names = [name for group in transfer_features(config)['groups'].values() for name in group['features']]
    rows, folds = [], []
    for key, test in sorted(partitions.items(), key=lambda item: str(item[0])):
        day = wita_date(test[0]['start_at'])
        held_sites = set() if mode == 'forward' else {test[0]['site_id']} if mode == 'leave_one_site_out' else {
            site for site, block in blocks.items() if block == key[1]}
        if mode == 'spatial_block_forward' and key[1] is None:
            held_sites = {row['site_id'] for row in test}
        cutoff = context['cutoff'] if mode == 'leave_one_site_out' else day_cutoff(day) if operational else (
            datetime.combine(day, time(), tzinfo=WITA).astimezone(timezone.utc).isoformat())
        test_ids = {row['id'] for row in test}
        training = [row for row in latest_revisions(history, cutoff=cutoff, root=root) if row['id'] not in test_ids and
                    row['site_id'] not in held_sites and (mode == 'leave_one_site_out' or wita_date(row['start_at']) < day)]
        candidates, _ = eligible_candidates(training, bundles, context['observer'], context['rubric'], cutoff, root=root)
        numeric = [row for row in candidates if finite(row['pci'])]
        scaler_bundles = [{**bundle, 'features': [row for row in bundle['features'] if row['site_id'] not in held_sites]} for bundle in bundles]
        scaler = build_scaler(environment_rows(scaler_bundles), names, cutoff)
        folds.append(dict(partition=str(key), cutoff=cutoff, test_ids=sorted(test_ids), held_sites=sorted(held_sites),
                          training_ids=sorted(row['id'] for row in candidates), training_sites=sorted({row['site_id'] for row in candidates}),
                          training_days=sorted({row['day'] for row in candidates}), scaler_sha256=digest(canonical(scaler)),
                          scaler_row_count=scaler['row_count']))
        for observation in test:
            target = validation_target(observation, bundles, cutoff, operational=operational, root=root)
            estimate = predict_transfer(target, candidates, scaler, diagnostic=mode == 'leave_one_site_out', root=root) if target else None
            donor_labels = [row['pci'] for row in numeric if row['site_id'] != observation['site_id']]
            # Report the baseline on the same predicted rows, with the same training label pool.
            rows.append(dict(id=observation['id'], site_id=observation['site_id'], day=wita_date(observation['start_at']).isoformat(),
                             actual=observation['overall_pci'], pci=estimate['prediction']['pci'] if estimate else None,
                             reason_codes=estimate['prediction']['reason_codes'] if estimate else ['target_environment_unavailable'],
                             donor_sites=estimate['donor_sites'] if estimate else [], global_baseline=median(donor_labels) if donor_labels else None,
                             site_baseline=None))
    return dict(schema_version='1.0', model_version=config['version'], config_sha256=digest(canonical(config)),
                model_context_sha256=digest(canonical(context)), mode=mode, operational_forecast=operational,
                validation_status='unvalidated', tuning='fixed_versioned_config', spatial_block_km=config['spatial_block_km'],
                folds=folds, rows=rows, metrics=metrics(rows, None),
                sites={site: metrics([row for row in rows if row['site_id'] == site], None) for site in sorted({row['site_id'] for row in rows})})
