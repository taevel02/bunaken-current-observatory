"""Provider-specific collection. Raw datasets and credentials stay outside Git."""
import hashlib
import json
import os
import time
from datetime import datetime, timezone, timedelta
from importlib.metadata import version as package_version
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from bunaken_engine.features import finite, instant, distance_km, sea_cell, profile_value
from bunaken_engine.registry import validate_geometry


class SourceError(Exception):
    def __init__(self, code: str, retryable: bool = False):
        super().__init__(code)
        self.code, self.retryable = code, retryable


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def require_geometry(geometry: dict):
    validate_geometry(geometry)
    if geometry["status"] != "verified":
        raise SourceError("unverified_geometry")


def fetch_json(url: str, opener=urlopen, sleep=time.sleep) -> dict:
    for attempt in range(3):
        try:
            with opener(Request(url, headers={"User-Agent": "bunaken-current-observatory/0.1"}), timeout=30) as response:
                raw = response.read(10_000_001)
            if len(raw) > 10_000_000:
                raise SourceError("provider_response_too_large")
            return json.loads(raw)
        except HTTPError as error:
            status = error.code
            error.close()
            retryable = status in {429, 500, 502, 503, 504}
            if retryable and attempt < 2:
                sleep(2**attempt)
                continue
            raise SourceError("provider_rate_limited" if status == 429 else "provider_http_error", retryable) from None
        except (URLError, TimeoutError):
            if attempt < 2:
                sleep(2**attempt)
                continue
            raise SourceError("provider_unreachable", True) from None
        except (ValueError, UnicodeError):
            raise SourceError("provider_response_invalid") from None
    raise SourceError("provider_unreachable", True)


def sample(source: dict, geometry: dict, variable: str, value, valid_time: str, retrieved_at: str, *, selected_lat=None, selected_lon=None, depth=None, issued_at=None, flags=None, version=None, depths=None) -> dict:
    lat = geometry["lat"] if selected_lat is None else selected_lat
    lon = geometry["lon"] if selected_lon is None else selected_lon
    return dict(schema_version="1.1",geometry_version=geometry.get("version"),source=source["id"], product=source["product"], dataset=source["dataset"], variable=variable, version=version or source["dataset_version"] or source["dataset"], lat=geometry["lat"], lon=geometry["lon"], site_id=geometry["site_id"], zone_id=geometry.get("id"), selected_grid=f"{lat:.6f},{lon:.6f}", selected_lat=lat, selected_lon=lon, grid_distance_km=distance_km(geometry["lat"],geometry["lon"],lat,lon), depth_m=depth, valid_time=valid_time, issued_at=issued_at, source_updated_at=source.get("last_updated_at"), retrieved_at=retrieved_at, value=float(value) if finite(value) else None, unit=source["variables"][variable], native_resolution=json.dumps(source["native_resolution"],sort_keys=True), native_depths_m=depths, interpolation_method="none" if depth is None else "bounded_depth_linear", quality_flags=flags or [])


