"""Reusable, hash-pinned tidal ephemeris. Never stores or fetches a raw atlas."""
import argparse
import gzip
from io import BytesIO
import json
import os
from pathlib import Path
import re
import subprocess
from datetime import timedelta

from bunaken_engine.features import instant, finite
from bunaken_engine.registry import ROOT, load_geometry, load_sources, export_allowed
from bunaken_engine.snapshots import canonical, digest
from bunaken_engine.sources import SourceError, sample, utc_now

MAX_BYTES = 4_000_000


def prepare(root, config, validation, start, days, output):
    from bunaken_engine.fes_validation import provenance
    from bunaken_engine.fes_research import evaluate
    from bunaken_engine.fes_atlas import sha256
    from importlib.metadata import version
    if not 1 <= days <= 90 or output.exists():
        raise ValueError('fes_cache_request_invalid')
    sites = load_geometry(root)['sites']
    source = load_sources(root)['fes-height']
    if not export_allowed(source, ['tide_height']):
        raise ValueError('fes_cache_export_forbidden')
    if any(provenance(config, site, str(validation)) != (True, True) for site in sites):
        raise ValueError('fes_cache_conformance_unverified')
    first = instant(start) - timedelta(hours=2)
    times = [first + timedelta(minutes=30*i) for i in range(days*48+9)]
    values = evaluate(config.parent, sites, times)
    if any(not finite(value) or flag <= 0 for rows in values.values() for value, flag in rows):
        raise ValueError('fes_cache_undefined')
    payload = {site['site_id']: [value for value, _ in values[site['site_id']]] for site in sites}
    raw = gzip.compress(canonical(payload), mtime=0)
    if len(raw) > MAX_BYTES:
        raise ValueError('fes_cache_too_large')
    proof = json.loads(validation.read_bytes())
    generated = utc_now()
    manifest = dict(schema_version='1.0', kind='tidal_ephemeris', generated_at=generated,
                    valid_start=times[0].isoformat().replace('+00:00', 'Z'),
                    valid_end=times[-1].isoformat().replace('+00:00', 'Z'), interval_seconds=1800,
                    sample_count=len(times), geometry_sha256=digest(canonical(load_geometry(root))),
                    source_sha256=digest(canonical(source)), atlas_sha256=proof['atlas_sha256'],
                    config_sha256=sha256(config), generator_sha256=sha256(Path(__file__)),
                    code_hashes=proof['code_hashes'], runtime_versions=proof['runtime_versions'],
                    pyfes_version=version('pyfes'), conformance=json.loads((validation.parent/'conformance.json').read_bytes()),
                    artifact_sha256=digest(raw), attribution=source['redistribution']['attribution'])
    # Detect input changes during generation without reclassifying sea accuracy as conformance.
    if any(provenance(config, site, str(validation)) != (True, True) for site in sites):
        raise ValueError('fes_cache_inputs_changed')
    output.mkdir(parents=True)
    (output/'manifest.json').write_bytes(canonical(manifest))
    (output/'heights.json.gz').write_bytes(raw)
    pin = dict(schema_version='1.0', path=f"tides/ephemerides/{digest(canonical(manifest))}",
               manifest_sha256=digest(canonical(manifest)), artifact_sha256=digest(raw))
    (output/'pin.json').write_bytes(canonical(pin))
    return pin


def verify(directory, root=ROOT):
    pin = json.loads((root/'config/fes-derived.json').read_bytes())
    if set(pin) != {'schema_version','path','manifest_sha256','artifact_sha256'} or pin['schema_version'] != '1.0':
        raise SourceError('fes_cache_pin_invalid')
    if not re.fullmatch(r'tides/ephemerides/[a-f0-9]{64}', pin['path']):
        raise SourceError('fes_cache_pin_invalid')
    raw_manifest = (directory/'manifest.json').read_bytes()
    raw = (directory/'heights.json.gz').read_bytes()
    if len(raw) > MAX_BYTES or digest(raw_manifest) != pin['manifest_sha256'] or digest(raw) != pin['artifact_sha256']:
        raise SourceError('fes_cache_hash_mismatch')
    manifest = json.loads(raw_manifest)
    if manifest['kind'] != 'tidal_ephemeris' or manifest['schema_version'] != '1.0' or manifest['artifact_sha256'] != digest(raw):
        raise SourceError('fes_cache_manifest_invalid')
    if manifest['geometry_sha256'] != digest(canonical(load_geometry(root))) or manifest['source_sha256'] != digest(canonical(load_sources(root)['fes-height'])):
        raise SourceError('fes_cache_configuration_mismatch')
    hashes = {**manifest['code_hashes'], 'fes_cache.py': manifest['generator_sha256']}
    if any(not re.fullmatch(r'[a-z_]+\.py', name) or digest((Path(__file__).parent/name).read_bytes()) != expected for name, expected in hashes.items()):
        raise SourceError('fes_cache_code_mismatch')
    report = manifest['conformance']
    if report['passed'] is not True or report['reference'] != 'LIBFES 2.9.7' or report['rejected'] != 0 or type(report['comparisons']) is not int or report['comparisons'] <= 0 or report['tolerance_m'] != .001 or not finite(report['max_absolute_difference_m']) or not 0 <= report['max_absolute_difference_m'] <= .001:
        raise SourceError('fes_cache_conformance_unverified')
    if instant(manifest['generated_at']) > instant(utc_now()):
        raise SourceError('fes_cache_generation_in_future')
    count = manifest['sample_count']
    if manifest['interval_seconds'] != 1800 or type(count) is not int or not 1 <= count <= 90*48+9 or (instant(manifest['valid_end'])-instant(manifest['valid_start'])).total_seconds() != (count-1)*1800:
        raise SourceError('fes_cache_time_axis_invalid')
    with gzip.GzipFile(fileobj=BytesIO(raw)) as stream:
        decoded = stream.read(8_000_001)
    if len(decoded) > 8_000_000:
        raise SourceError('fes_cache_too_large')
    values = json.loads(decoded)
    if set(values) != {site['site_id'] for site in load_geometry(root)['sites']} or any(not isinstance(series,list) or len(series) != count or any(not finite(value) for value in series) for series in values.values()):
        raise SourceError('fes_cache_shape_invalid')
    return manifest, values


