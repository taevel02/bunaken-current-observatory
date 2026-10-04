"""Validate a complete immutable web release before replacing its single pointer."""
import argparse
import gzip
import json
from pathlib import Path
from uuid import uuid4

from bunaken_engine.registry import ROOT, load_sources, load_geometry, read_json
from bunaken_engine.snapshots import canonical, digest, validate, make_bundle, SnapshotError
from bunaken_engine.sources import utc_now


def build_release(source_commit, *, manifest_path=None, observations=None, root=ROOT, release_id=None):
    predictions, tides, environment_samples, snapshot_ids = [], [], [], []
    first = last = source_generated = None
    source_status = {}
    if manifest_path:
        manifest = read_json(manifest_path)
        features = json.loads(gzip.decompress((manifest_path.parent/'features.json.gz').read_bytes()))
        predictions = json.loads(gzip.decompress((manifest_path.parent/'forecast.json.gz').read_bytes()))
        make_bundle(manifest, features, predictions, root=root, kind=manifest['kind'])
        if manifest['geometry_hash'] != digest(canonical(load_geometry(root))):
            raise SnapshotError('release_geometry_mismatch')
        if manifest['kind'] != 'snapshot':
            raise SnapshotError('analysis_is_not_public_forecast')
        tides, environment_samples = public_samples(manifest['samples'], root=root)
        snapshot_ids = [manifest['snapshot_id']]
        first,last = manifest['valid_start'],manifest['valid_end']
        source_generated = manifest['created_at']
        source_status = manifest['source_status']
    sites = read_json(root/'packages/contracts/data/sites.json')
    sources = public_source_metadata(source_status, root=root)
    payload = dict(schema_version='1.1',forecast_kind='experimental',generated_at=utc_now(),source_generated_at=source_generated,valid_start=first,valid_end=last,
        sites=[{key:s[key] for key in ('id','slug','name_ko','name_en','lat','lon','reference_depth_m','geometry_status')} for s in sites],
        predictions=predictions,tides=tides,environment_samples=environment_samples,observations=[] if observations is None else observations,sources=sources,
        anchor_similarity=dict(value=None,environment_restored=False,validated=False,reason_codes=['anchor_environment_unavailable']))
    validate_payload(payload,root=root)
    release_id=release_id or str(uuid4())
    prefix=f'web/releases/{release_id}'
    raw=gzip.compress(canonical(payload),mtime=0)
    if len(raw)>1_250_000 or len(canonical(payload))>10_000_000:
        raise SnapshotError('release_size_exceeded')
    release=dict(release_id=release_id,schema_version='1.1',generated_at=payload['generated_at'],source_data_commit_sha=source_commit,snapshot_ids=snapshot_ids,files=[dict(path='dashboard.json.gz',sha256=digest(raw))],status='published')
    validate('release',release,root)
    pointer=dict(schema_version='1.0',release_id=release_id,manifest_sha256=digest(canonical(release)))
    validate('latest',pointer,root)
    return release,{prefix+'/dashboard.json.gz':raw,prefix+'/manifest.json':canonical(release),'web/latest.json':canonical(pointer)}


def public_source_metadata(status, *, root=ROOT):
    registry = load_sources(root)
    return [dict(id=key, dataset=source['dataset'], version=source['dataset_version'],
                 attribution=source['redistribution']['attribution'], license_url=source['redistribution']['license_url'],
                 public_export_allowed=source['redistribution']['derived_allowed'],
                 reason_codes=sorted(set(status.get(key, {}).get('reason_codes', []) +
                     ([] if source['redistribution']['derived_allowed'] else ['source_redistribution_unverified']))))
            for key, source in registry.items()]


def public_samples(samples, *, root=ROOT):
    """Only licensed point samples from the same immutable snapshot."""
    from bunaken_engine.registry import export_allowed
    registry = load_sources(root)
    permitted = [row for row in samples if row['source'] in registry and export_allowed(registry[row['source']], [row['variable']])]
    return ([row for row in permitted if row['variable'] == 'tide_height'],
            [row for row in permitted if row['variable'] != 'tide_height'])


