"""Collection to immutable public files; operational evidence is never a fixture."""
import gzip
import json
import os
from pathlib import Path
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from bunaken_engine.features import extract_window, instant, finite
from bunaken_engine.registry import ROOT, read_json, load_sources, load_geometry, export_allowed, usable_geometry, COORDINATE_STATUSES
from bunaken_engine.sources import collect_fes, collect_open_meteo, SourceError, utc_now
from bunaken_engine.git_store import StorageError
from bunaken_engine.snapshots import canonical, digest, validate, make_bundle, bundle_path, assess_sources, select_seal, SnapshotError

WITA=ZoneInfo("Asia/Makassar")
REQUIRED=["fes-height","copernicus-currents"]


def collect_run(target_date: str, code_commit: str, *, days=7, run_id=None, kind="snapshot", root=ROOT, collector=None, model=None, extraction_depths=None) -> tuple[dict,dict[str,bytes]]:
    target=date.fromisoformat(target_date)
    if not 1<=days<=14:
        raise SnapshotError("invalid_collection_horizon")
    run_id=run_id or str(uuid4())
    prefix=bundle_path(target_date,run_id,kind)
    start=datetime.combine(target,time(),tzinfo=WITA).astimezone(timezone.utc)
    end=start+timedelta(days=days)
    start_at=start.isoformat().replace("+00:00","Z");end_at=end.isoformat().replace("+00:00","Z")
    registry=load_sources(root);geometries=load_geometry(root)
    targets=geometries["sites"]+geometries["zones"]
    samples=[];failures={source_id:set() for source_id in registry};feature_rows=[];forecast=[]
    usable_targets=[geometry for geometry in targets if usable_geometry(geometry)]
    collectable=[geometry for geometry in targets if geometry["status"] in COORDINATE_STATUSES]
    if not collectable:
        for reasons in failures.values(): reasons.add("unverified_geometry")
    batches = {}
    tide_cache = None
    tide_cache_error = None
    if collector is None and os.environ.get('FES_DERIVED_ROOT'):
        from bunaken_engine.fes_cache import TideEphemeris
        try:
            tide_cache = TideEphemeris(Path(os.environ['FES_DERIVED_ROOT']), root)
        except SourceError as error:
            tide_cache_error = error.code
    if collector is None:
        from bunaken_engine.copernicus_batch import collect_batch
        from bunaken_engine.copernicus_batch import point_key
        for source_id, source in registry.items():
            if source['provider'] != 'copernicus' or not export_allowed(source, list(source['variables'])):
                continue
            try:
                batches[source_id] = collect_batch(source, usable_targets, start_at, end_at, depths=sorted(set((extraction_depths or []) + [10,30] + [g["reference_depth_m"] for g in usable_targets])))
            except SourceError as error:
                batches[source_id] = {'error': error.code}
    for geometry in collectable:
        point_samples=[]
        for source_id,source in registry.items():
            if not export_allowed(source,list(source["variables"])):
                failures[source_id].add("source_redistribution_unverified")
                continue
            try:
                if collector:
                    result=collector(source,geometry,start_at,end_at)
                elif source["provider"]=="fes":
                    if tide_cache_error: raise SourceError(tide_cache_error)
                    method = tide_cache.collect if tide_cache else collect_fes
                    result=method(source,geometry,(start-timedelta(hours=2)).isoformat(),(end+timedelta(hours=2)).isoformat())
                elif source["provider"]=="copernicus":
                    if not usable_geometry(geometry): raise SourceError("unverified_geometry")
                    batch = batches[source_id]
                    point = batch if 'error' in batch else batch[point_key(geometry)]
                    if 'error' in point: raise SourceError(point['error'])
                    result = point['samples']
                else:
                    result=collect_open_meteo(source,geometry,start_at,end_at)
                point_samples.extend(result)
            except SourceError as error:
                failures[source_id].add(error.code)
        samples.extend(point_samples)
        readiness=assess_sources(point_samples,list(registry),utc_now(),root,reference_depth=geometry["reference_depth_m"],historical=kind=="backfill")
        usable={source_id for source_id,state in readiness.items() if state["status"]=="succeeded"}
        usable_samples=[row for row in point_samples if row["source"] in usable]
        for source_id,state in readiness.items():
            failures[source_id].update(state["reason_codes"])
        if not usable_geometry(geometry):
            continue
        for day in range(days):
            for half_hour in range(16):
                at=start+timedelta(days=day,hours=8,minutes=30*half_hour)
                until=at+timedelta(hours=1)
                window=extract_window(usable_samples,geometry,at.isoformat(),until.isoformat())
                required_features=["tide_rate_m_per_hour","tide_excursion_m","current_along_m_s","current_cross_m_s","current_speed_m_s"]
                if any(not finite(window["values"].get(name)) for name in required_features):
                    for source_id in REQUIRED:
                        failures[source_id].add("required_window_coverage_missing")
                feature_rows.append(dict(site_id=geometry["site_id"],zone_id=geometry.get("id"),**window))
    statuses={source_id:dict(status="failed" if reasons else "succeeded",reason_codes=sorted(reasons)) for source_id,reasons in failures.items()}
    success=bool(usable_targets) and all(statuses[source_id]["status"]=="succeeded" for source_id in REQUIRED)
    for geometry in targets:
        reasons=["insufficient_numeric_labels"]
        if not usable_geometry(geometry): reasons.append("unverified_geometry")
        if not success: reasons.append("missing_required_features")
        for day in range(days):
            for half_hour in range(16):
                at=start+timedelta(days=day,hours=8,minutes=30*half_hour)
                forecast.append(dict(site_id=geometry["site_id"],zone_id=geometry.get("id"),start_at=at.isoformat().replace("+00:00","Z"),duration_minutes=60,reference_depth_m=geometry["reference_depth_m"],pci=None,prediction_status="insufficient",support="insufficient",n_eff=0,n_eff_days=0,distinct_days=0,same_site_days=0,same_zone_days=0,vertical_evidence=dict(status="insufficient"),feature_coverage={},reason_codes=reasons,model_version="cold-start-p3",source_snapshot_ids=[run_id]))
    now=utc_now()
    manifest=dict(snapshot_id=run_id,schema_version="1.1",date_wita=target_date,run_id=run_id,created_at=now,source_issued_at=None,source_retrieved_at=max((row["retrieved_at"] for row in samples),default=None),valid_start=start_at,valid_end=end_at,dataset_versions={row["dataset"]:row["version"] for row in samples},geometry_version=digest(canonical(geometries)) if collectable else None,scaler_version=None,code_commit=code_commit,samples=samples,status="succeeded" if success else "failed",kind=kind,feature_version="environment-v1",source_registry_hash=digest(canonical(read_json(root/"config/source-registry.json"))),geometry_hash=digest(canonical(geometries)),source_status=statuses,artifact_hashes={"features.json.gz":digest(gzip.compress(canonical(feature_rows),mtime=0)),"forecast.json.gz":digest(gzip.compress(canonical(forecast),mtime=0))})
    if model is not None:
        from bunaken_engine.model_data import forecast_context
        manifest.update(schema_version='1.2', model_context=model, model_context_sha256=digest(canonical(model)))
        forecast, manifest['scaler_version'] = forecast_context(model, feature_rows, manifest, root=root)
        manifest['artifact_hashes']['forecast.json.gz'] = digest(gzip.compress(canonical(forecast), mtime=0))
    return manifest,make_bundle(manifest,feature_rows,forecast,root=root,kind=kind)


