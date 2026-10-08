"""Stored-slot pairing cannot cherry-pick labels, use late runs or mix observers."""
import copy
import unittest
from unittest.mock import Mock,patch

from bunaken_engine.d1_matching import choose_slot,match_rows,official_predictions
from bunaken_engine.snapshots import canonical,SnapshotError
from test_model_data import observation
from test_analog import setup
from bunaken_engine.analog import predict


class D1MatchingTest(unittest.TestCase):
    def setUp(self):
        self.observation=observation(start_at='2026-10-09T01:10:00Z',end_at='2026-10-09T02:00:00Z',overall_pci=.4)
        target,candidates,scaler=setup();target.update(start_at='2026-10-09T01:00:00Z')
        self.slot=predict(target,candidates,scaler)
        self.slot.update(pci=.3,site_id=self.observation['site_id'],zone_id=self.observation['zone_id'])

    def test_closest_slot_is_selected_by_time_not_pci_and_null_is_preserved(self):
        other=copy.deepcopy(self.slot);other.update(start_at='2026-10-09T01:30:00Z',pci=.4)
        selected,reason=choose_slot(self.observation,[other,self.slot])
        self.assertEqual(selected['start_at'],self.slot['start_at'])
        self.assertIsNone(reason)
        self.slot.update(pci=None,reason_codes=['insufficient_analogs'])
        row=match_rows([self.observation],[self.slot,other])[0]
        self.assertIsNone(row['pci']);self.assertEqual(row['reason_codes'],['insufficient_analogs'])

    def test_error_midpoint_and_scope_are_explicit(self):
        row=match_rows([self.observation],[self.slot])[0]
        self.assertAlmostEqual(row['absolute_error'],.1)
        self.assertEqual(row['midpoint_offset_minutes'],5)
        self.assertEqual(row['temporal_match'],'approximate_window')
        row=match_rows([self.observation],[self.slot],scope=('another','rubric'),baseline_pool=[{'pci':.7,'site_id':self.observation['site_id']}])[0]
        self.assertIsNone(row['pci']);self.assertEqual(row['reason_codes'],['incompatible_observer_rubric'])
        self.assertIsNone(row['global_baseline']);self.assertIsNone(row['site_baseline'])
        self.observation['peak_pci']=1.0
        self.assertEqual(match_rows([self.observation],[self.slot])[0]['actual'],.4)

    def test_day_depth_duration_and_absence_fail_closed(self):
        other=copy.deepcopy(self.slot);other['reference_depth_m']=15
        self.assertEqual(choose_slot(self.observation,[other])[1],'matching_slot_unavailable')
        other['reference_depth_m']=18;other['start_at']='2026-10-08T01:00:00Z'
        self.assertEqual(choose_slot(self.observation,[other])[1],'matching_slot_unavailable')
        self.observation['end_at']='2026-10-09T02:20:00Z'
        self.assertEqual(choose_slot(self.observation,[self.slot])[1],'unsupported_observation_duration')
        self.assertEqual(match_rows([self.observation],[],unavailable_reason='official_seal_missing')[0]['reason_codes'],['official_seal_missing'])

    def test_late_or_unconfirmed_receipt_cannot_be_an_official_prediction(self):
        seal=dict(schema_version='1.0',target_date_wita='2026-10-09',cutoff_at='2026-10-08T12:00:00Z',status='sealed',
                  run_id='11111111-1111-4111-8111-111111111111',storage_commit='a'*40,manifest_sha256='b'*64)
        store=Mock();store.read.side_effect=[canonical(seal),b'{}']
        receipt=dict(storage_verified=True,kind='snapshot',status='succeeded',storage_commit='a'*40,manifest_sha256='b'*64,persisted_at='2026-10-08T12:01:00Z')
        with patch('bunaken_engine.d1_matching.verified_receipt',return_value=receipt):
            with self.assertRaisesRegex(SnapshotError,'not_operational'): official_predictions(store,'c'*40,'2026-10-09')
        store.read.side_effect=[canonical(seal),b'{}'];receipt.update(storage_verified=False,persisted_at='2026-10-08T11:00:00Z')
        with patch('bunaken_engine.d1_matching.verified_receipt',return_value=receipt):
            with self.assertRaisesRegex(SnapshotError,'not_operational'): official_predictions(store,'c'*40,'2026-10-09')

    def test_withdrawal_and_date_correction_clear_old_day_reports(self):
        from bunaken_engine.d1_matching import build_reports
        old=observation()
        withdrawn={**old,'revision':2,'record_status':'withdrawn'}
        store=Mock();store.head.return_value='a'*40
        with patch('bunaken_engine.d1_matching.observations_from_head',return_value=[old,withdrawn]),patch('bunaken_engine.d1_matching.official_predictions',return_value=([],None,'official_seal_missing',None,[])):
            reports=build_reports(store,code_commit='b'*40)
        self.assertEqual(reports[0]['rows'],[])
        self.assertEqual(reports[0]['excluded_observations'][0]['reason'],'inactive_or_model_excluded_label')
        moved={**old,'revision':2,'start_at':'2026-09-02T00:00:00Z','end_at':'2026-09-02T01:00:00Z'}
        with patch('bunaken_engine.d1_matching.observations_from_head',return_value=[old,moved]),patch('bunaken_engine.d1_matching.official_predictions',return_value=([],None,'official_seal_missing',None,[])):
            reports=build_reports(store,code_commit='b'*40)
        self.assertEqual(len(reports),2)
        self.assertEqual(reports[0]['rows'],[])
        self.assertEqual(reports[0]['excluded_observations'][0]['reason'],'observation_moved_day')
        self.assertEqual(len(reports[1]['rows']),1)

    def test_concurrent_identical_publish_reuses_first_confirmed_bytes(self):
        from bunaken_engine.d1_matching import build_reports,report_files
        from bunaken_engine.git_store import StorageError
        store=Mock();store.head.return_value='a'*40
        with patch('bunaken_engine.d1_matching.observations_from_head',return_value=[observation()]),patch('bunaken_engine.d1_matching.official_predictions',return_value=([],None,'official_seal_missing',None,[])):
            reports=build_reports(store,code_commit='b'*40)
        earlier={**reports[0],'generated_at':'2026-10-09T00:00:00Z'};raw=canonical(earlier)
        store.read.side_effect=[None,raw];store.insert.side_effect=[StorageError('immutable_conflict'),'c'*40]
        files=report_files(store,reports,publish=True)
        self.assertEqual(list(files.values()),[raw])
        self.assertEqual(store.insert.call_count,2)
