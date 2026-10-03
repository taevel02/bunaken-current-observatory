"""Public immutable bundles and D+1 seals based on confirmed storage receipts."""
import gzip
import hashlib
import json
import re
from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource
from bunaken_engine.features import instant, finite
from bunaken_engine.registry import ROOT, load_sources, read_json, export_allowed

WITA=ZoneInfo("Asia/Makassar")


class SnapshotError(Exception):
    pass


def canonical(value) -> bytes:
    return (json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False,allow_nan=False)+"\n").encode()


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def validate(name: str, document, root=ROOT):
    schemas=[read_json(path) for path in (root/"packages/contracts/json-schema").glob("*.schema.json")]
    registry=Registry().with_resources((schema["$id"],Resource.from_contents(schema)) for schema in schemas)
    schema=next(item for item in schemas if item["$id"].endswith(f"/{name}.schema.json"))
    Draft202012Validator(schema,registry=registry,format_checker=FormatChecker()).validate(document)


def bundle_path(date_wita: str, run_id: str, kind: str="snapshot") -> str:
    if date.fromisoformat(date_wita).isoformat()!=date_wita or str(UUID(run_id))!=run_id:
        raise SnapshotError("invalid_run_identity")
    if kind not in {"snapshot","backfill"}:
        raise SnapshotError("invalid_run_kind")
    return f"{'snapshots' if kind=='snapshot' else 'backfills'}/{date_wita}/{run_id}"


def assess_sources(samples: list[dict], required: list[str], now: str, root=ROOT, *, reference_depth=None, historical=False) -> dict:
    registry=load_sources(root)
    result={}
    for source_id in required:
        source=registry[source_id]
        rows=[row for row in samples if row["source"]==source_id]
        if reference_depth is not None and source["provider"] == "copernicus":
            rows=[row for row in rows if row.get("depth_m")==reference_depth]
        reasons=[]
        if not rows or set(row["variable"] for row in rows) != set(source["variables"]) or any(not finite(row["value"]) for row in rows):
            reasons.append("missing_required_source")
        if not export_allowed(source,list(source["variables"])):
            reasons.append("source_redistribution_unverified")
        for row in rows:
            for flag in ("reference_engine_conformance_unverified", "atlas_version_unverified"):
                if flag in row["quality_flags"]:
                    reasons.append(flag)
            if source["stale_after_hours"] is not None:
                age_time=row.get("issued_at") or row.get("source_updated_at")
                if age_time is None:
                    if not historical:
                        reasons.append("source_age_unknown")
                elif instant(age_time)>instant(now):
                    reasons.append("source_time_in_future")
                elif not historical and (instant(now)-instant(age_time)).total_seconds()>source["stale_after_hours"]*3600:
                    reasons.append("stale_required_source")
        result[source_id]=dict(status="succeeded" if not reasons else "failed",reason_codes=sorted(set(reasons)))
    return result