def publish_bundle(store, manifest, files, *, root=ROOT) -> dict:
    receipt_path=f"snapshot-receipts/{manifest['run_id']}.json"
    manifest_path=next(path for path in files if path.endswith("/manifest.json"))
    manifest_hash=digest(files[manifest_path])
    existing=store.read(receipt_path,store.head())
    if existing is not None:
        receipt=json.loads(existing)
        validate("snapshot-receipt",receipt,root)
        if receipt["manifest_sha256"]!=manifest_hash:
            raise SnapshotError("immutable_run_conflict")
        confirm_receipt(store,receipt,root=root)
        return receipt
    if manifest.get('model_context') is not None:
        from bunaken_engine.model_input import verify_context_storage
        verify_context_storage(store,manifest['model_context'],store.head(),root=root)
    storage_commit=store.insert(files)
    receipt=dict(schema_version="1.0",run_id=manifest["run_id"],kind=manifest["kind"],status=manifest["status"],manifest_path=manifest_path,manifest_sha256=manifest_hash,storage_commit=storage_commit,persisted_at=utc_now(),valid_start=manifest["valid_start"],valid_end=manifest["valid_end"])
    validate("snapshot-receipt",receipt,root)
    try:
        store.insert({receipt_path:canonical(receipt),f"snapshot-receipt-index/{manifest['date_wita']}/{manifest['run_id']}.json":canonical(receipt)},"confirm immutable snapshot storage")
    except StorageError as error:
        if str(error) != "immutable_conflict":
            raise
        # A concurrent retry may have confirmed the identical bundle first.
        existing=store.read(receipt_path,store.head())
        if existing is None:
            raise
        receipt=json.loads(existing)
        validate("snapshot-receipt",receipt,root)
        if receipt["manifest_sha256"] != manifest_hash:
            raise SnapshotError("immutable_run_conflict") from None
    confirm_receipt(store,receipt,root=root)
    return receipt


