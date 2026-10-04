"""Repository-backed CLI. Dry-run by default; --publish is an explicit remote write."""
import argparse
import gzip
import json
import os
from pathlib import Path
import sys
import subprocess
from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from jsonschema.exceptions import ValidationError
from bunaken_engine.registry import load_sources, load_geometry, read_json
from bunaken_engine.features import build_scaler
from bunaken_engine.git_store import GitDataStore, StorageError
from bunaken_engine.pipeline import collect_run, publish_bundle, publish_seal, verified_receipt, historical_rows
from bunaken_engine.snapshots import canonical, digest, bundle_path, make_bundle, select_seal, SnapshotError
from bunaken_engine.sources import SourceError, utc_now


def store_from_env():
    return GitDataStore(os.environ.get("GITHUB_OWNER",""),os.environ.get("GITHUB_REPO",""),os.environ.get("GITHUB_WRITE_TOKEN",""))


def write_files(output: Path,files: dict[str,bytes]):
    for relative,content in files.items():
        path=output/relative
        path.parent.mkdir(parents=True,exist_ok=True)
        if path.exists():
            if path.read_bytes()!=content:
                raise SnapshotError("local_immutable_conflict")
            continue
        with path.open("xb") as handle:
            handle.write(content)


def parser():
    cli=argparse.ArgumentParser(description="Bunaken environmental collection and immutable snapshot tools")
    cli.add_argument("--root",type=Path,default=Path.cwd(),help="trusted code checkout containing config and contracts")
    commands=cli.add_subparsers(dest="command",required=True)
    commands.add_parser("status",help="show geometry/source readiness without secret values")
    collect=commands.add_parser("collect",help="collect a forecast snapshot or historical analysis backfill")
    collect.add_argument("--date",default=(datetime.now(ZoneInfo("Asia/Makassar"))+timedelta(days=1)).date().isoformat(),help="first WITA date")
    collect.add_argument("--days",type=int,default=7)
    collect.add_argument("--kind",choices=["snapshot","backfill"],default="snapshot")
    collect.add_argument("--run-id",default=None)
    collect.add_argument("--code-commit",required=True,help="40-character trusted code commit SHA")
    collect.add_argument("--output",type=Path,required=True,help="local diagnostic/output directory")
    collect.add_argument("--publish",action="store_true",help="commit the verified public bundle to data branch")
    collect.add_argument("--model",type=Path,help="immutable model context built by the model command")
    collect.add_argument('--model-from-data',action='store_true',help='read revision history and Git-confirmed snapshots at one data head')
    collect.add_argument('--observer',help='one public observer alias for numeric training')
    collect.add_argument('--rubric',help='one compatible rubric version for numeric training')
    model=commands.add_parser('model',help='build reproducible public model inputs; no remote write')
    model.add_argument('--observations',type=Path,required=True)
    model.add_argument('--snapshot',type=Path,action='append',default=[])
    model.add_argument('--observer',required=True)
    model.add_argument('--rubric',required=True)
    model.add_argument('--cutoff',required=True)
    model.add_argument('--output',type=Path,required=True)
    evaluation=commands.add_parser('validate-model',help='forward or diagnostic day validation; no remote write')
    evaluation.add_argument('--observations',type=Path,required=True)
    evaluation.add_argument('--snapshot',type=Path,action='append',default=[])
    evaluation.add_argument('--observer',required=True)
    evaluation.add_argument('--rubric',required=True)
    evaluation.add_argument('--mode',choices=['forward','leave_one_day_out'],default='forward')
    evaluation.add_argument('--operational',action='store_true',help='requires Git-verified actual storage evidence; never backfill performance')
    evaluation.add_argument('--output',type=Path,required=True)
    scaler=commands.add_parser("scaler",help="fit median/IQR to environment-only rows available at cutoff")
    scaler.add_argument("--input",type=Path,required=True)
    scaler.add_argument("--cutoff",required=True)
    scaler.add_argument("--output",type=Path,required=True)
    seal=commands.add_parser("seal",help="select a D+1 run using Git-verified receipts and fixed cutoff")
    seal.add_argument("--date",required=True)
    seal.add_argument("--publish",action="store_true")
    return cli


