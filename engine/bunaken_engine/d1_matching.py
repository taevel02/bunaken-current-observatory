"""Match observed Overall PCI only to the immutable, Git-confirmed official D+1 slots."""
import argparse
import gzip
import json
import re
from collections import defaultdict
from statistics import median
from datetime import date, timedelta
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
    result=[]
    for entry in tree['tree']:
        path=entry['path'];match=re.fullmatch(r'observations/([0-9a-f-]{36})/revisions/(\d{6})\.json',path)
        if entry['type'] != 'blob' or not match: continue
        row=json.loads(store.read_observation_revision(path,head));validate('observation-revision',row,root)
        if row['id'] != match[1] or row['revision'] != int(match[2]): raise SnapshotError('matching_revision_identity_mismatch')
        result.append(row)
    return result


def changed_inputs(store,head,root=ROOT):
    """Return changed observation IDs and sealed dates, or None for a full rebuild."""
    def tree_at(commit_sha):
        commit=store.request('GET',f'/git/commits/{commit_sha}')
        if not commit:raise SnapshotError('matching_change_commit_missing')
        tree_sha=commit.get('tree',{}).get('sha')
        if not re.fullmatch(r'[0-9a-f]{40}',tree_sha or ''):raise SnapshotError('matching_change_tree_invalid')
        tree=store.request('GET',f'/git/trees/{tree_sha}?recursive=1')
        if not tree or tree.get('truncated'):raise SnapshotError('matching_change_tree_truncated')
        entries={}
        for entry in tree.get('tree',[]):
            if entry.get('type')!='blob':continue
            path,sha=entry.get('path'),entry.get('sha')
            if not isinstance(path,str) or not re.fullmatch(r'[0-9a-f]{40}',sha or ''):
                raise SnapshotError('matching_change_tree_invalid')
            entries[path]=sha
        return entries

    current=tree_at(head)
    checkpoint_paths=[path for path in current if re.fullmatch(r'validation/d1/checkpoints/\d{20}-\d{5}\.json',path)]
    if checkpoint_paths:
        checkpoint_path=max(checkpoint_paths)
        raw=store.read(checkpoint_path,head)
        if raw is None:raise SnapshotError('matching_checkpoint_missing')
        try:checkpoint=json.loads(raw)
        except (TypeError,ValueError):raise SnapshotError('matching_checkpoint_invalid') from None
        validate('d1-checkpoint',checkpoint,root)
        expected_path=f"validation/d1/checkpoints/{int(checkpoint['workflow_run_id']):020d}-{checkpoint['workflow_run_attempt']:05d}.json"
        if checkpoint_path!=expected_path:raise SnapshotError('matching_checkpoint_identity_mismatch')
        before=checkpoint['source_data_commit']
    else:
        # Use the last published report to recover changes missed before the first checkpoint.
        commits=store.request('GET',f'/commits?sha={head}&path=validation/d1&per_page=1')
        if not commits:return None
        if not isinstance(commits,list) or not isinstance(commits[0],dict):raise SnapshotError('matching_checkpoint_commit_invalid')
        match_sha=commits[0].get('sha')
        if not re.fullmatch(r'[0-9a-f]{40}',match_sha or ''):raise SnapshotError('matching_checkpoint_commit_invalid')
        details=store.request('GET',f'/commits/{match_sha}')
        if not details:raise SnapshotError('matching_checkpoint_commit_missing')
        files=details.get('files')
        if not isinstance(files,list):raise SnapshotError('matching_checkpoint_commit_invalid')
        report_paths=[row['filename'] for row in files if isinstance(row,dict) and
                      re.fullmatch(r'validation/d1/\d{4}-\d{2}-\d{2}/[a-f0-9]{64}\.json',row.get('filename',''))]
        if not report_paths:return None
        raw=store.read(report_paths[0],match_sha)
        if raw is None:raise SnapshotError('matching_checkpoint_report_missing')
        try:report=json.loads(raw)
        except (TypeError,ValueError):raise SnapshotError('matching_checkpoint_report_invalid') from None
        validate('d1-comparison',report,root)
        before=report['source_data_commit']
    if not re.fullmatch(r'[0-9a-f]{40}',before or '') or before=='0'*40:return None
    if before==head:return set(),set()
    previous=tree_at(before)
    changed={path for path in previous.keys()|current.keys() if previous.get(path)!=current.get(path)}
    observation_ids=set();days=set()
    for path in changed:
        if path.startswith('observations/'):
            match=re.fullmatch(r'observations/([0-9a-f-]{36})/(?:current\.json|revisions/\d{6}\.json)',path)
            if not match:raise SnapshotError('matching_observation_path_invalid')
            if path in previous and path not in current:raise SnapshotError('matching_observation_history_removed')
            observation_ids.add(match[1])
        elif path.startswith('seals/'):
            match=re.fullmatch(r'seals/target-(\d{4}-\d{2}-\d{2})\.json',path)
            if not match:raise SnapshotError('matching_seal_path_invalid')
            if path in previous and path not in current:raise SnapshotError('matching_seal_removed')
            day=match[1]
            try:
                if date.fromisoformat(day).isoformat()!=day:raise ValueError
            except ValueError:raise SnapshotError('matching_seal_date_invalid') from None
            days.add(day)
    return observation_ids,days


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


