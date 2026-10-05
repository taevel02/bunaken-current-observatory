"""Read-only preparation of actual dive windows and immutable analysis outputs."""
from datetime import timedelta
from uuid import uuid4
from bunaken_engine.features import instant
from bunaken_engine.model_data import eligible_candidates, latest_revisions, checked_bundles, read_bundle, model_context, prepare_model
from bunaken_engine.pipeline import collect_run
from bunaken_engine.registry import ROOT
from bunaken_engine.snapshots import canonical, digest
from bunaken_engine.sources import utc_now
from bunaken_engine.time import wita_date


def collection_plan(observations, bundles, observer, rubric, cutoff, *, root=ROOT):
    """Only missing environments cause IO; unknown field depth stays unknown."""
    _, excluded = eligible_candidates(observations, bundles, observer, rubric, cutoff, root=root)
    missing = [r for r in latest_revisions(observations, cutoff=cutoff, root=root)
               if excluded.get(r['id']) == 'environment_link_unavailable']
    dates = set()
    depths = set()
    for row in missing:
        end = instant(row['end_at']) if row['end_at'] else instant(row['start_at']) + timedelta(hours=1)
        first, last = wita_date(row['start_at']), wita_date((end-timedelta(microseconds=1)).isoformat())
        dates.update(first+timedelta(days=i) for i in range((last-first).days+1))
        depths.add(row['representative_depth_m'])
    # Adjacent days may share one regional read, bounded by the normal collection horizon.
    ranges=[]
    for day in sorted(dates):
        if ranges and day == ranges[-1][0]+timedelta(days=ranges[-1][1]) and ranges[-1][1]<14:
            ranges[-1]=(ranges[-1][0],ranges[-1][1]+1)
        else: ranges.append((day,1))
    return dict(ranges=[dict(date=day.isoformat(),days=days) for day,days in ranges],
                depths=sorted(depths), missing_ids=sorted(row['id'] for row in missing), excluded=excluded)


def enrich(observations, bundles, observer, rubric, code_commit, output, *, root=ROOT, collector=None, source_data_commit=None):
    from bunaken_engine.__main__ import write_files
    bundles=checked_bundles(bundles,root=root)
    plan=collection_plan(observations,bundles,observer,rubric,utc_now(),root=root)
    output.mkdir(parents=True,exist_ok=False)
    new_runs=[]
    for interval in plan['ranges']:
        manifest,files=collect_run(interval['date'],code_commit,days=interval['days'],kind='backfill',
                                  run_id=str(uuid4()),root=root,collector=collector,extraction_depths=plan['depths'])
        write_files(output,files)
        path=next(output/name for name in files if name.endswith('/manifest.json'))
        bundles.append(read_bundle(path,root=root))
        new_runs.append(dict(snapshot_id=manifest['snapshot_id'],status=manifest['status'],source_status=manifest['source_status']))
    cutoff=utc_now()
    context=model_context(observations,bundles,observer,rubric,cutoff,root=root)
    candidates,scaler,excluded=prepare_model(observations,bundles,observer,rubric,cutoff,root=root)
    links=[row['environment_link'] for row in candidates]
    files={'model-context.json':canonical(context),'scaler.json':canonical(scaler),'environment-links.json':canonical(links)}
    report=dict(kind='analysis_enrichment',code_commit=code_commit,created_at=cutoff,
                source_data_commit=source_data_commit,observer=observer,rubric=rubric,new_runs=new_runs,collection_plan=plan,
                eligible_candidates=len(candidates),excluded=excluded,scaler_rows=scaler['row_count'],
                enabled_features=[name for name,value in scaler['features'].items() if value['enabled']],
                artifact_hashes={name:digest(data) for name,data in files.items()},
                saved_to_public_repository=False,operational_forecast=False)
    write_files(output,{**files,'enrichment.json':canonical(report)})
    return report
