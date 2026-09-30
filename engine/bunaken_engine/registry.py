"""Versioned source metadata and verified geometry, never inferred from Site names."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_sources(root: Path = ROOT) -> dict:
    registry = read_json(root / "config/source-registry.json")
    sources = registry["sources"]
    ids = [source["id"] for source in sources]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate source id")
    return {source["id"]: source for source in sources}


def load_geometry(root: Path = ROOT) -> dict:
    sites = read_json(root / "packages/contracts/data/sites.json")
    geometry = read_json(root / "config/geometry.json")
    known = {site["id"] for site in sites}
    if len(geometry["sites"]) != len(known) or {site["site_id"] for site in geometry["sites"]} != known:
        raise ValueError("geometry must cover exactly the registered Sites")
    zones = geometry["zones"]
    if len({zone["id"] for zone in zones}) != len(zones):
        raise ValueError("duplicate Zone id")
    for entry in geometry["sites"] + zones:
        if entry["site_id"] not in known:
            raise ValueError("unknown Site")
        validate_geometry(entry)
    return geometry


def validate_geometry(entry: dict) -> None:
    fields = ("lat", "lon", "reference_depth_m", "wall_bearing_deg", "offshore_bearing_deg", "max_grid_distance_km")
    values = [entry.get(field) for field in fields]
    for value in values:
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)):
            raise ValueError("non-finite geometry value")
    if entry["status"] == "unverified":
        if any(value is not None for value in values):
            raise ValueError("unverified geometry cannot supply numeric values")
        return
    if entry["status"] != "verified" or any(value is None for value in values):
        raise ValueError("verified geometry requires all numeric fields")
    lat, lon, depth, wall, offshore, distance = values
    if not (-90 <= lat <= 90 and -180 <= lon <= 180 and 0 <= depth <= 200 and distance > 0):
        raise ValueError("invalid geometry range")
    if not (0 <= wall < 360 and 0 <= offshore < 360):
        raise ValueError("bearing must be clockwise from true north")
    if not math.isclose(abs((offshore - wall + 180) % 360 - 180), 90, abs_tol=1):
        raise ValueError("wall/offshore bearings must be orthogonal")
    if not entry.get("verified_at") or not entry.get("evidence") or not entry.get("version"):
        raise ValueError("geometry requires verification evidence and version")


def resolve_geometry(site_id: str, zone_id: str | None = None, root: Path = ROOT) -> dict:
    registry = load_geometry(root)
    entries = registry["zones"] if zone_id else registry["sites"]
    matching = [entry for entry in entries if entry["site_id"] == site_id and (not zone_id or entry["id"] == zone_id)]
    if len(matching) != 1:
        raise ValueError("unknown Site/Zone combination")
    return matching[0]


def export_allowed(source: dict, variables: list[str]) -> bool:
    policy = source["redistribution"]
    return policy["derived_allowed"] and set(variables).issubset(policy["public_variables"])
