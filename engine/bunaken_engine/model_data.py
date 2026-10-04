"""Server-side eligibility and immutable environment links, separate from raw notes."""
import gzip
import json
import re
import shutil
from contextlib import contextmanager
from tempfile import TemporaryDirectory
from pathlib import Path
from datetime import timedelta

from bunaken_engine.features import extract_window, finite, instant, build_scaler
from bunaken_engine.registry import ROOT, read_json, resolve_geometry, load_geometry, load_sources, usable_geometry
from bunaken_engine.snapshots import canonical, digest, validate, make_bundle
from bunaken_engine.time import wita_date


def latest_revisions(observations, *, cutoff=None, root=ROOT):
    latest = {}
    seen = {}
    for observation in observations:
        validate('observation-revision', observation, root)
        if cutoff is not None and instant(observation['updated_at']) > instant(cutoff):
            continue
        identity = (observation['id'], observation['revision'])
        if identity in seen and seen[identity] != digest(canonical(observation)):
            raise ValueError('conflicting_observation_revision')
        seen[identity] = digest(canonical(observation))
        previous = latest.get(observation['id'])
        if previous is None or observation['revision'] > previous['revision']:
            latest[observation['id']] = observation
    return [latest[key] for key in sorted(latest)]


def read_bundle(path, *, root=ROOT):
    manifest = read_json(path)
    features = json.loads(gzip.decompress((path.parent / 'features.json.gz').read_bytes()))
    forecast = json.loads(gzip.decompress((path.parent / 'forecast.json.gz').read_bytes()))
    make_bundle(manifest, features, forecast, root=root, kind=manifest['kind'])
    if manifest.get('model_context') is not None:
        # Derived environment-only projection: preserve origin hash; omit prior labels/models.
        origin = digest(canonical(manifest))
        configuration=manifest['model_context']['configuration']
        manifest = {key: value for key, value in manifest.items() if key not in {'model_context', 'model_context_sha256'}}
        manifest['schema_version'] = '1.1'
        manifest['artifact_hashes'] = {'features.json.gz': digest(gzip.compress(canonical(features), mtime=0)),
                                     'forecast.json.gz': digest(gzip.compress(canonical([]), mtime=0))}
        return dict(manifest=manifest, features=features, forecast=[], origin_manifest_sha256=origin,environment_configuration=configuration)
    return dict(manifest=manifest, features=features, forecast=forecast)


def checked_bundles(bundles, *, root=ROOT):
    result = []
    identities = {}
    for bundle in bundles:
        if set(bundle) - {'manifest', 'features', 'forecast', 'origin_manifest_sha256', 'storage_evidence','environment_configuration'} or not {'manifest', 'features', 'forecast'}.issubset(bundle):
            raise ValueError('unknown_training_bundle_field')
        manifest = bundle['manifest']
        origin = bundle.get('origin_manifest_sha256')
        if origin is not None and not re.fullmatch('[0-9a-f]{64}', origin):
            raise ValueError('invalid_origin_manifest_hash')
        storage = bundle.get('storage_evidence')
        if storage is not None and (set(storage) != {'storage_verified', 'persisted_at', 'manifest_sha256', 'storage_commit'} or
            storage['storage_verified'] is not True or storage['manifest_sha256'] != (origin or digest(canonical(manifest))) or
            not re.fullmatch('[0-9a-f]{40}', storage['storage_commit'])):
            raise ValueError('invalid_storage_evidence')
        if storage is not None: instant(storage['persisted_at'])
        # Training inputs must not recursively embed other trained model contexts.
        if manifest.get('model_context') is not None:
            raise ValueError('nested_model_context_forbidden')
        configuration=bundle.get('environment_configuration')
        if configuration is not None:
            current_sources=load_sources(root)
            from bunaken_engine.registry import export_allowed
            if any(row['source'] not in current_sources or not export_allowed(current_sources[row['source']],[row['variable']]) for row in manifest['samples']):
                raise ValueError('training_source_export_forbidden')
            with replay_root({'configuration':configuration},root) as replay:
                make_bundle(manifest,bundle['features'],bundle['forecast'],root=replay,kind=manifest['kind'])
        else:
            make_bundle(manifest, bundle['features'], bundle['forecast'], root=root, kind=manifest['kind'])
            bundle={**bundle,'environment_configuration':current_configuration(root)}
        identity = manifest['snapshot_id']
        hashed = digest(canonical(bundle))
        if identity in identities and identities[identity] != hashed:
            raise ValueError('conflicting_training_snapshot')
        if identity not in identities:
            identities[identity] = hashed
            result.append(bundle)
    return sorted(result, key=lambda bundle: bundle['manifest']['snapshot_id'])