def confirm_receipt(store,receipt,*,root=ROOT):
    path=f"snapshot-confirmations/{receipt['run_id']}.json"
    expected=digest(canonical(receipt))
    existing=store.read(path,store.head())
    if existing is not None:
        confirmation=json.loads(existing)
        validate("snapshot-confirmation",confirmation,root)
        if confirmation["receipt_sha256"]!=expected:
            raise SnapshotError("receipt_confirmation_mismatch")
        return confirmation
    # This clock read follows successful receipt ref confirmation, never commit creation.
    confirmation=dict(schema_version="1.0",run_id=receipt["run_id"],receipt_sha256=expected,confirmed_at=utc_now())
    validate("snapshot-confirmation",confirmation,root)
    try:
        store.insert({path:canonical(confirmation)},"confirm receipt branch visibility")
    except StorageError as error:
        if str(error)!="immutable_conflict":
            raise
        existing=store.read(path,store.head())
        if existing is None:
            raise
        confirmation=json.loads(existing)
        validate("snapshot-confirmation",confirmation,root)
        if confirmation["receipt_sha256"]!=expected:
            raise SnapshotError("receipt_confirmation_mismatch") from None
    return confirmation


def verified_receipt(store, receipt: dict, head: str, *, root=ROOT) -> dict:
    validate("snapshot-receipt",receipt,root)
    raw=store.read(receipt["manifest_path"],receipt["storage_commit"])
    if raw is None or digest(raw)!=receipt["manifest_sha256"] or store.read(receipt["manifest_path"],head)!=raw:
        raise SnapshotError("receipt_manifest_mismatch")
    manifest=json.loads(raw)
    validate("snapshot",manifest,root)
    prefix=bundle_path(manifest["date_wita"],manifest["run_id"],manifest["kind"])
    if receipt["manifest_path"]!=prefix+"/manifest.json" or receipt["run_id"]!=manifest["run_id"] or receipt["kind"]!=manifest["kind"] or receipt["status"]!=manifest["status"]:
        raise SnapshotError("receipt_identity_mismatch")
    artifacts={}
    for name,expected in manifest["artifact_hashes"].items():
        content=store.read(prefix+"/"+name,receipt["storage_commit"])
        if content is None or digest(content)!=expected:
            raise SnapshotError("receipt_artifact_mismatch")
        artifacts[name]=json.loads(gzip.decompress(content))
    make_bundle(manifest,artifacts["features.json.gz"],artifacts["forecast.json.gz"],root=root,kind=manifest["kind"])
    raw_confirmation=store.read(f"snapshot-confirmations/{receipt['run_id']}.json",head)
    if raw_confirmation is None:
        return {**receipt,"storage_verified":False,"reason_codes":["receipt_confirmation_missing"]}
    confirmation=json.loads(raw_confirmation)
    validate("snapshot-confirmation",confirmation,root)
    if confirmation["run_id"]!=receipt["run_id"] or confirmation["receipt_sha256"]!=digest(canonical(receipt)):
        raise SnapshotError("receipt_confirmation_mismatch")
    # Confirmation time follows the receipt ref update, including delayed PATCH responses.
    stored=max(instant(confirmation["confirmed_at"]),instant(receipt["persisted_at"]),instant(store.commit_time(receipt["storage_commit"])),instant(store.path_commit_time(f"snapshot-receipts/{receipt['run_id']}.json",head)))
    return {**receipt,"valid_start":manifest["valid_start"],"valid_end":manifest["valid_end"],"persisted_at":stored.isoformat().replace("+00:00","Z"),"storage_verified":True}


def publish_seal(store, target_date: str, receipts: list[dict], *, root=ROOT, now=None) -> dict:
    path=f"seals/target-{target_date}.json"
    head=store.head()
    existing=store.read(path,head)
    if existing is not None:
        result=json.loads(existing);validate("seal",result,root)
        return result
    candidates=[verified_receipt(store,receipt,head,root=root) for receipt in receipts]
    result=select_seal(target_date,candidates,now or utc_now())
    validate("seal",result,root)
    store.insert({path:canonical(result)},"seal D+1 at fixed WITA cutoff")
    return result


def historical_rows(manifest_path, *, root=ROOT) -> list[dict]:
    """Consume only a validated backfill bundle, preserving its availability cutoff."""
    manifest=json.loads(manifest_path.read_bytes())
    if manifest.get('kind') != 'backfill':
        raise SnapshotError('historical_backfill_required')
    features=json.loads(gzip.decompress((manifest_path.parent/'features.json.gz').read_bytes()))
    forecast=json.loads(gzip.decompress((manifest_path.parent/'forecast.json.gz').read_bytes()))
    make_bundle(manifest,features,forecast,root=root,kind='backfill')
    result=[]
    for row in features:
        samples=[sample for sample in manifest['samples'] if sample.get('site_id')==row['site_id'] and sample.get('zone_id')==row['zone_id']]
        if not samples:
            continue
        result.append(dict(valid_time=row['end_at'],retrieved_at=max(samples,key=lambda item:instant(item['retrieved_at']))['retrieved_at'],issued_at=max((item['issued_at'] for item in samples if item.get('issued_at')),key=instant,default=None),features=row['values'],dataset=manifest['dataset_versions'],version=manifest['feature_version'],geometry_version=row['geometry_version']))
    return result
