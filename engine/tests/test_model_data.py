"""Synthetic model inputs only. None of these values is field evidence."""
import copy
import gzip
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from bunaken_engine.registry import ROOT, read_json, load_geometry
from bunaken_engine.model_data import latest_revisions, eligible_candidates, model_context, prepare_model, read_bundle
from bunaken_engine.pipeline import collect_run
from bunaken_engine.snapshots import canonical, digest, make_bundle, SnapshotError
from bunaken_engine.validation import evaluate
from bunaken_engine.analog import predict
from bunaken_engine.registry import ROOT, read_json


def observation(**updates):
    row = dict(id='4f6f6c58-84a8-4dd5-b882-8ce58ee14b38', schema_version='1.3', observer_id='synthetic-observer', rubric_version='synthetic-rubric',
               revision=1, start_at='2026-09-01T00:00:00Z', end_at='2026-09-01T01:00:00Z', local_start='2026-09-01T08:00', local_end='2026-09-01T09:00',
               timezone='Asia/Makassar', time_precision='reported_minute', site_id='mandolin', zone_id=None, representative_depth_m=18,
               overall_pci=1.2, vertical=dict(direction='unknown', intensity=None), confidence='normal', peak_events=[], observed_temperature=None,
               label_scope='dive_overall', record_status='active', created_at='2026-09-01T02:00:00Z', updated_at='2026-09-01T02:00:00Z',
               train_eligible=False, use_for_model=True, route_description='', vertical_onset=None)
    return dict(row, **updates)