def eligible_candidates(observations, bundles, observer, rubric, cutoff, *, root=ROOT):
    """Recompute eligibility; client train_eligible cannot grant access to training."""
    config = read_json(root / 'config/model.json')
    boundary = instant(cutoff)
    candidates, excluded = [], {}
    for observation in latest_revisions(observations, cutoff=cutoff, root=root):
        reason = None
        if observation['record_status'] not in {'active', 'corrected'}: reason = 'inactive_record'
        elif observation['observer_id'] != observer or observation['rubric_version'] != rubric: reason = 'incompatible_observer_rubric'
        elif not observation['use_for_model']: reason = 'model_use_disabled'
        elif observation['label_scope'] != 'dive_overall' and observation['vertical']['direction'] == 'unknown': reason = 'legacy_label_scope'
        elif instant(observation['updated_at']) > boundary: reason = 'revision_after_cutoff'
        elif not finite(observation['representative_depth_m']): reason = 'missing_observation_depth'
        if reason:
            excluded[observation['id']] = reason
            continue
        try: geometry = resolve_geometry(observation['site_id'], observation['zone_id'], root)
        except ValueError:
            excluded[observation['id']]='unknown_site_or_zone'
            continue
        if not usable_geometry(geometry):
            excluded[observation['id']] = 'unverified_geometry'
            continue
        start = instant(observation['start_at'])
        proxy = observation['end_at'] is None
        end = start + timedelta(hours=1) if proxy else instant(observation['end_at'])
        if end <= start or end > boundary:
            excluded[observation['id']] = 'invalid_or_future_interval'
            continue
        available = []
        for bundle in bundles:
            manifest = bundle['manifest']
            if (manifest['status'] != 'succeeded' or instant(manifest['created_at']) > boundary or
                (bundle.get('storage_evidence') and instant(bundle['storage_evidence']['persisted_at']) > boundary) or
                manifest['geometry_hash'] != digest(canonical(load_geometry(root))) or
                instant(manifest['valid_start']) > start or instant(manifest['valid_end']) < end):
                continue
            samples = [row for row in manifest['samples'] if row.get('site_id') == observation['site_id'] and
                       row.get('zone_id') == observation['zone_id']]
            if not samples or any(instant(row['retrieved_at']) > boundary or
                (row.get('issued_at') and instant(row['issued_at']) > boundary) for row in samples):
                continue
            from bunaken_engine.snapshots import assess_sources
            readiness = assess_sources(samples, ['fes-height', 'copernicus-currents'], manifest['created_at'], root,
                                       reference_depth=observation['representative_depth_m'], historical=manifest['kind'] == 'backfill')
            if any(row['status'] != 'succeeded' for row in readiness.values()):
                continue
            window_geometry = {**geometry, 'reference_depth_m': observation['representative_depth_m']}
            window = extract_window(samples, window_geometry, start.isoformat(), end.isoformat())
            if any(not finite(window['values'].get(name)) for name in
                   ('tide_rate_m_per_hour', 'tide_excursion_m', 'current_along_m_s', 'current_cross_m_s', 'current_speed_m_s')):
                continue
            available.append((0 if manifest['kind'] == 'snapshot' else 1, manifest['created_at'], manifest['snapshot_id'], manifest, window,
                              bundle.get('origin_manifest_sha256') or digest(canonical(manifest))))
        if not available:
            excluded[observation['id']] = 'environment_link_unavailable'
            continue
        _, _, _, manifest, window, snapshot_hash = min(available, key=lambda row: row[:3])
        quality = config['quality'][observation['confidence']]
        if proxy or observation['time_precision'] == 'approximate': quality *= config['approximate_time_weight']
        if observation.get('depth_precision') == 'estimated': quality *= config['estimated_depth_weight']
        vertical_events=[]
        if observation['vertical']['direction'] == 'mixed':
            vertical_events=sorted({event['vertical_direction'] for event in observation['peak_events'] if
                event['vertical_direction'] in {'down','up'} and event.get('at') and finite(event.get('depth_m')) and
                start <= instant(event['at']) <= end and event.get('zone_id') == observation['zone_id']})
        numeric_scope=observation['label_scope'] == 'dive_overall'
        if not numeric_scope: excluded[observation['id']]='legacy_label_scope'
        # Explicit Peak direction may corroborate mixed; Peak PCI never enters numeric overall.
        link=dict(schema_version='1.0', observation_id=observation['id'], observation_revision=observation['revision'],
                  observation_sha256=digest(canonical(observation)), snapshot_sha256=snapshot_hash,
                  feature_sha256=digest(canonical(window)), geometry_version=geometry['version'],
                  interval_kind='proxy_60m' if proxy else 'dive_interval', provenance=manifest['kind'])
        validate('environment-link',link,root)
        candidates.append(dict(id=observation['id'], revision=observation['revision'],
            observation_sha256=digest(canonical(observation)), day=wita_date(observation['start_at']).isoformat(),
            start_at=observation['start_at'], end_at=end.isoformat(), site_id=observation['site_id'], zone_id=observation['zone_id'],
            pci=observation['overall_pci'] if numeric_scope else None, vertical=observation['vertical']['direction'], vertical_events=vertical_events,
            values=window['values'], quality_weight=quality, provenance_weight=config['provenance'][manifest['kind']],
            snapshot_id=manifest['snapshot_id'], reference_geometry=geometry['status']=='reference_geometry', environment_link=link))
    return candidates, excluded


