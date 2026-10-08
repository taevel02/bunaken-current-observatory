"""Match observed Overall PCI only to the immutable, Git-confirmed official D+1 slots."""
import argparse
import gzip
import json
from collections import defaultdict
from statistics import median
from datetime import timedelta
from pathlib import Path

from bunaken_engine.features import instant, finite
from bunaken_engine.model_data import latest_revisions
from bunaken_engine.pipeline import verified_receipt
from bunaken_engine.registry import ROOT
from bunaken_engine.snapshot_io import decode_manifest
from bunaken_engine.snapshots import canonical, digest, validate, seal_cutoff, SnapshotError
from bunaken_engine.sources import utc_now
from bunaken_engine.time import wita_date
from bunaken_engine.validation import metrics

RULE = 'stored-slot-midpoint-15m-v1'


def choose_slot(observation, predictions):
    """Fixed matching rule, not post-hoc choice by actual PCI or error."""
    if not observation.get('end_at'): return None,'observation_end_missing'
    start,end=instant(observation['start_at']),instant(observation['end_at'])
    if end<=start or end-start>timedelta(hours=1): return None,'unsupported_observation_duration'
    midpoint=start+(end-start)/2
    eligible=[]
    for row in predictions:
        if (row['site_id'] != observation['site_id'] or row['zone_id'] != observation['zone_id'] or
            row.get('reference_depth_m') != observation['representative_depth_m'] or row['duration_minutes'] != 60 or
            wita_date(row['start_at']) != wita_date(observation['start_at'])): continue
        at=instant(row['start_at']);offset=abs((at+timedelta(minutes=30)-midpoint).total_seconds())
        if offset <= 15*60: eligible.append((offset,at,row))
    if not eligible: return None,'matching_slot_unavailable'
    # Keep a null slot instead of finding another slot that happens to provide a number.
    return min(eligible,key=lambda row:row[:2])[2],None


def match_rows(observations, predictions, *, unavailable_reason=None, scope=None, baseline_pool=None):
    rows=[]
    for observation in observations:
        reason=unavailable_reason
        if scope and (observation['observer_id'],observation['rubric_version']) != scope:
            reason='incompatible_observer_rubric'
        slot,reason=(None,reason) if reason else choose_slot(observation,predictions)
        valid_pool=baseline_pool or [] if slot is not None else []
        labels=[row['pci'] for row in valid_pool if finite(row.get('pci'))]
        site_labels=[row['pci'] for row in valid_pool if finite(row.get('pci')) and row['site_id']==observation['site_id']]
        actual=observation['overall_pci']
        predicted=slot['pci'] if slot else None
        rows.append(dict(id=observation['id'],revision=observation['revision'],
                         observation_sha256=digest(canonical(observation)),day=wita_date(observation['start_at']).isoformat(),
                         site_id=observation['site_id'],zone_id=observation['zone_id'],
                         observation_start_at=observation['start_at'],observation_end_at=observation['end_at'],
                         actual=actual,pci=predicted,absolute_error=abs(predicted-actual) if finite(predicted) else None,
                         prediction_start_at=slot['start_at'] if slot else None,
                         prediction_duration_minutes=slot['duration_minutes'] if slot else None,
                         model_version=slot['model_version'] if slot else None,
                         support=slot['support'] if slot else None,
                         temporal_match='approximate_window' if slot else None,
                         midpoint_offset_minutes=abs((instant(slot['start_at'])+timedelta(minutes=30)-
                            (instant(observation['start_at'])+(instant(observation['end_at'])-instant(observation['start_at']))/2)).total_seconds())/60 if slot else None,
                         reason_codes=[reason] if reason else (slot['reason_codes'] if predicted is None else []),
                         global_baseline=median(labels) if labels else None,site_baseline=median(site_labels) if site_labels else None))
    return rows


