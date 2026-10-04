"""Synthetic end-to-end provider -> labels -> replay -> public release fixtures."""
import copy
import gzip
import json
import math
import shutil
import tempfile
import unittest
from pathlib import Path
from datetime import timedelta
from unittest.mock import patch

from bunaken_engine.features import instant
from bunaken_engine.registry import ROOT, read_json
from bunaken_engine.sources import sample
from bunaken_engine.pipeline import collect_run
from bunaken_engine.model_data import model_context, prepare_model, environment_rows, read_bundle, checked_bundles
from bunaken_engine.snapshots import make_bundle, canonical, digest
from bunaken_engine.validation import evaluate
from bunaken_engine.public_release import build_release
from test_model_data import observation


class ModelIntegrationTest(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory(); self.addCleanup(self.folder.cleanup)
        self.root=Path(self.folder.name)
        shutil.copytree(ROOT/'config',self.root/'config')
        shutil.copytree(ROOT/'packages/contracts',self.root/'packages/contracts')
        geometry=read_json(self.root/'config/geometry.json')
        for point in geometry['sites']:
            if point['site_id']=='mandolin':
                point.update(status='verified',wall_bearing_deg=0,offshore_bearing_deg=90,max_grid_distance_km=10,
                             evidence=['synthetic fixture only'],version='synthetic-geometry')
            else:
                point['status']='unverified'
                for key in ('lat','lon','reference_depth_m','wall_bearing_deg','offshore_bearing_deg','max_grid_distance_km'): point[key]=None
        (self.root/'config/geometry.json').write_bytes(canonical(geometry))
        self.observations=[]; self.bundles=[]
        for day in (1,2,3):
            self.observations.append(observation(id=f'4f6f6c58-84a8-4dd5-b882-8ce58ee14b{day+40:02d}',
                start_at=f'2026-09-{day:02d}T00:00:00Z',end_at=f'2026-09-{day:02d}T01:00:00Z',
                created_at=f'2026-09-{day:02d}T02:00:00Z',updated_at=f'2026-09-{day:02d}T02:00:00Z'))
            created=f'2026-09-{day:02d}T02:00:00Z'
            with patch('bunaken_engine.pipeline.utc_now',return_value=created):
                manifest,files=collect_run(f'2026-09-{day:02d}','a'*40,days=1,run_id=f'11111111-1111-4111-8111-{day:012d}',root=self.root,
                                          collector=self.collector(day,created))
            self.bundles.append(dict(manifest=manifest,
                features=json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('features.json.gz')))),
                forecast=json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('forecast.json.gz'))))))

    def collector(self,day,created):
        def collect(source,geometry,start,end):
            result=[]
            first=instant(start)-timedelta(hours=2)
            for hour in range(29):
                at=first+timedelta(hours=hour)
                angle=(hour+day)*.2
                for variable in source['variables']:
                    depths=(10,18,30) if source['provider']=='copernicus' else (None,)
                    for depth in depths:
                        if variable=='tide_height': value=math.sin(angle)
                        elif variable in {'uo','vo'}: value=.1*day+.01*hour+.001*depth*day
                        elif variable=='thetao': value=27+.1*day+.01*hour-.01*depth*day
                        elif variable=='so': value=33+.1*day
                        elif 'direction' in variable: value=(hour*7+day*10)%360
                        else: value=.1*day+.01*hour
                        result.append(sample(source,geometry,variable,value,at.isoformat(),created,depth=depth,issued_at=created,flags=['synthetic']))
            return result
        return collect

    def test_actual_interval_links_numeric_replay_and_public_export(self):
        candidates,scaler,excluded=prepare_model(self.observations,self.bundles,'synthetic-observer','synthetic-rubric','2026-09-04T02:00:00Z',root=self.root)
        self.assertEqual(len(candidates),3,excluded)
        self.assertEqual(candidates[0]['environment_link']['interval_kind'],'dive_interval')
        context=model_context(self.observations,self.bundles,'synthetic-observer','synthetic-rubric','2026-09-04T02:00:00Z',root=self.root)
        archive=self.root/'config/model-configurations'/f"{digest(canonical(context['configuration']))}.json"
        archive.parent.mkdir(parents=True,exist_ok=True);archive.write_bytes(canonical(context['configuration']))
        with patch('bunaken_engine.pipeline.utc_now',return_value='2026-09-04T03:00:00Z'):
            manifest,files=collect_run('2026-09-05','a'*40,days=1,run_id='11111111-1111-4111-8111-111111111115',root=self.root,
                                      collector=self.collector(2,'2026-09-04T03:00:00Z'),model=context)
        forecast=json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('forecast.json.gz'))))
        numeric=[row for row in forecast if row['pci'] is not None]
        self.assertTrue(numeric,[(row['feature_coverage'],row['reason_codes']) for row in forecast if row['site_id']=='mandolin'])
        self.assertTrue(all(row['pci']>1 and row['support'] in {'low','very_low'} for row in numeric))
        for path,raw in files.items():
            destination=self.root/'output'/path;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(raw)
        snapshot=next(self.root/'output'/path for path in files if path.endswith('manifest.json'))
        release,published=build_release('b'*40,manifest_path=snapshot,observations=self.observations,root=self.root)
        self.assertTrue(published)
        # A later model configuration change cannot invalidate the frozen old model.
        config=read_json(self.root/'config/model.json');config['version']='synthetic-next-version'
        (self.root/'config/model.json').write_bytes(canonical(config))
        features=json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('features.json.gz'))))
        self.assertEqual(make_bundle(manifest,features,forecast,root=self.root),files)
        source_config=read_json(self.root/'config/source-registry.json')
        source_config['sources'][1]['dataset']='synthetic-next-dataset'
        (self.root/'config/source-registry.json').write_bytes(canonical(source_config))
        feature_config=read_json(self.root/'config/features.json')
        feature_config['groups']['weather']['features'].remove('wave_height_m')
        (self.root/'config/features.json').write_bytes(canonical(feature_config))
        self.assertEqual(make_bundle(manifest,features,forecast,root=self.root),files)
        projected=read_bundle(snapshot,root=self.root)
        self.assertEqual(len(checked_bundles([projected],root=self.root)),1)
        prepare_model([], [projected], 'synthetic-observer','synthetic-rubric','2026-09-10T00:00:00Z',root=self.root)
        # Revoked sources cannot re-enter through an embedded historical training bundle.
        source_config['sources'][4]['redistribution']['derived_allowed']=False
        (self.root/'config/source-registry.json').write_bytes(canonical(source_config))
        from bunaken_engine.snapshots import SnapshotError
        with self.assertRaisesRegex(SnapshotError,'training_source_export_forbidden'):make_bundle(manifest,features,forecast,root=self.root)
        source_config['sources'][4]['redistribution']['derived_allowed']=True
        source_config['sources'][1]['redistribution']['derived_allowed']=False
        (self.root/'config/source-registry.json').write_bytes(canonical(source_config))
        with self.assertRaisesRegex(SnapshotError,'source_export_forbidden'):make_bundle(manifest,features,forecast,root=self.root)

    def test_storage_availability_and_revision_date_change(self):
        bundles=copy.deepcopy(self.bundles)
        for bundle in bundles:
            bundle['storage_evidence']=dict(storage_verified=True,persisted_at='2026-09-20T00:00:00Z',
                manifest_sha256=digest(canonical(bundle['manifest'])),storage_commit='b'*40)
        candidates,scaler,excluded=prepare_model(self.observations,bundles,'synthetic-observer','synthetic-rubric','2026-09-04T00:00:00Z',root=self.root)
        self.assertEqual(candidates,[])
        self.assertEqual(scaler['row_count'],0)
        changed=observation(revision=2,start_at='2026-09-03T00:00:00Z',end_at='2026-09-03T01:00:00Z',updated_at='2026-09-05T00:00:00Z')
        history=[observation(),changed]
        report=evaluate(history,self.bundles,'synthetic-observer','synthetic-rubric',mode='leave_one_day_out',root=self.root)
        self.assertTrue(all(changed['id'] not in fold['training_ids'] for fold in report['folds']))
        context=model_context(history,self.bundles,'synthetic-observer','synthetic-rubric','2026-09-06T00:00:00Z',root=self.root)
        self.assertEqual(len(context['observations']),2)

    def test_mixed_events_and_legacy_vertical_remain_separate_from_numeric_pci(self):
        first=copy.deepcopy(self.observations[0])
        first['vertical']['direction']='mixed'
        first['peak_events']=[dict(id='22222222-2222-4222-8222-222222222222',pci=9,vertical_direction='down',vertical_intensity=None,
                                  local_at='2026-09-01T08:10',at='2026-09-01T00:10:00Z',depth_m=18,zone_id=None,duration_description='synthetic',context_description='synthetic')]
        candidates,_,_=prepare_model([first],self.bundles,'synthetic-observer','synthetic-rubric','2026-09-04T00:00:00Z',root=self.root)
        self.assertEqual(candidates[0]['pci'],1.2)
        self.assertEqual(candidates[0]['vertical_events'],['down'])
        first['label_scope']='legacy_unspecified'
        candidates,_,_=prepare_model([first],self.bundles,'synthetic-observer','synthetic-rubric','2026-09-04T00:00:00Z',root=self.root)
        self.assertIsNone(candidates[0]['pci'])
        self.assertEqual(candidates[0]['vertical_events'],['down'])

    def test_publishing_compares_projected_samples_with_the_actual_storage_commit(self):
        from bunaken_engine.model_input import verify_context_storage
        from bunaken_engine.snapshots import SnapshotError
        from unittest.mock import Mock
        original=copy.deepcopy(self.bundles[0]);manifest=original['manifest']
        prefix=f"snapshots/{manifest['date_wita']}/{manifest['run_id']}"
        receipt=dict(storage_verified=True,manifest_sha256=digest(canonical(manifest)),storage_commit='b'*40,
                     manifest_path=prefix+'/manifest.json',persisted_at='2026-09-01T03:00:00Z')
        content={receipt['manifest_path']:canonical(manifest),prefix+'/features.json.gz':gzip.compress(canonical(original['features']),mtime=0),
                 prefix+'/forecast.json.gz':gzip.compress(canonical(original['forecast']),mtime=0),f"snapshot-receipts/{manifest['run_id']}.json":canonical(receipt)}
        store=Mock();store.read.side_effect=lambda path,ref:content[path]
        store.request.side_effect=lambda method,path:dict(tree=dict(sha='c'*40)) if '/git/commits/' in path else dict(tree=[],truncated=False)
        forged=copy.deepcopy(original);forged['origin_manifest_sha256']=receipt['manifest_sha256']
        forged['manifest']['samples'][0]['value']=999
        with patch('bunaken_engine.model_input.verified_receipt',return_value=receipt):
            verify_context_storage(store,dict(observations=[],training_bundles=[original],cutoff='2026-09-04T00:00:00Z'),'a'*40,root=self.root)
            with self.assertRaisesRegex(SnapshotError,'model_environment_projection_mismatch'):
                verify_context_storage(store,dict(observations=[],training_bundles=[forged],cutoff='2026-09-04T00:00:00Z'),'a'*40,root=self.root)
            receipt['persisted_at']='2026-09-20T00:00:00Z'
            with self.assertRaisesRegex(SnapshotError,'model_environment_stored_after_cutoff'):
                verify_context_storage(store,dict(observations=[],training_bundles=[original],cutoff='2026-09-04T00:00:00Z'),'a'*40,root=self.root)

    def test_publishing_cannot_omit_a_withdrawal_or_prior_revision(self):
        from bunaken_engine.model_input import verify_context_storage
        from bunaken_engine.snapshots import SnapshotError
        from unittest.mock import Mock
        first=copy.deepcopy(self.observations[0]); withdrawn=copy.deepcopy(first)
        withdrawn.update(revision=2,record_status='withdrawn',updated_at='2026-09-02T02:00:00Z')
        rows=[first,withdrawn]
        content={f"observations/{row['id']}/revisions/{row['revision']:06d}.json":canonical(row) for row in rows}
        store=Mock();store.read_observation_revision.side_effect=lambda path,ref:content[path]
        store.request.side_effect=lambda method,path:dict(tree=dict(sha='c'*40)) if '/git/commits/' in path else dict(tree=[dict(type='blob',path=path) for path in content],truncated=False)
        context=dict(observations=[first],training_bundles=[],cutoff='2026-09-04T00:00:00Z')
        with self.assertRaisesRegex(SnapshotError,'model_observation_history_incomplete'):
            verify_context_storage(store,context,'a'*40,root=self.root)
        context['observations']=rows
        verify_context_storage(store,context,'a'*40,root=self.root)
        context['cutoff']='2026-09-01T23:00:00Z';context['observations']=[first]
        verify_context_storage(store,context,'a'*40,root=self.root)


if __name__=='__main__': unittest.main()