def validate_payload(payload, *, root=ROOT):
    from bunaken_engine.registry import export_allowed
    from bunaken_engine.features import instant
    validate('dashboard',payload,root)
    expected={s['id'] for s in read_json(root/'packages/contracts/data/sites.json')}
    identities=[s['id'] for s in payload['sites']]
    if set(identities)!=expected or len(identities)!=len(set(identities)):
        raise SnapshotError('public_site_identity_invalid')
    registry=load_sources(root)
    known={s['id']:s for s in read_json(root/'packages/contracts/data/sites.json')}
    if any(any(row[key]!=known[row['id']][key] for key in row) for row in payload['sites']):
        raise SnapshotError('release_geometry_mismatch')
    for row in payload['tides'] + payload.get('environment_samples', []):
        source=registry.get(row['source'])
        if source is None or source['variables'].get(row['variable'])!=row['unit'] or row['product']!=source['product'] or row['dataset']!=source['dataset'] or not export_allowed(source,[row['variable']]) or row.get('site_id') not in expected:
            raise SnapshotError('public_source_forbidden')
    if any(row['variable']!='tide_height' for row in payload['tides']) or any(row['variable']=='tide_height' for row in payload.get('environment_samples', [])):
        raise SnapshotError('public_source_forbidden')
    if payload['anchor_similarity']['value'] is not None and not payload['anchor_similarity']['environment_restored']:
        raise SnapshotError('anchor_environment_unavailable')
    if payload['tides'] or payload['predictions'] or payload.get('environment_samples'):
        if not payload['source_generated_at'] or not payload['valid_start'] or not payload['valid_end'] or instant(payload['valid_start'])>=instant(payload['valid_end']):
            raise SnapshotError('public_source_time_missing')
    for row in payload['predictions']:
        if row['site_id'] not in expected:
            raise SnapshotError('public_site_identity_invalid')
        if row['pci'] is not None and (row['prediction_status'] == 'insufficient' or row['support'] == 'insufficient' or
            row['distinct_days'] < 3 or row['n_eff'] < 2 or row['same_site_days'] < 1 or
            row['feature_coverage'].get('total',0)+1e-12 < .8 or row['reason_codes']):
            raise SnapshotError('public_numeric_gate_invalid')
    observation_ids=[row['id'] for row in payload['observations']]
    if len(observation_ids)!=len(set(observation_ids)) or any(row['site_id'] not in expected for row in payload['observations']):
        raise SnapshotError('public_site_identity_invalid')


def main():
    cli=argparse.ArgumentParser(description='Validated web release; default is private local output only.')
    cli.add_argument('--source-data-commit',required=True)
    cli.add_argument('--snapshot',type=Path)
    cli.add_argument('--observations',type=Path)
    cli.add_argument('--output',type=Path,required=True)
    cli.add_argument('--publish',action='store_true')
    args=cli.parse_args()
    try:
        store=None
        if args.publish:
            from bunaken_engine.__main__ import store_from_env
            store=store_from_env()
        if args.output.exists():
            if not args.publish:raise ValueError('release_output_exists')
            pointer=read_json(args.output/'web/latest.json');validate('latest',pointer)
            prefix=f"web/releases/{pointer['release_id']}"
            paths=['web/latest.json',prefix+'/manifest.json',prefix+'/dashboard.json.gz']
            files={path:(args.output/path).read_bytes() for path in paths}
            release=json.loads(files[prefix+'/manifest.json'])
        else:
            observations=read_json(args.observations) if args.observations else store.current_observations(args.source_data_commit) if store else []
            release,files=build_release(args.source_data_commit,manifest_path=args.snapshot,observations=observations)
            args.output.mkdir(parents=True)
            for path,raw in files.items():
                destination=args.output/path;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(raw)
        if store:
            store.publish_release(files,args.source_data_commit)
        print(json.dumps(dict(release_id=release['release_id'],local_output=True,published=args.publish)))
    except Exception as error:
        print(json.dumps(dict(status='failed',error_type=type(error).__name__)))
        raise SystemExit(1) from None


if __name__ == '__main__':main()