def observations_from_head(store,head,root=ROOT):
    commit=store.request('GET',f'/git/commits/{head}')
    tree=store.request('GET',f"/git/trees/{commit['tree']['sha']}?recursive=1")
    if tree.get('truncated'): raise SnapshotError('matching_tree_truncated')
    import re
    result=[]
    for entry in tree['tree']:
        path=entry['path'];match=re.fullmatch(r'observations/([0-9a-f-]{36})/revisions/(\d{6})\.json',path)
        if entry['type'] != 'blob' or not match: continue
        row=json.loads(store.read_observation_revision(path,head));validate('observation-revision',row,root)
        if row['id'] != match[1] or row['revision'] != int(match[2]): raise SnapshotError('matching_revision_identity_mismatch')
        result.append(row)
    return result


def official_predictions(store,head,day,root=ROOT):
    seal_raw=store.read(f'seals/target-{day}.json',head)
    if seal_raw is None: return [],None,'official_seal_missing',None,[]
    seal=json.loads(seal_raw);validate('seal',seal,root)
    if seal['target_date_wita'] != day or instant(seal['cutoff_at']) != seal_cutoff(day):
        raise SnapshotError('matching_seal_identity_mismatch')
    if seal['status'] != 'sealed': return [],dict(seal_sha256=digest(seal_raw)),'missed_d1_snapshot',None,[]
    raw=store.read(f"snapshot-receipts/{seal['run_id']}.json",head)
    if raw is None: raise SnapshotError('matching_receipt_missing')
    receipt=verified_receipt(store,json.loads(raw),head,root=root)
    if (not receipt['storage_verified'] or receipt['kind'] != 'snapshot' or receipt['status'] != 'succeeded' or
        receipt['storage_commit'] != seal['storage_commit'] or receipt['manifest_sha256'] != seal['manifest_sha256'] or
        instant(receipt['persisted_at']) >= seal_cutoff(day)):
        raise SnapshotError('matching_forecast_not_operational')
    manifest=decode_manifest(store.read(receipt['manifest_path'],receipt['storage_commit']),input_reader=lambda path:store.read(path,receipt['storage_commit']))
    context=manifest.get('model_context');scope=None;baseline_pool=[]
    if context:
        if instant(context['cutoff']) > seal_cutoff(day): raise SnapshotError('matching_model_cutoff_after_d1')
        from bunaken_engine.model_data import replay_root, eligible_candidates
        with replay_root(context,root) as replay:
            baseline_pool,_=eligible_candidates(context['observations'],context['training_bundles'],context['observer'],context['rubric'],context['cutoff'],root=replay)
        scope=(context['observer'],context['rubric'])
    prefix=receipt['manifest_path'].rsplit('/',1)[0]
    forecast_raw=store.read(prefix+'/forecast.json.gz',receipt['storage_commit'])
    predictions=json.loads(gzip.decompress(forecast_raw))
    evidence=dict(run_id=receipt['run_id'],storage_commit=receipt['storage_commit'],
                  manifest_sha256=receipt['manifest_sha256'],persisted_at=receipt['persisted_at'],
                  seal_sha256=digest(seal_raw),forecast_sha256=digest(forecast_raw),cutoff_at=seal['cutoff_at'])
    return predictions,evidence,None,scope,baseline_pool


