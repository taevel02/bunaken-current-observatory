"""Private bounded provider inspection; unresolved grid geometry stays unresolved."""
import argparse
import contextlib
import io
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode

from bunaken_engine.features import distance_km, finite, instant
from bunaken_engine.registry import load_geometry, load_sources
from bunaken_engine.fes_atlas import sha256
from bunaken_engine.sources import fetch_json, utc_now


def inspect(output, start, days):
    if output.exists() or not 1 <= days <= 31:
        raise ValueError('invalid_research_output_or_days')
    first=instant(start);last=first+timedelta(days=days)
    if last > datetime.now(timezone.utc):raise ValueError('historical_interval_not_ended')
    output.mkdir(parents=True)
    geometry=load_geometry();sites=geometry['sites'];registry=load_sources();reports={}
    # Spatial halo bounds IO only. It is not an allowed scientific grid distance.
    bounds=dict(minimum_latitude=min(s['lat'] for s in sites)-.15,maximum_latitude=max(s['lat'] for s in sites)+.15,minimum_longitude=min(s['lon'] for s in sites)-.15,maximum_longitude=max(s['lon'] for s in sites)+.15,coordinates_selection_method='outside')
    try:
        with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            import copernicusmarine as cm
            credentials=dict(username=os.environ.get('COPERNICUSMARINE_SERVICE_USERNAME'),password=os.environ.get('COPERNICUSMARINE_SERVICE_PASSWORD'))
            if not all(credentials.values()):raise ValueError('provider_credentials_missing')
            bathy=cm.open_dataset(dataset_id='cmems_mod_glo_phy_anfc_0.083deg_static',dataset_version='202211',dataset_part='bathy',variables=['deptho','mask'],**bounds,**credentials).load()
        cells=[]
        for lat in bathy.latitude.values:
            for lon in bathy.longitude.values:
                node=bathy.sel(latitude=lat,longitude=lon);depth=float(node.deptho.values.squeeze())
                if any(value==1 for value in node['mask'].values.flatten()) and finite(depth) and depth>18:
                    cells.append((float(lat),float(lon),depth))
        if not cells:raise ValueError('no_wet_cells')
        selected=[]
        for site in sites:
            lat,lon,bottom=min(cells,key=lambda cell:distance_km(site['lat'],site['lon'],cell[0],cell[1]))
            selected.append(dict(site_id=site['site_id'],selected_lat=lat,selected_lon=lon,bottom_depth_m=bottom,distance_km=distance_km(site['lat'],site['lon'],lat,lon),reference_depth_m=18,accepted=False,reason='grid_distance_and_bearings_unverified'))
        (output/'grid-review.json').write_text(json.dumps(selected,indent=2)+'\n')
        for key,source in registry.items():
            if source['provider']!='copernicus':continue
            try:
                with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
                    catalogue=cm.describe(dataset_id=source['dataset'],show_all_versions=True,disable_progress_bar=True,raise_on_error=True)
                    candidates=[d for p in catalogue.products for d in p.datasets if d.dataset_id==source['dataset']]
                    versions=[v for d in candidates for v in d.versions if v.label==source['dataset_version']]
                    if len(versions)!=1:raise ValueError('configured_version_unavailable')
                    part=versions[0].get_part(None)
                    ds=cm.open_dataset(dataset_id=source['dataset'],dataset_version=source['dataset_version'],dataset_part=part.name,variables=list(source['variables']),start_datetime=first.isoformat(),end_datetime=last.isoformat(),minimum_depth=10,maximum_depth=30,**bounds,**credentials).load()
                    ds.to_netcdf(output/(key+'.nc'))
                reports[key]=dict(status='retrieved',dataset=source['dataset'],version=source['dataset_version'],source_updated_at=str(part.arco_updated_date) if part.arco_updated_date else None,native_depths_m=[float(x) for x in ds.depth.values],time_count=len(ds.time),valid_start=str(ds.time.values[0]),valid_end=str(ds.time.values[-1]),units={name:ds[name].attrs.get('units') for name in source['variables']},sha256=sha256(output/(key+'.nc')),operational_eligible=False,reason_codes=['grid_distance_and_bearings_unverified','source_redistribution_unverified'])
            except Exception as error:
                reports[key]=dict(status='failed',error_type=type(error).__name__,operational_eligible=False)
    except Exception as error:
        reports['copernicus']=dict(status='failed',error_type=type(error).__name__,operational_eligible=False)
    if os.environ.get('OPEN_METEO_USAGE_MODE')=='noncommercial':
        site=sites[0]
        for key in ('open-meteo-wind','open-meteo-wave'):
            source=registry[key];marine=source['product']=='marine'
            params=dict(latitude=site['lat'],longitude=site['lon'],hourly=','.join(source['variables']),models=source['dataset'],timezone='UTC',timeformat='unixtime',start_date=first.date().isoformat(),end_date=last.date().isoformat(),cell_selection='sea')
            if not marine:params['wind_speed_unit']='ms'
            try:
                raw=fetch_json('https://'+('marine-api.open-meteo.com/v1/marine' if marine else 'api.open-meteo.com/v1/forecast')+'?'+urlencode(params))
                path=output/(key+'.json');path.write_text(json.dumps(raw,allow_nan=False)+'\n')
                reports[key]=dict(status='retrieved',dataset=source['dataset'],time_count=len(raw['hourly']['time']),selected_lat=raw['latitude'],selected_lon=raw['longitude'],sha256=sha256(path),operational_eligible=False,reason_codes=['source_age_unknown','sea_cell_preferred_not_verified','grid_distance_and_bearings_unverified'])
            except Exception as error:
                reports[key]=dict(status='failed',error_type=type(error).__name__,operational_eligible=False)
    else:reports['open-meteo']=dict(status='unconfigured',operational_eligible=False)
    manifest=dict(kind='private_provider_inspection',retrieved_at=utc_now(),requested_start=first.isoformat(),requested_end=last.isoformat(),io_bounds=bounds,geometry_sha256=sha256(Path('config/geometry.json')),code_sha256=sha256(Path(__file__)),providers=reports,public_export=False)
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return reports


def main():
    parser=argparse.ArgumentParser(description='Private provider metadata and bounded historical inspection, never a forecast.')
    parser.add_argument('--start',required=True);parser.add_argument('--days',type=int,default=1);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    try:
        result=inspect(args.output,args.start,args.days)
        print(json.dumps({key:value['status'] for key,value in result.items()}))
    except Exception as error:
        print(json.dumps(dict(status='failed',error_type=type(error).__name__)));raise SystemExit(1) from None

if __name__=='__main__':main()