def make_bundle(manifest: dict, features: list[dict], forecast: list[dict], *, root=ROOT, kind="snapshot") -> dict[str,bytes]:
    """Validate every public field before constructing any Git blob."""
    registry=load_sources(root)
    if manifest.get("kind") != kind:
        raise SnapshotError("run_kind_mismatch")
    if set(manifest["source_status"])-set(registry):
        raise SnapshotError("unknown_source_status")
    for row in manifest["samples"]:
        validate("source-sample",row,root)
        source=registry.get(row["source"])
        if source is None or row["product"]!=source["product"] or row["dataset"]!=source["dataset"] or row["variable"] not in source["variables"] or row["unit"]!=source["variables"][row["variable"]]:
            raise SnapshotError("unknown_public_source")
        if not export_allowed(source,[row["variable"]]):
            raise SnapshotError("source_export_forbidden")
    feature_names={name for group in read_json(root/"config/features.json")["groups"].values() for name in group["features"]}
    for row in features:
        if set(row)!={"site_id","zone_id","start_at","end_at","geometry_version","feature_version","values","disabled_reasons"} or set(row["values"])-feature_names:
            raise SnapshotError("unknown_feature_field")
        if any(value is not None and not finite(value) for value in row["values"].values()):
            raise SnapshotError("invalid_feature_value")
    if manifest.get("status")=="succeeded":
        required_features={"tide_rate_m_per_hour","tide_excursion_m","current_along_m_s","current_cross_m_s","current_speed_m_s"}
        if not features or any(any(not finite(row["values"].get(name)) for name in required_features) for row in features):
            raise SnapshotError("required_window_coverage_missing")
    for row in forecast:
        validate("prediction",row,root)
        # P3 has no trained model. Fail closed if a caller attempts a numeric forecast.
        if row["pci"] is not None or row["prediction_status"]!="insufficient":
            raise SnapshotError("numeric_model_not_implemented")
    encoded_features=gzip.compress(canonical(features),mtime=0)
    encoded_forecast=gzip.compress(canonical(forecast),mtime=0)
    if manifest.get("artifact_hashes")!={"features.json.gz":digest(encoded_features),"forecast.json.gz":digest(encoded_forecast)}:
        raise SnapshotError("artifact_hash_mismatch")
    validate("snapshot",manifest,root)
    prefix=bundle_path(manifest["date_wita"],manifest["run_id"],kind)
    return {f"{prefix}/manifest.json":canonical(manifest),f"{prefix}/features.json.gz":encoded_features,f"{prefix}/forecast.json.gz":encoded_forecast}


def seal_cutoff(target_date: str) -> datetime:
    target=date.fromisoformat(target_date)
    return datetime.combine(target-timedelta(days=1),time(20),tzinfo=WITA).astimezone(timezone.utc)


def select_seal(target_date: str, receipts: list[dict], now: str) -> dict:
    cutoff=seal_cutoff(target_date)
    if instant(now)<cutoff:
        raise SnapshotError("seal_before_cutoff")
    start=datetime.combine(date.fromisoformat(target_date),time(),tzinfo=WITA).astimezone(timezone.utc)
    end=start+timedelta(days=1)
    candidates=[]
    for receipt in receipts:
        # Callers must read/verify each receipt's actual storage commit and manifest first.
        if receipt.get("kind")!="snapshot" or receipt.get("status")!="succeeded" or not receipt.get("storage_verified"):
            continue
        stored=instant(receipt["persisted_at"])
        if stored>=cutoff or instant(receipt["valid_start"])>start or instant(receipt["valid_end"])<end:
            continue
        candidates.append(receipt)
    selected=max(candidates,key=lambda row:(instant(row["persisted_at"]),row["run_id"]),default=None)
    return dict(schema_version="1.0",target_date_wita=target_date,cutoff_at=cutoff.isoformat().replace("+00:00","Z"),status="sealed" if selected else "missed_d1_snapshot",run_id=selected["run_id"] if selected else None,storage_commit=selected["storage_commit"] if selected else None,manifest_sha256=selected["manifest_sha256"] if selected else None)


def allowed_data_path(path: str) -> bool:
    uuid=r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    date_pattern=r"\d{4}-\d{2}-\d{2}"
    return bool(re.fullmatch(rf"web/releases/{uuid}/(?:manifest|dashboard)\.json",path) or path == "web/latest.json" or re.fullmatch(rf"(?:snapshots|backfills)/{date_pattern}/{uuid}/(?:manifest\.json|features\.json\.gz|forecast\.json\.gz)",path) or re.fullmatch(rf"snapshot-receipts/{uuid}\.json",path) or re.fullmatch(rf"snapshot-receipt-index/{date_pattern}/{uuid}\.json",path) or re.fullmatch(rf"snapshot-confirmations/{uuid}\.json",path) or re.fullmatch(rf"seals/target-{date_pattern}\.json",path))