def build_reports(store,*,root=ROOT,code_commit):
    head=store.head();by_day=defaultdict(list);excluded_by_day=defaultdict(list)
    history=observations_from_head(store,head,root)
    current=latest_revisions(history,root=root);current_by_id={row['id']:row for row in current}
    for previous in history:
        day=wita_date(previous['start_at']).isoformat();by_day[day]
        now=current_by_id[previous['id']]
        if wita_date(now['start_at']).isoformat()!=day:
            excluded=dict(id=now['id'],revision=now['revision'],observation_sha256=digest(canonical(now)),reason='observation_moved_day')
            if excluded not in excluded_by_day[day]:excluded_by_day[day].append(excluded)
    for row in current:
        if (row['record_status'] not in {'active','corrected'} or row['label_scope'] != 'dive_overall' or
            not finite(row['overall_pci']) or not row['use_for_model']):
            excluded_by_day[wita_date(row['start_at']).isoformat()].append(dict(id=row['id'],revision=row['revision'],observation_sha256=digest(canonical(row)),reason='inactive_or_model_excluded_label'))
            continue
        by_day[wita_date(row['start_at']).isoformat()].append(row)
    reports=[]
    for day,observations in sorted(by_day.items()):
        predictions,evidence,reason,scope,baseline_pool=official_predictions(store,head,day,root)
        rows=match_rows(observations,predictions,unavailable_reason=reason,scope=scope,baseline_pool=baseline_pool)
        # Split observer/rubric: never pool different subjective scales in one MAE.
        groups=defaultdict(list)
        for observation,row in zip(observations,rows): groups[(observation['observer_id'],observation['rubric_version'])].append(row)
        cohort_metrics=[dict(observer_id=observer,rubric_version=rubric,metrics=metrics(values,None))
                        for (observer,rubric),values in sorted(groups.items())]
        excluded=sorted(excluded_by_day[day],key=lambda row:row['id'])
        identity=digest(canonical(dict(rule=RULE,code_commit=code_commit,day=day,evidence=evidence,rows=rows,excluded=excluded)))
        report=dict(schema_version='1.0',rule=RULE,date_wita=day,input_sha256=identity,code_commit=code_commit,
                    source_data_commit=head,generated_at=utc_now(),official_snapshot=evidence,
                    rows=rows,excluded_observations=excluded,cohort_metrics=cohort_metrics,
                    limitations=['stored_60m_slot_vs_actual_dive_interval','approximate_temporal_match',
                                 'pci_is_subjective_not_velocity_or_safety','nulls_are_abstentions',
                                 'no_recalculation_of_stored_forecast'])
        validate('d1-comparison',report,root);reports.append(report)
    return reports


def report_files(store,reports,*,publish,root=ROOT):
    """Concurrent collect/seal retries converge on the first confirmed identical report."""
    from bunaken_engine.git_store import StorageError
    semantic=('input_sha256','rows','excluded_observations','official_snapshot','cohort_metrics','code_commit','rule')
    for attempt in range(3):
        files={};head=store.head()
        for report in reports:
            path=f"validation/d1/{report['date_wita']}/{report['input_sha256']}.json"
            existing=store.read(path,head) if publish else None
            if existing is not None:
                previous=json.loads(existing);validate('d1-comparison',previous,root)
                if any(previous[key]!=report[key] for key in semantic):raise SnapshotError('matching_immutable_conflict')
                files[path]=existing
            else:files[path]=canonical(report)
        if not publish or not files:return files
        try:
            store.insert(files,'record immutable official D+1 observation comparison')
            return files
        except StorageError as error:
            if str(error)!='immutable_conflict' or attempt==2:raise
    raise SnapshotError('matching_retry_exhausted')


def main(argv=None):
    from bunaken_engine.__main__ import store_from_env,write_files
    import re
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--code-commit',required=True);parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--publish',action='store_true');args=parser.parse_args(argv)
    if not re.fullmatch('[0-9a-f]{40}',args.code_commit): parser.error('full code SHA required')
    store=store_from_env();reports=build_reports(store,code_commit=args.code_commit)
    if args.publish:
        import subprocess
        actual=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
        dirty=subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip()
        if actual!=args.code_commit or dirty:raise SnapshotError('code_commit_unverified_or_dirty')
    files=report_files(store,reports,publish=args.publish)
    write_files(args.output,files)
    print(json.dumps(dict(days=len(reports),observations=sum(len(r['rows']) for r in reports),
                          compared=sum(row['pci'] is not None for r in reports for row in r['rows']),
                          saved_to_public_repository=args.publish and bool(files))))
    return 0

if __name__=='__main__':
    import sys
    from bunaken_engine.git_store import StorageError
    from jsonschema.exceptions import ValidationError
    try: raise SystemExit(main())
    except (SnapshotError,StorageError) as error:
        print(json.dumps({'error':str(error)}),file=sys.stderr);raise SystemExit(1)
    except (ValueError,TypeError,KeyError,ValidationError):
        print(json.dumps({'error':'matching_input_invalid'}),file=sys.stderr);raise SystemExit(1)