def main(argv=None):
    args=parser().parse_args(argv)
    root=args.root.resolve()
    try:
        if args.command=="status":
            geometry=load_geometry(root); sources=load_sources(root)
            result=dict(sites=len(geometry["sites"]),verified_sites=sum(entry["status"]=="verified" for entry in geometry["sites"]),zones=len(geometry["zones"]),sources={key:dict(dataset=value["dataset"],version=value["dataset_version"],public_export_allowed=value["redistribution"]["derived_allowed"]) for key,value in sources.items()})
        elif args.command=="collect":
            head=subprocess.run(["git","rev-parse","HEAD"],cwd=root,capture_output=True,text=True,check=True).stdout.strip()
            dirty=subprocess.run(["git","status","--porcelain"],cwd=root,capture_output=True,text=True,check=True).stdout.strip()
            if args.code_commit != head or dirty:
                raise SnapshotError("code_commit_unverified_or_dirty")
            run_id=args.run_id or str(uuid4())
            prefix=bundle_path(args.date,run_id,args.kind)
            store=store_from_env() if args.publish else None
            manifest=None;files=None
            if store:
                head=store.head()
                existing=store.read(prefix+"/manifest.json",head)
                if existing:
                    manifest=json.loads(existing)
                    feature_bytes=store.read(prefix+"/features.json.gz",head);forecast_bytes=store.read(prefix+"/forecast.json.gz",head)
                    if feature_bytes is None or forecast_bytes is None:
                        raise SnapshotError("incomplete_snapshot_bundle")
                    files=make_bundle(manifest,json.loads(gzip.decompress(feature_bytes)),json.loads(gzip.decompress(forecast_bytes)),root=root,kind=args.kind)
            if manifest is None:
                model=read_json(args.model) if args.model else None
                if args.model_from_data:
                    if args.model or not args.observer or not args.rubric: raise ValueError('model_observer_rubric_required')
                    from bunaken_engine.model_input import data_inputs
                    from bunaken_engine.model_data import model_context
                    cutoff=utc_now()
                    _, observations, bundles=data_inputs(store or store_from_env(),cutoff,root=root)
                    model=model_context(observations,bundles,args.observer,args.rubric,cutoff,root=root)
                manifest,files=collect_run(args.date,args.code_commit,days=args.days,run_id=run_id,kind=args.kind,root=root,
                                          model=model)
            write_files(args.output,files)
            receipt=publish_bundle(store,manifest,files,root=root) if store else None
            result=dict(run_id=run_id,status=manifest["status"],samples=len(manifest["samples"]),source_status=manifest["source_status"],saved_to_public_repository=receipt is not None,storage_commit=receipt["storage_commit"] if receipt else None)
        elif args.command in {'model','validate-model'}:
            from bunaken_engine.model_data import read_bundle, model_context, prepare_model
            observations=read_json(args.observations)
            bundles=[read_bundle(path, root=root) for path in args.snapshot]
            if args.command == 'model':
                context=model_context(observations,bundles,args.observer,args.rubric,args.cutoff,root=root)
                candidates,scaler,excluded=prepare_model(observations,bundles,args.observer,args.rubric,args.cutoff,root=root)
                write_files(args.output.parent,{args.output.name:canonical(context)})
                result=dict(model_context_sha256=digest(canonical(context)),eligible_records=len(candidates),excluded_records=len(excluded),scaler_rows=scaler['row_count'])
            else:
                from bunaken_engine.validation import evaluate
                if args.operational:
                    store=store_from_env(); head=store.head()
                    for bundle in bundles:
                        run=bundle['manifest']['run_id']
                        raw=store.read(f'snapshot-receipts/{run}.json',head)
                        if raw is None: continue
                        receipt=verified_receipt(store,json.loads(raw),head,root=root)
                        if receipt['storage_verified']:
                            bundle['storage_evidence']={key:receipt[key] for key in ('storage_verified','persisted_at','manifest_sha256','storage_commit')}
                report=evaluate(observations,bundles,args.observer,args.rubric,mode=args.mode,operational=args.operational,root=root)
                write_files(args.output.parent,{args.output.name:canonical(report)})
                result=dict(mode=report['mode'],operational_forecast=report['operational_forecast'],**report['metrics'])
        elif args.command=="scaler":
            data=read_json(args.input)
            if isinstance(data,dict):
                data=historical_rows(args.input,root=root)
            registry=read_json(root/"config/features.json")
            features=[name for group in registry["groups"].values() for name in group["features"]]
            result=build_scaler(data,features,args.cutoff)
            result["input_sha256"]=digest(args.input.read_bytes())
            result["feature_version"]=registry["version"]
            result["version"]=digest(canonical(result))
            write_files(args.output.parent,{args.output.name:canonical(result)})
            result=dict(version=result["version"],row_count=result["row_count"],enabled_features=sum(item["enabled"] for item in result["features"].values()))
        else:
            store=store_from_env();head=store.head();receipts=store.receipts(head,args.date)
            if args.publish:
                result=publish_seal(store,args.date,receipts,root=root)
            else:
                candidates=[verified_receipt(store,receipt,head,root=root) for receipt in receipts]
                result=select_seal(args.date,candidates,utc_now())
        print(json.dumps(result,ensure_ascii=False,sort_keys=True))
        return 0
    except (SourceError,StorageError,SnapshotError) as error:
        print(json.dumps(dict(error=str(error))),file=sys.stderr)
        return 1
    except (ValueError,TypeError,KeyError,OSError,ValidationError,subprocess.CalledProcessError):
        print(json.dumps(dict(error="request_or_configuration_invalid")),file=sys.stderr)
        return 1


if __name__=="__main__":
    raise SystemExit(main())