def collect_open_meteo(source: dict, geometry: dict, start: str, end: str, *, fetcher=fetch_json, usage_mode: str | None = None, api_key: str | None = None) -> list[dict]:
    require_geometry(geometry)
    mode = usage_mode or os.environ.get("OPEN_METEO_USAGE_MODE")
    if mode not in {"noncommercial", "commercial"}:
        raise SourceError("provider_usage_mode_unconfigured")
    key = api_key or os.environ.get("OPEN_METEO_API_KEY")
    if mode == "commercial" and not key:
        raise SourceError("provider_credentials_missing")
    marine = source["product"] == "marine"
    host = "marine-api.open-meteo.com" if marine else "api.open-meteo.com"
    if mode == "commercial":
        host = "customer-" + host
    params = dict(latitude=geometry["lat"],longitude=geometry["lon"],hourly=",".join(source["variables"]),models=source["dataset"],timezone="UTC",timeformat="unixtime",start_date=instant(start).date().isoformat(),end_date=instant(end).date().isoformat(),cell_selection="sea")
    if not marine:
        params["wind_speed_unit"] = "ms"
    if mode == "commercial":
        params["apikey"] = key
    data = fetcher(f"https://{host}/v1/{'marine' if marine else 'forecast'}?{urlencode(params)}")
    retrieved = utc_now()
    try:
        lat, lon = data["latitude"], data["longitude"]
        if not finite(lat) or not finite(lon) or distance_km(geometry["lat"],geometry["lon"],lat,lon) > geometry["max_grid_distance_km"]:
            raise SourceError("grid_too_far")
        hourly, units = data["hourly"], data["hourly_units"]
        timestamps = hourly["time"]
        if not timestamps or timestamps != sorted(set(timestamps)):
            raise SourceError("provider_time_axis_invalid")
        samples = []
        for variable, expected_unit in source["variables"].items():
            if units[variable] not in {expected_unit, "°" if expected_unit == "degree" else expected_unit}:
                raise SourceError("provider_unit_mismatch")
            if len(hourly[variable]) != len(timestamps):
                raise SourceError("provider_shape_invalid")
            for timestamp, value in zip(timestamps,hourly[variable]):
                valid = datetime.fromtimestamp(timestamp,timezone.utc).isoformat().replace("+00:00","Z")
                if instant(start) <= instant(valid) <= instant(end):
                    flags = ["issued_time_unavailable", "source_age_unknown", "sea_cell_preferred_not_verified"]
                    if source["native_resolution"]["time_hours"] is None:
                        flags.append("native_time_resolution_unknown")
                    if not finite(value):
                        flags.append("missing")
                    item = sample(source,geometry,variable,value,valid,retrieved,selected_lat=lat,selected_lon=lon,flags=flags)
                    item["interpolation_method"] = "provider_hourly_output"
                    samples.append(item)
        if not samples:
            raise SourceError("outside_source_horizon")
        return samples
    except (KeyError,TypeError,ValueError,OverflowError):
        raise SourceError("provider_response_invalid") from None


def collect_copernicus(source: dict, geometry: dict, start: str, end: str, depth_m: float, *, sdk=None, username=None, password=None, extraction_depths=None) -> list[dict]:
    require_geometry(geometry)
    username = username or os.environ.get("COPERNICUSMARINE_SERVICE_USERNAME")
    password = password or os.environ.get("COPERNICUSMARINE_SERVICE_PASSWORD")
    if not username or not password:
        raise SourceError("provider_credentials_missing")
    if not source.get("dataset_version"):
        raise SourceError("unverified_dataset_version")
    if sdk is None:
        try:
            import copernicusmarine as sdk
        except ImportError:
            raise SourceError("provider_sdk_missing") from None
    # Bounded area only. Latitude compensation preserves the configured km limit.
    delta_lat = geometry["max_grid_distance_km"] / 110.5
    import math
    delta_lon = delta_lat / max(.01,math.cos(math.radians(geometry["lat"])))
    bounds = dict(minimum_latitude=geometry["lat"]-delta_lat,maximum_latitude=geometry["lat"]+delta_lat,minimum_longitude=geometry["lon"]-delta_lon,maximum_longitude=geometry["lon"]+delta_lon,username=username,password=password,coordinates_selection_method="outside")
    try:
        catalogue = sdk.describe(dataset_id=source["dataset"], show_all_versions=True, disable_progress_bar=True, raise_on_error=True)
        dataset_metadata = next(ds for product in catalogue.products for ds in product.datasets if ds.dataset_id == source["dataset"])
        selected_version = next(item for item in dataset_metadata.versions if item.label == source["dataset_version"])
        updated = selected_version.arco_updated_date
        if isinstance(updated, datetime):
            updated = updated.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        source = {**source, "last_updated_at": updated}
        with sdk.open_dataset(dataset_id="cmems_mod_glo_phy_anfc_0.083deg_static",dataset_version="202211",dataset_part="bathy",variables=["deptho","mask"],**bounds) as bathy:
            cells = []
            for lat in bathy.latitude.values:
                for lon in bathy.longitude.values:
                    node = bathy.sel(latitude=lat,longitude=lon)
                    bottom = float(node["deptho"].values.squeeze())
                    mask_values = node["mask"].values.flatten()
                    cells.append(dict(id=f"{lat:.6f},{lon:.6f}",lat=float(lat),lon=float(lon),bottom_depth_m=bottom,ocean=any(value == 1 for value in mask_values)))
            cell = sea_cell(cells,geometry,depth_m)
        if not cell:
            raise SourceError("no_valid_sea_cell")
        with sdk.open_dataset(dataset_id=source["dataset"],dataset_version=source["dataset_version"],variables=list(source["variables"]),start_datetime=start,end_datetime=end,**bounds) as dataset:
            # Exact match only: never move from the verified sea cell to an unchecked one.
            point = dataset.sel(latitude=cell["lat"],longitude=cell["lon"])
            depths = [float(value) for value in point.depth.values]
            retrieved = utc_now()
            output = []
            aliases = {"m/s":{"m/s","m s-1"},"°C":{"°C","degrees_C","degree_Celsius","degC"},"PSU":{"PSU","1e-3","1","psu"}}
            for variable, unit in source["variables"].items():
                if point[variable].attrs.get("units") not in aliases[unit]:
                    raise SourceError("provider_unit_mismatch")
                for index, timestamp in enumerate(point.time.values):
                    at = str(timestamp).split(".")[0]+"Z"
                    values = [float(value) for value in point[variable].isel(time=index).values.flatten()]
                    for target_depth in sorted(set(extraction_depths or [depth_m])):
                        value = profile_value(depths,values,target_depth,cell["bottom_depth_m"])
                        flags = ["issued_time_unavailable"]
                        if not source.get("last_updated_at"):
                            flags.append("source_age_unknown")
                        if value is None:
                            flags.append("missing")
                        output.append(sample(source,geometry,variable,value,at,retrieved,selected_lat=cell["lat"],selected_lon=cell["lon"],depth=target_depth,flags=flags,depths=depths))
            if not output:
                raise SourceError("outside_source_horizon")
            return output
    except SourceError:
        raise
    except Exception:
        # SDK errors may contain credential-bearing request URLs. Preserve only a safe code.
        raise SourceError("provider_read_failed",True) from None


