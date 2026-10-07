import copy
import unittest

from bunaken_engine.analog import predict
from bunaken_engine.transfer import predict_transfer
from test_analog import setup


class TransferTest(unittest.TestCase):
    def fixture(self):
        target, candidates, scaler = setup()
        target['site_id'] = 'mikes-point'
        for site, row in zip(('fukui', 'mandolin', 'lekuan-two'), candidates):
            row['site_id'] = site
        return target, candidates, scaler

    def test_cross_site_hypothesis_does_not_change_baseline_and_allows_above_one(self):
        target, rows, scaler = self.fixture()
        self.assertIsNone(predict(target, rows, scaler)['pci'])
        result = predict_transfer(target, rows, scaler)
        self.assertAlmostEqual(result['prediction']['pci'], 1.3)
        self.assertEqual(result['prediction']['support'], 'very_low')
        self.assertEqual(result['prediction']['model_version'], 'site-transfer-v1')
        self.assertEqual(result['donor_site_count'], 3)
        self.assertEqual(result['validation_status'], 'unvalidated')
        self.assertEqual(result['prediction']['vertical_evidence'], {'status': 'insufficient'})

    def test_three_sites_and_days_are_required(self):
        target, rows, scaler = self.fixture()
        rows[0]['site_id'] = rows[1]['site_id']
        result = predict_transfer(target, rows, scaler)
        self.assertIsNone(result['prediction']['pci'])
        self.assertIn('insufficient_donor_sites', result['prediction']['reason_codes'])
        target, rows, scaler = self.fixture()
        for row in rows: row['day'] = '2026-09-01'
        self.assertIn('insufficient_effective_days', predict_transfer(target, rows, scaler)['prediction']['reason_codes'])

    def test_site_day_repeats_do_not_increase_its_contribution(self):
        target, rows, scaler = self.fixture()
        before = predict_transfer(target, rows, scaler)
        for index in range(10):
            rows.append(dict(copy.deepcopy(rows[0]), id=f'repeat-{index}'))
        after = predict_transfer(target, rows, scaler)
        self.assertAlmostEqual(before['prediction']['pci'], after['prediction']['pci'])
        self.assertAlmostEqual(after['max_site_share'], 1/3)
        self.assertEqual(after['donor_site_count'], 3)

    def test_target_site_future_same_day_and_duplicate_labels_are_excluded(self):
        target, rows, scaler = self.fixture()
        same = dict(copy.deepcopy(rows[0]), id='same', site_id=target['site_id'], pci=99)
        future = dict(copy.deepcopy(rows[0]), id='future', day='2026-10-05', pci=99)
        same_day = dict(copy.deepcopy(rows[0]), id='same-day', day='2026-10-04', pci=99)
        result = predict_transfer(target, rows + [same, future, same_day], scaler)
        self.assertAlmostEqual(result['prediction']['pci'], 1.3)
        with self.assertRaisesRegex(ValueError, 'duplicate_transfer_candidate'):
            predict_transfer(target, rows + [rows[0]], scaler)

    def test_physical_gates_and_dominant_site_abstain(self):
        target, rows, scaler = self.fixture()
        for key in ('geometry_verified', 'sources_ready'):
            self.assertIsNone(predict_transfer({**target, key: False}, rows, scaler)['prediction']['pci'])
        target['values']['current_speed_m_s'] = None
        self.assertIn('missing_required_features', predict_transfer(target, rows, scaler)['prediction']['reason_codes'])
        target, rows, scaler = self.fixture()
        rows[1]['quality_weight'] = rows[2]['quality_weight'] = .1
        result = predict_transfer(target, rows, scaler)
        self.assertIn('dominant_donor_site', result['prediction']['reason_codes'])
        scaler['cutoff'] = '2026-10-05T00:00:00Z'
        self.assertIn('scaler_cutoff_after_target', predict_transfer(target, rows, scaler)['prediction']['reason_codes'])

    def test_map_relative_axes_are_not_transfer_features(self):
        target, rows, scaler = self.fixture()
        target['values']['current_along_m_s'] = 999
        target['values']['current_cross_m_s'] = -999
        self.assertAlmostEqual(predict_transfer(target, rows, scaler)['prediction']['pci'], 1.3)


class TransferValidationTest(unittest.TestCase):
    def context(self):
        from bunaken_engine.model_data import model_context
        from test_model_data import observation
        history = []
        for day in (1, 2, 3, 4):
            for index, site in enumerate(('mandolin', 'fukui', 'lekuan-two', 'alung-banua')):
                history.append(observation(id=f'4f6f6c58-84a8-4dd5-b882-{day:010d}{index:02d}', site_id=site,
                    start_at=f'2026-09-{day:02d}T00:00:00Z', end_at=f'2026-09-{day:02d}T01:00:00Z',
                    created_at=f'2026-09-{day:02d}T02:00:00Z', updated_at=f'2026-09-{day:02d}T02:00:00Z'))
        return model_context(history, [], 'synthetic-observer', 'synthetic-rubric', '2026-09-10T00:00:00Z')

    def test_unavailable_target_is_counted_in_all_fold_denominators(self):
        from bunaken_engine.validation import evaluate_transfer
        context = self.context()
        result = evaluate_transfer(context, mode='leave_one_site_out')
        self.assertEqual(result['metrics']['test_count'], 16)
        self.assertEqual(result['metrics']['abstention_count'], 16)
        self.assertIsNone(result['metrics']['mae'])
        self.assertFalse(result['operational_forecast'])
        self.assertEqual(len(result['folds']), 4)

    def test_holdout_and_spatial_forward_do_not_leak_labels(self):
        from bunaken_engine.validation import evaluate_transfer
        from unittest.mock import patch
        context = self.context()
        _, templates, scaler = setup()
        scaler['row_count'] = 32
        def eligible(training, *_args, **_kwargs):
            return [dict(copy.deepcopy(templates[0]), id=row['id'], site_id=row['site_id'],
                         day=row['start_at'][:10], end_at=row['end_at']) for row in training], {}
        def target(observation, *_args, **_kwargs):
            row, _, _ = setup()
            return dict(row, site_id=observation['site_id'], start_at=observation['start_at'])
        with patch('bunaken_engine.validation.eligible_candidates', side_effect=eligible), patch('bunaken_engine.validation.validation_target', side_effect=target), patch('bunaken_engine.validation.build_scaler', return_value=scaler):
            result = evaluate_transfer(context, mode='leave_one_site_out')
            self.assertEqual(result['metrics']['predicted_count'], 16)
            for fold in result['folds']:
                self.assertTrue(set(fold['training_sites']).isdisjoint(fold['held_sites']))
                self.assertTrue(set(fold['training_ids']).isdisjoint(fold['test_ids']))
            report = evaluate_transfer(context, mode='spatial_block_forward', operational=False)
            for fold in report['folds']:
                self.assertTrue(set(fold['training_sites']).isdisjoint(fold['held_sites']))
                self.assertTrue(set(fold['training_ids']).isdisjoint(fold['test_ids']))
                test_days = {row['day'] for row in report['rows'] if row['id'] in fold['test_ids']}
                self.assertTrue(all(day < min(test_days) for day in fold['training_days']))
