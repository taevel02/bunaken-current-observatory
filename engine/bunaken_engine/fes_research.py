"""Private, environment-only tidal history and independent LIBFES comparison."""
import argparse
import ctypes
from datetime import datetime, timedelta, timezone
import json
from importlib.metadata import version as package_version
from pathlib import Path
from tempfile import NamedTemporaryFile

from bunaken_engine.features import build_scaler, finite, instant, interpolate
from bunaken_engine.fes_atlas import WAVES, sha256
from bunaken_engine.registry import load_geometry, read_json


def verify_atlas(directory):
    manifest = read_json(directory / 'atlas-manifest.json')
    config = directory / 'fes2022.yaml'
    if manifest.get('dataset') != 'FES2022b' or manifest.get('unit') != 'cm':
        raise ValueError('atlas_metadata_invalid')
    if sha256(config) != manifest['config_sha256']:
        raise ValueError('atlas_config_changed')
    files = manifest['files']
    if len(files) != len(WAVES) or {item['wave'] for item in files} != set(WAVES):
        raise ValueError('atlas_constituents_incomplete')
    paths = read_json(config)['tide']['cartesian']['paths']
    if set(paths) != set(WAVES):
        raise ValueError('atlas_paths_incomplete')
    for item in files:
        if item['file'] != item['wave'].lower()+'_fes2022.nc':
            raise ValueError('atlas_filename_invalid')
        expected = (directory / 'regional' / item['file']).resolve()
        if Path(paths[item['wave']]).resolve() != expected or sha256(expected) != item['regional_sha256']:
            raise ValueError('atlas_file_changed')
    return manifest


def evaluate(directory, sites, times):
    import numpy as np
    import pyfes
    config = pyfes.config.load(str(directory / 'fes2022.yaml'))
    dates = np.array([at.astimezone(timezone.utc).replace(tzinfo=None) for at in times], dtype='datetime64[us]')
    result = {}
    for site in sites:
        tide, lp, flags = pyfes.evaluate_tide(config.models['tide'], dates,
            np.full(len(times), site['lon']), np.full(len(times), site['lat']), settings=config.settings)
        result[site['site_id']] = [(float(a+b)*.01 if flag > 0 and finite(float(a+b)) else None, int(flag))
                                  for a,b,flag in zip(tide,lp,flags)]
    return result


def compare(directory, sites, times, values, library):
    """Numerical implementation check, not validation of sea-level forecast accuracy."""
    lib = ctypes.CDLL(str(library.resolve()))
    ptr = ctypes.c_void_p
    double = ctypes.c_double
    lib.fes_new.argtypes = [ctypes.POINTER(ptr), ctypes.c_int, ctypes.c_int, ctypes.c_char_p]
    lib.fes_new.restype = ctypes.c_int
    lib.fes_core.argtypes = [ptr,double,double,double,ctypes.POINTER(double),ctypes.POINTER(double)]
    lib.fes_core.restype = ctypes.c_int
    lib.fes_min_number.argtypes = [ptr]
    lib.fes_min_number.restype = ctypes.c_int
    lib.fes_delete.argtypes = [ptr]
    lines = []
    for wave in WAVES:
        prefix = 'TIDE_' + wave.upper()
        for key,value in [('FILE',directory.resolve()/'regional'/(wave.lower()+'_fes2022.nc')),
                          ('LATITUDE','lat'),('LONGITUDE','lon'),('AMPLITUDE','amplitude'),('PHASE','phase')]:
            lines.append(f'{prefix}_{key} = {value}')
    # Official LIBFES 2.9.7 FES2022b configuration excludes the atlas MSf from LPE.
    lines.append('TIDE_MSF_LP_DYNAMIC = 1')
    errors = []
    rejected = 0
    epoch = datetime(1950,1,1,tzinfo=timezone.utc)
    with NamedTemporaryFile(mode='w',suffix='.ini') as config:
        config.write('\n'.join(lines)+'\n')
        config.flush()
        # LIBFES caches nodal factors for 24 hours; compare a cold evaluation at
        # each timestamp with PyFES's per-timestamp nodal corrections.
        for index,at in enumerate(times):
            handle = ptr()
            if lib.fes_new(ctypes.byref(handle),0,1,config.name.encode()):
                lib.fes_delete(handle)
                raise ValueError('reference_initialization_failed')
            try:
                for site in sites:
                    value,flag = values[site['site_id']][index]
                    h,lp = double(),double()
                    status = lib.fes_core(handle,site['lat'],site['lon'],(at-epoch).total_seconds()/86400,ctypes.byref(h),ctypes.byref(lp))
                    if status or lib.fes_min_number(handle) <= 0 or flag <= 0 or value is None:
                        rejected += 1
                        continue
                    reference = (h.value+lp.value)*.01
                    if not finite(reference):
                        rejected += 1
                        continue
                    errors.append(abs(reference-value))
            finally:
                lib.fes_delete(handle)
    # Millimetre tolerance is a numerical conformance criterion only.
    return dict(reference='LIBFES 2.9.7',reference_library_sha256=sha256(library),
                evaluation_mode='fresh_reference_session_per_timestamp',comparisons=len(errors),rejected=rejected,tolerance_m=.001,
                max_absolute_difference_m=max(errors,default=None),
                passed=bool(errors) and rejected == 0 and max(errors) <= .001)