def build_reports(store,*,root=ROOT,code_commit,incremental=False,head=None):
    head=head or store.head();by_day=defaultdict(list);excluded_by_day=defaultdict(list)
    changed_ids=None;selected_days=None
    if incremental:
        changes=changed_inputs(store,head,root)
        if changes is not None:
            changed_ids,changed_seal_days=changes
            if not changed_ids and not changed_seal_days:return []
    # shortcut: full revision scan preserves moved-day exclusions; add an index if those reads become the bottleneck.
    history=observations_from_head(store,head,root)
    current=latest_revisions(history,root=root);current_by_id={row['id']:row for row in current}
    if changed_ids is not None:
        if not changed_ids.issubset(current_by_id):raise SnapshotError('matching_changed_observation_missing')
        selected_days=set(changed_seal_days)
        selected_days.update(wita_date(row['start_at']).isoformat() for row in history if row['id'] in changed_ids)
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
        if selected_days is not None and day not in selected_days:continue
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


def report_files(store,reports,*,publish,checkpoint=None,root=ROOT):
    """Concurrent matcher retries converge on the first confirmed identical report."""
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
        if checkpoint:files.update(checkpoint)
        if not publish or not files:return files
        try:
            store.insert(files,'record immutable official D+1 observation comparison')
            return files
        except StorageError as error:
            if str(error)!='immutable_conflict' or attempt==2:raise
    raise SnapshotError('matching_retry_exhausted')


def main(argv=None):
    from bunaken_engine.__main__ import store_from_env,write_files
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--code-commit',required=True);parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--incremental',action='store_true')
    parser.add_argument('--run-id');parser.add_argument('--run-attempt',type=int,default=1)
    parser.add_argument('--publish',action='store_true');args=parser.parse_args(argv)
    if not re.fullmatch('[0-9a-f]{40}',args.code_commit): parser.error('full code SHA required')
    if args.run_id is not None and not re.fullmatch(r'\d{1,20}',args.run_id):parser.error('workflow run ID must be decimal')
    if args.run_attempt<1 or args.run_attempt>99999:parser.error('workflow run attempt is out of range')
    if args.publish and args.run_id is None:parser.error('--run-id is required when publishing')
    store=store_from_env();head=store.head();reports=build_reports(store,code_commit=args.code_commit,incremental=args.incremental,head=head)
    if args.publish:
        import subprocess
        actual=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
        dirty=subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip()
        if actual!=args.code_commit or dirty:raise SnapshotError('code_commit_unverified_or_dirty')
    checkpoint={}
    if args.publish and args.run_id is not None:
        path=f"validation/d1/checkpoints/{int(args.run_id):020d}-{args.run_attempt:05d}.json"
        checkpoint[path]=canonical(dict(schema_version='1.0',workflow_run_id=args.run_id,
                                        workflow_run_attempt=args.run_attempt,source_data_commit=head,
                                        code_commit=args.code_commit))
    files=report_files(store,reports,publish=args.publish,checkpoint=checkpoint)
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
