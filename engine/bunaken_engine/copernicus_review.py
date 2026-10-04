"""Private, hash-checked point review. Never accepts a grid or publishes a forecast."""
import argparse
import json
from pathlib import Path

from bunaken_engine.features import finite, profile_value
from bunaken_engine.fes_atlas import sha256
from bunaken_engine.registry import read_json, load_sources, export_allowed, load_geometry
from bunaken_engine.snapshots import canonical, digest


def point_review(directory, output):
    if output.exists(): raise ValueError('immutable_review_output_exists')
    manifest=read_json(directory/'manifest.json')
    if manifest['kind'] != 'private_provider_inspection': raise ValueError('private_inspection_required')
    if manifest['geometry_sha256'] != sha256(Path('config/geometry.json')): raise ValueError('review_geometry_changed')
    for name, expected in manifest['files'].items():
        if Path(name).name != name or sha256(directory/name) != expected: raise ValueError('review_input_hash_mismatch')
    import xarray as xr
    points=read_json(directory/'grid-review.json')
    known={row['site_id'] for row in load_geometry()['sites']}
    if {row['site_id'] for row in points} != known or len(points) != len(known): raise ValueError('review_sites_mismatch')
    sources=load_sources(); rows=[]
    for key, report in manifest['providers'].items():
        if key not in sources or sources[key]['provider'] != 'copernicus' or report['status'] != 'retrieved': continue
        source=sources[key]
        if not export_allowed(source,list(source['variables'])): raise ValueError('review_license_unverified')
        with xr.open_dataset(directory/(key+'.nc')) as dataset:
            for point in points:
                if point['accepted'] or point['bottom_depth_m'] <= 18: raise ValueError('review_grid_not_diagnostic')
                selected=dataset.sel(latitude=point['selected_lat'],longitude=point['selected_lon'])
                for at in selected.time.values:
                    for variable in source['variables']:
                        values=selected[variable].sel(time=at).values
                        value=profile_value(selected.depth.values.tolist(),values.tolist(),18,point['bottom_depth_m'])
                        rows.append(dict(site_id=point['site_id'],source=key,dataset=report['dataset'],version=report['version'],
                                         variable=variable,unit=source['variables'][variable],valid_time=str(at),depth_m=18,value=value,
                                         selected_lat=point['selected_lat'],selected_lon=point['selected_lon'],grid_distance_km=point['distance_km'],
                                         native_depths_m=selected.depth.values.tolist(),interpolation_method='bounded_depth_linear',
                                         source_updated_at=report['source_updated_at'],retrieved_at=manifest['retrieved_at'],
                                         quality_flags=['grid_distance_and_bearings_unverified'],operational_eligible=False))
    result=dict(schema_version='1.0',kind='private_copernicus_point_review',forecast=False,reference_depth_m=18,
                input_manifest_sha256=sha256(directory/'manifest.json'),source_registry_sha256=sha256(Path('config/source-registry.json')),
                attribution=[sources[key]['redistribution']['attribution'] for key in sources if sources[key]['provider']=='copernicus'],
                points=points,samples=rows,finite_samples=sum(finite(row['value']) for row in rows))
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('xb') as handle: handle.write(canonical(result))
    return dict(sites=len(points),samples=len(rows),finite_samples=result['finite_samples'],
                grid_distance_km=dict(min=min(row['distance_km'] for row in points),max=max(row['distance_km'] for row in points)),
                operational_eligible=False,sha256=digest(canonical(result)))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    try: print(json.dumps(point_review(args.input,args.output)))
    except Exception as error:
        print(json.dumps(dict(status='failed',error_type=type(error).__name__)))
        raise SystemExit(1) from None


if __name__=='__main__': main()