def history(directory, root, start, days, library, output):
    if not 1 <= days <= 31:
        raise ValueError('history_days_out_of_range')
    first = instant(start)
    last = first+timedelta(days=days)
    if last > datetime.now(timezone.utc):
        raise ValueError('history_future_interval')
    if output.exists():
        raise ValueError('history_output_exists')
    code_paths = {name:Path(__file__).parent/name for name in ('fes_research.py','fes_atlas.py','features.py','registry.py')}
    input_paths = {'atlas_manifest':directory/'atlas-manifest.json','atlas_config':directory/'fes2022.yaml',
                   'geometry':root/'config/geometry.json','features':root/'config/features.json',
                   'sites':root/'packages/contracts/data/sites.json',**code_paths}
    input_hashes = {name:sha256(path) for name,path in input_paths.items()}
    atlas = verify_atlas(directory)
    sites = load_geometry(root)['sites']
    if any(site['status'] not in {'coordinates_verified','verified'} for site in sites):
        raise ValueError('history_coordinates_unverified')
    # Two-hour support around 60-minute windows, computed at native evaluation interval.
    times = [first+timedelta(minutes=30*i)-timedelta(hours=1) for i in range(days*48+5)]
    values = evaluate(directory,sites,times)
    comparison_times = [first+timedelta(hours=i*3) for i in range(days*8)]
    comparison_values = {key:[series[2+i*6] for i in range(days*8)] for key,series in values.items()}
    conformance = compare(directory,sites,comparison_times,comparison_values,library)
    if not conformance['passed']:
        output.mkdir(parents=True,mode=0o700)
        (output/'conformance.json').write_text(json.dumps(conformance,indent=2)+'\n')
        raise ValueError('reference_conformance_failed')
    retrieved = datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    registry = read_json(root/'config/features.json')
    names = [name for group in registry['groups'].values() for name in group['features']]
    rows = []
    site_rows = []
    for site in sites:
        row_start = len(rows)
        points = [(at.timestamp(),value) for at,(value,_) in zip(times,values[site['site_id']])]
        for i in range(days*48-1):
            at = first+timedelta(minutes=30*i)
            center = at+timedelta(minutes=30)
            before = interpolate(points,(center-timedelta(hours=1)).timestamp())
            after = interpolate(points,(center+timedelta(hours=1)).timestamp())
            window = [interpolate(points,(at+timedelta(minutes=step)).timestamp()) for step in (0,30,60)]
            features = {name:None for name in names}
            features['tide_rate_m_per_hour'] = (after-before)/2 if before is not None and after is not None else None
            features['tide_excursion_m'] = max(window)-min(window) if all(finite(value) for value in window) else None
            rows.append(dict(valid_time=at.isoformat().replace('+00:00','Z'),retrieved_at=retrieved,issued_at=None,
                             features=features,dataset='FES2022b/ocean_tide_20241025',
                             version=atlas['config_sha256'],geometry_version=site['version']))
        site_rows.append(dict(site_id=site['site_id'],lat=site['lat'],lon=site['lon'],
                              geometry_version=site['version'],row_start=row_start,row_end_exclusive=len(rows)))
    scaler = build_scaler(rows,names,retrieved)
    for name,item in scaler['features'].items():
        if not item['enabled'] and name not in {'tide_rate_m_per_hour','tide_excursion_m'}:
            item['reason'] = registry['disabled'].get(name,'historical_source_or_geometry_unverified')
    if any(sha256(path) != input_hashes[name] for name,path in input_paths.items()):
        raise ValueError('history_inputs_changed')
    verify_atlas(directory)
    output.mkdir(parents=True,mode=0o700)
    for name,data in [('rows.json',rows),('scaler.json',scaler),('conformance.json',conformance),('site-rows.json',site_rows)]:
        (output/name).write_text(json.dumps(data,indent=2,allow_nan=False)+'\n')
    manifest = dict(kind='historical_environment_analysis',partial=True,site_count=len(sites),
                    start=start,end=last.isoformat(),retrieved_at=retrieved,cutoff=retrieved,
                    atlas_sha256=input_hashes['atlas_manifest'],
                    geometry_sha256=input_hashes['geometry'],site_registry_sha256=input_hashes['sites'],
                    feature_version=registry['version'],feature_registry_sha256=input_hashes['features'],
                    runtime_versions={name:package_version(name) for name in ('pyfes','numpy','netCDF4','xarray')},
                    code_hashes={name:input_hashes[name] for name in code_paths},
                    files={name:sha256(output/name) for name in ('rows.json','scaler.json','conformance.json','site-rows.json')},
                    note='No labels, PCI, operational forecast or pre-retrieval validation eligibility')
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--atlas',type=Path,required=True)
    parser.add_argument('--root',type=Path,default=Path.cwd())
    parser.add_argument('--start',required=True,help='timezone-qualified inclusive interval start')
    parser.add_argument('--days',type=int,default=30)
    parser.add_argument('--reference-library',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    try:
        result = history(args.atlas,args.root,args.start,args.days,args.reference_library,args.output)
        print(json.dumps(dict(status='completed',site_count=result['site_count'],partial=True)))
    except Exception as error:
        print(json.dumps(dict(status='failed',error_type=type(error).__name__)))
        raise SystemExit(1) from None


if __name__ == '__main__':
    main()