def collect_fes(source: dict, geometry: dict, start: str, end: str, *, config_path: str | None = None, atlas_unit: str | None = None, evaluator=None) -> list[dict]:
    require_geometry(geometry)
    config_path = config_path or os.environ.get("FES_CONFIG_PATH")
    atlas_unit = atlas_unit or os.environ.get("FES_ATLAS_UNIT")
    if not config_path or atlas_unit not in {"cm","m"}:
        raise SourceError("fes_atlas_unconfigured")
    try:
        import numpy as np
        import pyfes
        path = Path(config_path)
        config_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        first,last = instant(start),instant(end)
        if last < first or (last-first).total_seconds() > 999*1800:
            raise SourceError("provider_window_invalid")
        times = []
        current = first
        while current <= last:
            times.append(current)
            current += timedelta(minutes=30)
        if not times or len(times) > 1000:
            raise SourceError("provider_window_invalid")
        dates = np.array([at.replace(tzinfo=None) for at in times],dtype="datetime64[us]")
        if evaluator is None:
            config = pyfes.config.load(str(path))
            evaluator = lambda: pyfes.evaluate_tide(config.models["tide"],dates,np.full(len(times),geometry["lon"]),np.full(len(times),geometry["lat"]),settings=config.settings)
        tide, long_period, quality = evaluator()
        if not (len(tide)==len(long_period)==len(quality)==len(times)):
            raise SourceError("provider_shape_invalid")
        scale = .01 if atlas_unit == "cm" else 1
        output=[]
        retrieved=utc_now()
        for at,height,lp,flag in zip(times,tide,long_period,quality):
            value=float(height+lp)*scale if flag>0 else None
            flags=[] if flag>0 else ["fes_undefined" if flag==0 else "fes_extrapolation_rejected"]
            flags.extend(["reference_engine_conformance_unverified", "atlas_version_unverified"])
            output.append(sample(source,geometry,"tide_height",value,at.isoformat().replace("+00:00","Z"),retrieved,flags=flags,version=f"FES2022b/pyfes-{package_version('pyfes')}/{config_hash}"))
        return output
    except SourceError:
        raise
    except ImportError:
        raise SourceError("provider_sdk_missing") from None
    except Exception:
        raise SourceError("fes_evaluation_failed") from None