def environment_rows(bundles):
    rows = []
    for bundle in bundles:
        manifest = bundle['manifest']
        if manifest['status'] != 'succeeded': continue
        for feature in bundle['features']:
            samples = [row for row in manifest['samples'] if row.get('site_id') == feature['site_id'] and row.get('zone_id') == feature['zone_id']]
            if not samples: continue
            availability=[manifest['created_at']] + [row['retrieved_at'] for row in samples]
            if bundle.get('storage_evidence'): availability.append(bundle['storage_evidence']['persisted_at'])
            rows.append(dict(valid_time=feature['end_at'], retrieved_at=max(availability, key=instant),
                issued_at=max((row['issued_at'] for row in samples if row.get('issued_at')), key=instant, default=None),
                features=feature['values'], dataset=manifest['dataset_versions'], version=manifest['feature_version'], geometry_version=feature['geometry_version']))
    return rows


def prepare_model(observations, bundles, observer, rubric, cutoff, *, root=ROOT):
    bundles = checked_bundles(bundles, root=root)
    candidates, excluded = eligible_candidates(observations, bundles, observer, rubric, cutoff, root=root)
    features = read_json(root / 'config/features.json')
    names = [name for definition in features['groups'].values() for name in definition['features']]
    scaler = build_scaler(environment_rows(bundles), names, cutoff)
    return candidates, scaler, excluded


def model_context(observations, bundles, observer, rubric, cutoff, *, root=ROOT):
    # Preserve all as-of revisions for historical folds; select latest only at use time.
    latest_revisions(observations, root=root)
    observations = sorted({(row['id'],row['revision']):row for row in observations if instant(row['updated_at']) <= instant(cutoff)}.values(),
                          key=lambda row:(row['id'],row['revision']))
    bundles = checked_bundles(bundles, root=root)
    # Only schema-validated public records enter the manifest. No arbitrary metadata or secrets.
    return dict(schema_version='1.0', observations=observations, training_bundles=bundles,
                observer=observer, rubric=rubric, cutoff=cutoff,
                config_sha256=digest(canonical(read_json(root / 'config/model.json'))),
                feature_config_sha256=digest(canonical(read_json(root / 'config/features.json'))),
                geometry_sha256=digest(canonical(load_geometry(root))),
                configuration=current_configuration(root))


def current_configuration(root=ROOT):
    return dict(model=read_json(root/'config/model.json'), features=read_json(root/'config/features.json'),
                geometry=load_geometry(root), sources=read_json(root/'config/source-registry.json'),
                sites=read_json(root/'packages/contracts/data/sites.json'))


def trusted_configuration(context, root=ROOT):
    configuration=context['configuration']
    if configuration != current_configuration(root):
        # Historical configuration is executable-code policy, never accepted from data alone.
        path=root/'config/model-configurations'/f'{digest(canonical(configuration))}.json'
        if not path.is_file() or read_json(path) != configuration:
            raise ValueError('untrusted_model_configuration')
    model=configuration['model']
    if (model['minimum_labels'] < 3 or model['minimum_days'] < 3 or model['minimum_n_eff'] < 2 or
        model['minimum_coverage'] < .8 or not 1 <= model['maximum_neighbors'] <= 20):
        raise ValueError('model_gate_below_contract_minimum')
    return configuration