class ModelDataTest(unittest.TestCase):
    def test_latest_revision_conflict_and_as_of_cutoff(self):
        first=observation(); later=observation(revision=2, updated_at='2026-09-05T00:00:00Z', record_status='withdrawn')
        self.assertEqual(latest_revisions([later, first])[0]['revision'], 2)
        self.assertEqual(latest_revisions([later, first], cutoff='2026-09-03T00:00:00Z')[0]['revision'], 1)
        with self.assertRaisesRegex(ValueError, 'conflicting_observation_revision'):
            latest_revisions([first, observation(overall_pci=.1)])

    def test_server_eligibility_legacy_withdrawn_observer_depth_and_use(self):
        for update, reason in [(dict(label_scope='legacy_unspecified'), 'legacy_label_scope'),
                               (dict(record_status='withdrawn'), 'inactive_record'),
                               (dict(use_for_model=False), 'model_use_disabled'),
                               (dict(observer_id='other'), 'incompatible_observer_rubric'),
                               (dict(rubric_version='other'), 'incompatible_observer_rubric'),
                               (dict(representative_depth_m=None), 'missing_observation_depth')]:
            row=observation(**update)
            candidates, excluded=eligible_candidates([row], [], 'synthetic-observer', 'synthetic-rubric', '2026-10-01T00:00:00Z')
            self.assertEqual(candidates, [])
            self.assertEqual(excluded[row['id']], reason)
        candidates, excluded=eligible_candidates([observation(train_eligible=True)], [], 'synthetic-observer', 'synthetic-rubric', '2026-10-01T00:00:00Z')
        self.assertEqual(candidates, [])
        self.assertEqual(excluded[observation()['id']], 'environment_link_unavailable')

    def test_context_reproducibility_empty_model_and_tamper_rejection(self):
        context=model_context([], [], 'synthetic-observer', 'synthetic-rubric', '2026-09-30T00:00:00Z')
        def unavailable(*args):
            from bunaken_engine.sources import SourceError
            raise SourceError('unverified_geometry')
        with patch('bunaken_engine.pipeline.utc_now', return_value='2026-09-30T01:00:00Z'):
            manifest, files=collect_run('2026-10-01', 'a'*40, days=1, run_id='11111111-1111-4111-8111-111111111111', collector=unavailable, model=context)
        forecast=json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('forecast.json.gz'))))
        self.assertEqual(manifest['schema_version'], '1.2')
        self.assertEqual(len(forecast), 304)
        self.assertTrue(all(row['pci'] is None and row['model_version']==read_json(ROOT/'config/model.json')['version'] for row in forecast))
        changed=copy.deepcopy(forecast); changed[0].update(pci=.5, prediction_status='available', support='low')
        with self.assertRaisesRegex(SnapshotError, 'model_forecast_reproduction_mismatch'):
            make_bundle(manifest, json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('features.json.gz')))), changed)
        with tempfile.TemporaryDirectory() as folder:
            for path,raw in files.items():
                target=Path(folder)/path; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(raw)
            bundle=read_bundle(next(Path(folder)/path for path in files if path.endswith('manifest.json')))
            self.assertNotIn('model_context', bundle['manifest'])
            self.assertEqual(bundle['origin_manifest_sha256'], digest(canonical(manifest)))
            candidates, scaler, _=prepare_model([], [bundle], 'synthetic-observer', 'synthetic-rubric', '2026-10-02T00:00:00Z')
            self.assertEqual(candidates, [])

    def test_context_rejects_unknown_and_secret_fields(self):
        from bunaken_engine.snapshots import validate
        context=model_context([], [], 'synthetic-observer', 'synthetic-rubric', '2026-09-30T00:00:00Z')
        with self.assertRaises(Exception): validate('model-context', dict(context, token='synthetic-forbidden'))
        row=observation(); row['notes_private']='synthetic-forbidden'
        with self.assertRaises(Exception): model_context([row], [], 'synthetic-observer', 'synthetic-rubric', '2026-09-30T00:00:00Z')
        from bunaken_engine.model_data import trusted_configuration
        for changes in (dict(token='synthetic-forbidden'),dict(minimum_coverage=.1),dict(minimum_labels=1,minimum_days=1,minimum_n_eff=.5)):
            altered=copy.deepcopy(context)
            altered['configuration']['model'].update(changes)
            altered['config_sha256']=digest(canonical(altered['configuration']['model']))
            with self.assertRaisesRegex(ValueError,'untrusted_model_configuration'): trusted_configuration(altered)

    def test_forward_groups_whole_wita_day_and_no_future_training(self):
        rows=[observation(), observation(id='4f6f6c58-84a8-4dd5-b882-8ce58ee14b39', start_at='2026-09-01T02:00:00Z', end_at='2026-09-01T03:00:00Z'),
              observation(id='4f6f6c58-84a8-4dd5-b882-8ce58ee14b40', start_at='2026-09-02T00:00:00Z', end_at='2026-09-02T01:00:00Z', updated_at='2026-09-02T02:00:00Z')]
        report=evaluate(rows, [], 'synthetic-observer', 'synthetic-rubric', operational=True)
        self.assertEqual(len(report['folds']), 2)
        self.assertEqual(report['metrics']['test_count'], 3)
        self.assertEqual(report['metrics']['coverage'], 0)
        self.assertTrue(all(all(day < fold['day'] for day in fold['training_days']) for fold in report['folds']))
        diagnostic=evaluate(rows, [], 'synthetic-observer', 'synthetic-rubric', mode='leave_one_day_out')
        self.assertFalse(diagnostic['operational_forecast'])

    def test_lodo_diagnostic_future_scaler_does_not_weaken_operational_gate(self):
        from test_analog import setup
        target, candidates, scaler=setup(); scaler['cutoff']='2026-11-01T00:00:00Z'
        self.assertIsNone(predict(target,candidates,scaler)['pci'])
        self.assertIsNotNone(predict(target,candidates,scaler,diagnostic=True)['pci'])

    def test_unknown_site_in_validation_abstains_instead_of_aborting(self):
        report=evaluate([observation(site_id='synthetic-unknown')],[],'synthetic-observer','synthetic-rubric',operational=False)
        self.assertEqual(report['metrics']['abstention_count'],1)
        self.assertEqual(report['rows'][0]['reason_codes'],['target_environment_unavailable'])

    def test_local_labels_cannot_be_published_as_github_field_evidence(self):
        from bunaken_engine.model_input import verify_context_storage
        from unittest.mock import Mock
        store=Mock();store.read_observation_revision.return_value=None
        store.request.side_effect=lambda method,path:dict(tree=dict(sha='c'*40)) if '/git/commits/' in path else dict(tree=[],truncated=False)
        context=model_context([observation()],[],'synthetic-observer','synthetic-rubric','2026-09-30T00:00:00Z')
        with self.assertRaisesRegex(SnapshotError,'model_observation_history_incomplete'):
            verify_context_storage(store,context,'a'*40)
        store.insert.assert_not_called()


if __name__ == '__main__': unittest.main()
