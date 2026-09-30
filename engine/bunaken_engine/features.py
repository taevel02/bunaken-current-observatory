"""Pure bounded environmental transforms; no PCI labels or extrapolation."""
import math
from bisect import bisect_left
from datetime import datetime, timezone
from statistics import median


def instant(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timezone required")
    return parsed.astimezone(timezone.utc)


def finite(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def interpolate(points: list[tuple[float, float | None]], target: float) -> float | None:
    """A missing endpoint invalidates the interval, rather than bridging its gap."""
    if not finite(target):
        raise ValueError("finite target required")
    ordered = sorted(points)
    xs = [point[0] for point in ordered]
    if any(not finite(x) for x in xs) or len(xs) != len(set(xs)):
        raise ValueError("finite unique coordinates required")
    i = bisect_left(xs, target)
    if i < len(xs) and xs[i] == target:
        return ordered[i][1] if finite(ordered[i][1]) else None
    if i == 0 or i == len(xs):
        return None
    (x0, y0), (x1, y1) = ordered[i-1:i+1]
    if not finite(y0) or not finite(y1):
        return None
    return y0 + (y1-y0) * (target-x0) / (x1-x0)


def projection(u: float | None, v: float | None, bearing: float | None) -> float | None:
    if not all(finite(value) for value in (u, v, bearing)):
        return None
    if not 0 <= bearing < 360:
        raise ValueError("bearing outside [0,360)")
    angle = math.radians(bearing)
    return u * math.sin(angle) + v * math.cos(angle)


def wind_vector(speed: float | None, from_bearing: float | None) -> tuple[float | None, float | None]:
    if not finite(speed) or not finite(from_bearing):
        return None, None
    if speed < 0 or not 0 <= from_bearing <= 360:
        raise ValueError("invalid wind")
    angle = math.radians(from_bearing)
    return -speed * math.sin(angle), -speed * math.cos(angle)


def circular_mean(degrees: list[float]) -> float | None:
    if not degrees or any(not finite(degree) for degree in degrees):
        return None
    x = sum(math.cos(math.radians(degree)) for degree in degrees)
    y = sum(math.sin(math.radians(degree)) for degree in degrees)
    return None if math.hypot(x,y) < 1e-12 else math.degrees(math.atan2(y,x)) % 360


def distance_km(lat1, lon1, lat2, lon2) -> float:
    a, b = math.radians(lat1), math.radians(lat2)
    h = math.sin((b-a)/2)**2 + math.cos(a)*math.cos(b)*math.sin(math.radians(lon2-lon1)/2)**2
    return 6371.0088 * 2 * math.asin(min(1, math.sqrt(h)))


def sea_cell(cells: list[dict], geometry: dict, depth_m: float) -> dict | None:
    if geometry["status"] != "verified":
        return None
    limit = geometry["max_grid_distance_km"]
    if not finite(limit) or limit <= 0 or not finite(depth_m) or depth_m < 0:
        raise ValueError("verified distance/depth required")
    candidates = []
    for cell in cells:
        if cell.get("ocean") is not True or not finite(cell.get("bottom_depth_m")) or cell["bottom_depth_m"] < depth_m:
            continue
        if not finite(cell.get("lat")) or not finite(cell.get("lon")):
            continue
        distance = distance_km(geometry["lat"],geometry["lon"],cell["lat"],cell["lon"])
        if distance <= limit:
            candidates.append((distance, str(cell["id"]), cell))
    if not candidates:
        return None
    distance, _, cell = min(candidates, key=lambda item: item[:2])
    return {**cell, "grid_distance_km": distance, "selection_method": "nearest_valid_sea_cell"}


def profile_value(depths: list[float], values: list[float | None], depth_m: float, bottom_depth_m: float) -> float | None:
    if len(depths) != len(values) or not finite(bottom_depth_m):
        raise ValueError("profile metadata required")
    if depth_m < 0 or depth_m > bottom_depth_m:
        return None
    return interpolate(list(zip(depths, values)), depth_m)


def window_mean(points: list[tuple[str, float | None]], start: str, end: str) -> float | None:
    first, last = instant(start).timestamp(), instant(end).timestamp()
    if last <= first:
        raise ValueError("positive interval required")
    ordered = [(instant(t).timestamp(),value) for t,value in points]
    left, right = interpolate(ordered,first), interpolate(ordered,last)
    inside = sorted((t,value) for t,value in ordered if first < t < last)
    full = [(first,left), *inside, (last,right)]
    if any(not finite(value) for _,value in full):
        return None
    return sum((b-a)*(u+v)/2 for (a,u),(b,v) in zip(full,full[1:])) / (last-first)


def quantile(values: list[float], proportion: float) -> float:
    ordered = sorted(values)
    position = (len(ordered)-1)*proportion
    lower = math.floor(position)
    upper = math.ceil(position)
    return ordered[lower] + (ordered[upper]-ordered[lower])*(position-lower)


def build_scaler(rows: list[dict], features: list[str], cutoff: str) -> dict:
    """Reject labels and future retrieval/revision knowledge at each validation cutoff."""
    boundary = instant(cutoff)
    allowed = {"valid_time", "retrieved_at", "issued_at", "features", "dataset", "version", "geometry_version"}
    eligible = []
    for row in rows:
        if set(row) - allowed:
            raise ValueError("environment-only rows required")
        if instant(row["retrieved_at"]) > boundary or instant(row["valid_time"]) > boundary:
            continue
        if row.get("issued_at") and instant(row["issued_at"]) > boundary:
            continue
        eligible.append(row)
    fitted = {}
    for name in features:
        values = [row["features"].get(name) for row in eligible if finite(row["features"].get(name))]
        if not values:
            fitted[name] = {"enabled": False, "reason": "no_historical_distribution", "n": 0}
        else:
            scale = quantile(values,.75)-quantile(values,.25)
            fitted[name] = {"enabled": scale > 0, "reason": None if scale > 0 else "zero_iqr", "n": len(values), "median": median(values), "iqr": scale}
    times = [instant(row["valid_time"]) for row in eligible]
    period = lambda at: at.isoformat().replace("+00:00", "Z") if at is not None else None
    return {"schema_version": "1.0", "cutoff": cutoff, "start": period(min(times, default=None)), "end": period(max(times, default=None)), "row_count": len(eligible), "features": fitted}


def extract_window(samples: list[dict], geometry: dict, start: str, end: str) -> dict:
    """Summarize a dive window at its declared depth; never substitute observed labels."""
    from datetime import timedelta
    depth = geometry.get("reference_depth_m")
    if geometry.get("status") != "verified" or not finite(depth):
        raise ValueError("verified geometry/depth required")
    def series(variable, at_depth=None):
        return [(item["valid_time"],item["value"]) for item in samples if item["variable"]==variable and (at_depth is None or item["depth_m"]==at_depth)]
    def average(variable, at_depth=None):
        return window_mean(series(variable,at_depth),start,end)
    center = instant(start)+(instant(end)-instant(start))/2
    tide = [(instant(at).timestamp(),value) for at,value in series("tide_height")]
    before=interpolate(tide,(center-timedelta(hours=1)).timestamp())
    after=interpolate(tide,(center+timedelta(hours=1)).timestamp())
    # Range describes this window's tide excursion, not a full tidal cycle.
    tide_range_points = [value for at,value in tide if instant(start).timestamp() <= at <= instant(end).timestamp()]
    tide_start=interpolate(tide,instant(start).timestamp()); tide_end=interpolate(tide,instant(end).timestamp())
    valid_tide = [tide_start,*tide_range_points,tide_end]
    u,v=average("uo",depth),average("vo",depth)
    warm,cold=average("thetao",10),average("thetao",30)
    wind_speed=dict(series("wind_speed_10m")); wind_direction=dict(series("wind_direction_10m"))
    winds=[(at,wind_vector(wind_speed.get(at),wind_direction.get(at))) for at in sorted(set(wind_speed)|set(wind_direction))]
    wind_u=window_mean([(at,uv[0]) for at,uv in winds],start,end)
    wind_v=window_mean([(at,uv[1]) for at,uv in winds],start,end)
    values={
        "tide_rate_m_per_hour":None if before is None or after is None else (after-before)/2,
        "tide_excursion_m":max(valid_tide)-min(valid_tide) if all(finite(value) for value in valid_tide) else None,
        "tide_phase_sin":None,"tide_phase_cos":None,
        "current_along_m_s":projection(u,v,geometry.get("wall_bearing_deg")),
        "current_cross_m_s":projection(u,v,geometry.get("offshore_bearing_deg")),
        "current_speed_m_s":math.hypot(u,v) if finite(u) and finite(v) else None,
        "horizontal_shear_10_30_m_s":None,
        "modelled_temperature_c":average("thetao",depth),
        "temperature_difference_10_30_c":warm-cold if finite(warm) and finite(cold) else None,
        "wind_along_m_s":projection(wind_u,wind_v,geometry.get("wall_bearing_deg")),
        "wind_cross_m_s":projection(wind_u,wind_v,geometry.get("offshore_bearing_deg")),
        "wave_height_m":average("wave_height"),"wave_period_s":average("wave_period"),
        "swell_height_m":average("swell_wave_height"),"swell_period_s":average("swell_wave_period"),
        "reference_depth_m":depth,
    }
    shallow=(average("uo",10),average("vo",10)); deep=(average("uo",30),average("vo",30))
    if all(finite(value) for value in (*shallow,*deep)):
        values["horizontal_shear_10_30_m_s"]=math.hypot(shallow[0]-deep[0],shallow[1]-deep[1])
    for variable,prefix in (("wave_direction","wave"),("swell_wave_direction","swell")):
        directions=series(variable)
        for trig,component in ((math.sin,"sin"),(math.cos,"cos")):
            values[f"{prefix}_direction_{component}"]=window_mean([(at,trig(math.radians(value)) if finite(value) else None) for at,value in directions],start,end)
    return {"start_at":start,"end_at":end,"geometry_version":geometry.get("version"),"feature_version":"environment-v1","values":values,"disabled_reasons":{"tide_phase":"phase_definition_unverified"}}