class TideEphemeris:
    def __init__(self, directory, root=ROOT):
        try:
            self.manifest, self.values = verify(directory, root)
            self.root = root
        except SourceError:
            raise
        except (OSError, ValueError, KeyError, TypeError, OverflowError):
            raise SourceError('fes_cache_unavailable') from None

    def collect(self, source, geometry, start, end):
        expected = next((site for site in load_geometry(self.root)['sites'] if site['site_id'] == geometry['site_id']), None)
        if geometry != expected or source != load_sources(self.root)['fes-height'] or not export_allowed(source,['tide_height']):
            raise SourceError('fes_cache_configuration_mismatch')
        first = instant(self.manifest['valid_start'])
        offsets = [(instant(at)-first).total_seconds()/1800 for at in (start,end)]
        if any(offset != int(offset) for offset in offsets) or not 0 <= offsets[0] <= offsets[1] < self.manifest['sample_count']:
            raise SourceError('fes_cache_outside_horizon')
        rows = []
        for index in range(int(offsets[0]), int(offsets[1])+1):
            at = (first+timedelta(minutes=30*index)).isoformat().replace('+00:00','Z')
            row = sample(source, geometry, 'tide_height', self.values[geometry['site_id']][index], at,
                         self.manifest['generated_at'], version='FES2022b/ephemeris/'+self.manifest['artifact_sha256'],
                         flags=['precomputed_tidal_ephemeris'])
            row['interpolation_method'] = 'bounded_harmonic_bilinear'
            rows.append(row)
        return rows


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--root', type=Path, default=Path.cwd())
    commands = cli.add_subparsers(dest='command', required=True)
    make = commands.add_parser('prepare')
    make.add_argument('--start', required=True)
    make.add_argument('--days', type=int, default=60)
    make.add_argument('--output', type=Path, required=True)
    for operation in ('fetch','publish','check'):
        sub = commands.add_parser(operation)
        sub.add_argument('--directory', type=Path, required=True)
    args = cli.parse_args()
    try:
        if args.command == 'prepare':
            result = prepare(args.root, Path(os.environ['FES_CONFIG_PATH']), Path(os.environ['FES_VALIDATION_MANIFEST_PATH']), args.start, args.days, args.output)
        else:
            pin = json.loads((args.root/'config/fes-derived.json').read_bytes())
            from bunaken_engine.__main__ import store_from_env
            if args.command == 'fetch':
                if not re.fullmatch(r'tides/ephemerides/[a-f0-9]{64}',pin['path']):
                    raise SourceError('fes_cache_pin_invalid')
                store = store_from_env(); head = store.head()
                args.directory.mkdir(parents=True,exist_ok=False)
                for name in ('manifest.json','heights.json.gz'):
                    raw = store.read(pin['path']+'/'+name,head)
                    if raw is None: raise SourceError('fes_cache_unavailable')
                    (args.directory/name).write_bytes(raw)
            verify(args.directory,args.root)
            result = {'status':'verified','path':pin['path']}
            if args.command == 'publish':
                dirty = subprocess.run(['git','status','--porcelain'],cwd=args.root,capture_output=True,text=True,check=True).stdout
                if dirty: raise SourceError('code_commit_unverified_or_dirty')
                files = {pin['path']+'/'+name:(args.directory/name).read_bytes() for name in ('manifest.json','heights.json.gz')}
                result['storage_commit'] = store_from_env().insert(files,'data: store verified tidal ephemeris')
        print(json.dumps(result,sort_keys=True))
        return 0
    except (SourceError, OSError, ValueError, KeyError, TypeError):
        print(json.dumps({'error':'fes_cache_validation_failed'}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
