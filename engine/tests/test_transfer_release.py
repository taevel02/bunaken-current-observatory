import copy
import gzip
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from bunaken_engine.public_release import build_release, validate_payload
from bunaken_engine.registry import ROOT, read_json
from bunaken_engine.snapshots import SnapshotError, canonical, digest
from bunaken_engine.transfer import predict_transfer, transfer_forecast
from test_analog import setup
import test_model_integration as fixtures


class TransferReleaseTest(unittest.TestCase):
    def test_new_schema_is_opt_in_and_source_absence_cannot_produce_numbers(self):
        _, old = build_release('b'*40)
        payload=json.loads(gzip.decompress(next(raw for path,raw in old.items() if path.endswith('dashboard.json.gz'))))
        self.assertEqual(payload['schema_version'], '1.1')
        self.assertNotIn('experimental_transfer', payload)
        _, new = build_release('b'*40, experimental_transfer=True, code_commit='a'*40)
        payload=json.loads(gzip.decompress(next(raw for path,raw in new.items() if path.endswith('dashboard.json.gz'))))
        self.assertEqual(payload['schema_version'], '1.2')
        self.assertEqual(payload['experimental_transfer']['predictions'], [])
        self.assertIn('transfer_context_unavailable', payload['experimental_transfer']['reason_codes'])
        with self.assertRaisesRegex(ValueError, 'transfer_code_commit_required'):
            build_release('b'*40, experimental_transfer=True)

    def payload(self):
        _, files=build_release('b'*40, experimental_transfer=True, code_commit='a'*40)
        data=json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('dashboard.json.gz'))))
        target, rows, scaler=setup();target['site_id']='mikes-point'
        for site,row in zip(('fukui','mandolin','lekuan-2'),rows):row['site_id']=site
        item=predict_transfer(target,rows,scaler)
        data.update(source_generated_at='2026-10-03T12:00:00Z',valid_start='2026-10-03T16:00:00Z',valid_end='2026-10-04T16:00:00Z')
        data['experimental_transfer'].update(predictions=[item],model_context_sha256='b'*64,reason_codes=[])
        return data

    def test_baseline_and_transfer_numeric_gates_cannot_be_interchanged(self):
        data=self.payload(); validate_payload(data)
        for key,value in [('donor_site_count',2),('n_eff_sites',1),('max_site_share',.6),('analog_count',2)]:
            altered=copy.deepcopy(data);altered['experimental_transfer']['predictions'][0][key]=value
            with self.assertRaises(SnapshotError):validate_payload(altered)
        altered=copy.deepcopy(data);altered['predictions']=[altered['experimental_transfer']['predictions'][0]['prediction']]
        with self.assertRaisesRegex(SnapshotError,'public_numeric_gate_invalid'):validate_payload(altered)
        altered=copy.deepcopy(data);altered['experimental_transfer']['predictions'][0]['prediction']['support']='high'
        with self.assertRaisesRegex(SnapshotError,'public_transfer_numeric_gate_invalid'):validate_payload(altered)
        altered=copy.deepcopy(data);altered['experimental_transfer']['config']['minimum_sites']=1
        with self.assertRaisesRegex(SnapshotError,'public_transfer_config_invalid'):validate_payload(altered)

    def test_frozen_provider_to_model_to_sidecar_replays_without_baseline_mutation(self):
        fixture=fixtures.ModelIntegrationTest();fixture.setUp();self.addCleanup(fixture.doCleanups)
        from bunaken_engine.model_data import model_context
        from bunaken_engine.pipeline import collect_run
        from test_model_data import observation
        geometry=read_json(fixture.root/'config/geometry.json')
        for point in geometry['sites']:
            if point['site_id'] in {'mandolin','fukui','lekuan-2','mikes-point'}:
                source=next(row for row in read_json(ROOT/'config/geometry.json')['sites'] if row['site_id']==point['site_id'])
                point.update(source,status='reference_geometry',wall_bearing_deg=0,offshore_bearing_deg=90)
        (fixture.root/'config/geometry.json').write_bytes(canonical(geometry))
        fixture.observations=[];fixture.bundles=[]
        for day in (1,2,3):
            for index,site in enumerate(('mandolin','fukui','lekuan-2')):
                fixture.observations.append(observation(id=f'4f6f6c58-84a8-4dd5-b882-{day:010d}{index:02d}',site_id=site,
                    start_at=f'2026-09-{day:02d}T00:00:00Z',end_at=f'2026-09-{day:02d}T01:00:00Z',
                    created_at=f'2026-09-{day:02d}T02:00:00Z',updated_at=f'2026-09-{day:02d}T02:00:00Z'))
            created=f'2026-09-{day:02d}T02:00:00Z'
            with patch('bunaken_engine.pipeline.utc_now',return_value=created):
                manifest,files=collect_run(f'2026-09-{day:02d}','a'*40,days=1,root=fixture.root,collector=fixture.collector(day,created))
            fixture.bundles.append(dict(manifest=manifest,
                features=json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('features.json.gz')))),
                forecast=json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('forecast.json.gz'))))))
        context=model_context(fixture.observations,fixture.bundles,'synthetic-observer','synthetic-rubric','2026-09-04T02:00:00Z',root=fixture.root)
        with patch('bunaken_engine.pipeline.utc_now',return_value='2026-09-04T03:00:00Z'):
            manifest,files=collect_run('2026-09-05','a'*40,days=1,root=fixture.root,collector=fixture.collector(2,'2026-09-04T03:00:00Z'),model=context)
        features=json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('features.json.gz'))))
        sidecar=transfer_forecast(context,features,manifest,'a'*40,root=fixture.root)
        self.assertTrue(sidecar['predictions'])
        numeric=[row for row in sidecar['predictions'] if row['prediction']['pci'] is not None]
        self.assertTrue(numeric)
        self.assertTrue(all(row['prediction']['site_id']=='mikes-point' for row in numeric))
        baseline=json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('forecast.json.gz'))))
        self.assertTrue(all(row['pci'] is None for row in baseline if row['site_id']=='mikes-point'))
        self.assertEqual(sidecar,transfer_forecast(context,features,manifest,'a'*40,root=fixture.root))
        self.assertEqual(sidecar['model_context_sha256'],digest(canonical(context)))
        for relative,raw in files.items():
            destination=fixture.root/'output'/relative;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(raw)
        manifest_path=fixture.root/'output'/next(relative for relative in files if relative.endswith('manifest.json'))
        _,package=build_release('b'*40,manifest_path=manifest_path,observations=fixture.observations,
            root=fixture.root,experimental_transfer=True,code_commit='a'*40)
        payload=json.loads(gzip.decompress(next(raw for relative,raw in package.items() if relative.endswith('dashboard.json.gz'))))
        self.assertTrue(any(item['prediction']['pci'] is not None for item in payload['experimental_transfer']['predictions']))
        import os
        if os.environ.get('BUNAKEN_TRANSFER_RELEASE_DIR'):
            destination=Path(os.environ['BUNAKEN_TRANSFER_RELEASE_DIR'])
            for relative,raw in package.items():
                target=destination/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)


    def test_resumed_publication_checks_actual_code_sha_at_storage_boundary(self):
        from bunaken_engine.git_store import GitDataStore,StorageError
        from test_git_store import GitMock
        mock=GitMock();store=GitDataStore('synthetic','synthetic','synthetic',requester=mock.request)
        _,files=build_release(mock.head,experimental_transfer=True,code_commit='a'*40)
        with self.assertRaisesRegex(StorageError,'release_transfer_code_mismatch'):
            store.publish_release(files,mock.head)
        self.assertEqual(mock.ref_calls,[])

    def test_dirty_code_cannot_resume_sidecar_publication_even_with_matching_head(self):
        from types import SimpleNamespace
        from bunaken_engine.git_store import GitDataStore,StorageError
        from test_git_store import GitMock
        mock=GitMock();store=GitDataStore('synthetic','synthetic','synthetic',requester=mock.request)
        _,files=build_release(mock.head,experimental_transfer=True,code_commit='a'*40)
        with patch('subprocess.run',side_effect=[SimpleNamespace(stdout='a'*40),SimpleNamespace(stdout=' M engine/bunaken_engine/transfer.py')]):
            with self.assertRaisesRegex(StorageError,'release_transfer_code_mismatch'):store.publish_release(files,mock.head)
        self.assertEqual(mock.ref_calls,[])