@contextmanager
def replay_root(context, root=ROOT):
    configuration=trusted_configuration(context,root)
    with TemporaryDirectory(prefix='bunaken-model-replay-') as folder:
        replay=Path(folder)
        for name in ('json-schema','data'):
            shutil.copytree(root/'packages/contracts'/name, replay/'packages/contracts'/name)
        (replay/'config').mkdir()
        archives=root/'config/model-configurations'
        if archives.is_dir(): shutil.copytree(archives,replay/'config/model-configurations')
        for key,name in [('model','model.json'),('features','features.json'),('geometry','geometry.json'),('sources','source-registry.json')]:
            (replay/'config'/name).write_bytes(canonical(configuration[key]))
        (replay/'packages/contracts/data/sites.json').write_bytes(canonical(configuration['sites']))
        yield replay


def predict_context(context, feature_rows, source_ready, snapshot_id, *, root=ROOT):
    from bunaken_engine.analog import predict
    expected = model_context(context['observations'], context['training_bundles'], context['observer'], context['rubric'], context['cutoff'], root=root)
    if expected != context: raise ValueError('model_context_mismatch')
    candidates, scaler, _ = prepare_model(context['observations'], context['training_bundles'], context['observer'], context['rubric'], context['cutoff'], root=root)
    evidence = None
    if read_json(root / 'config/model.json')['large_error_threshold'] is not None:
        from bunaken_engine.validation import evaluate
        evidence = evaluate(context['observations'], context['training_bundles'], context['observer'], context['rubric'],
                            mode='forward', operational=True, root=root)
    predictions = []
    for feature in feature_rows:
        geometry = resolve_geometry(feature['site_id'], feature['zone_id'], root)
        if instant(context['cutoff']) > instant(feature['start_at']): raise ValueError('model_cutoff_after_target')
        target = dict(**feature, geometry_verified=usable_geometry(geometry), reference_geometry=geometry['status']=='reference_geometry', sources_ready=source_ready,
                      source_snapshot_ids=[snapshot_id])
        prediction=predict(target, candidates, scaler, evidence=evidence, root=root)
        predictions.append(prediction)
    return predictions, digest(canonical(scaler))


def forecast_context(context, features, manifest, *, root=ROOT):
    """Reproduce every target slot and feature from immutable provider samples."""
    validate('model-context',context,root)
    # Frozen data configuration only; executable Python and schemas remain trusted code.
    with replay_root(context,root) as replay:
        return _forecast_context(context,features,manifest,root=replay)


def _forecast_context(context, features, manifest, *, root):
    from bunaken_engine.snapshots import assess_sources
    geometry = load_geometry(root)
    if manifest['geometry_hash'] != digest(canonical(geometry)): raise ValueError('model_geometry_mismatch')
    start = instant(manifest['valid_start']); end = instant(manifest['valid_end'])
    if (end - start).total_seconds() % 86400 or not 1 <= (end-start).days <= 14:
        raise ValueError('invalid_model_horizon')
    lookup = {(row['site_id'], row['zone_id'], instant(row['start_at'])): row for row in features}
    if len(lookup) != len(features): raise ValueError('duplicate_feature_window')
    targets, reproduced = [], []
    for point in geometry['sites'] + geometry['zones']:
        samples = [row for row in manifest['samples'] if row.get('site_id') == point['site_id'] and row.get('zone_id') == point.get('id')]
        readiness = assess_sources(samples, list(load_sources(root)), manifest['created_at'], root,
                                   reference_depth=point['reference_depth_m'], historical=manifest['kind'] == 'backfill')
        ready = {source for source, value in readiness.items() if value['status'] == 'succeeded'}
        usable = [row for row in samples if row['source'] in ready]
        for day in range((end-start).days):
            for slot in range(16):
                at = start + timedelta(days=day, hours=8, minutes=30*slot)
                window = dict(start_at=at.isoformat().replace('+00:00','Z'), end_at=(at+timedelta(hours=1)).isoformat(),
                              values={'reference_depth_m':point['reference_depth_m']}, geometry_version=point['version'], feature_version='environment-v1', disabled_reasons={})
                if usable_geometry(point):
                    window = extract_window(usable, point, at.isoformat(), (at+timedelta(hours=1)).isoformat())
                    row = dict(site_id=point['site_id'], zone_id=point.get('id'), **window)
                    if lookup.get((point['site_id'], point.get('id'), at)) != row:
                        raise ValueError('model_feature_reproduction_mismatch')
                    reproduced.append(row)
                targets.append(dict(site_id=point['site_id'], zone_id=point.get('id'), **window))
    if len(reproduced) != len(features): raise ValueError('unexpected_model_feature_window')
    return predict_context(context, targets, manifest['status'] == 'succeeded', manifest['snapshot_id'], root=root)
