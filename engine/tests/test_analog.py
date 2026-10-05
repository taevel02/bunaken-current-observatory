import copy
import unittest

from bunaken_engine.analog import predict, target_mask, environmental_distance, effective_size, neighbors, vertical_evidence, support_level
from bunaken_engine.registry import read_json, ROOT
from bunaken_engine.validation import metrics, day_cutoff
from bunaken_engine.model_data import latest_revisions
from datetime import date


def setup():
    features = read_json(ROOT / 'config/features.json')
    values = {name: 0.0 for group in features['groups'].values() for name in group['features']}
    values['reference_depth_m'] = 18
    scaler = dict(cutoff='2026-09-01T00:00:00Z', features={name: dict(enabled=True, median=0, iqr=1) for name in values})
    target = dict(site_id='mandolin', zone_id=None, start_at='2026-10-04T00:00:00Z', values=values, geometry_verified=True, sources_ready=True)
    candidates = [dict(id=str(index), day=f'2026-09-{index+1:02d}', site_id='mandolin', zone_id=None,
                       pci=1.2 + index / 10, vertical='unknown', values=copy.deepcopy(values), quality_weight=1,
                       provenance_weight=1, snapshot_id='synthetic') for index in range(3)]
    return target, candidates, scaler


class AnalogTest(unittest.TestCase):
    def test_numeric_above_one_and_weighted_effective_sizes(self):
        target, candidates, scaler = setup()
        result = predict(target, candidates, scaler)
        self.assertAlmostEqual(result['pci'], 1.3)
        self.assertEqual(result['n_eff'], 3)
        self.assertEqual(result['n_eff_days'], 3)
        self.assertEqual(result['support'], 'very_low')
        self.assertEqual(effective_size([0, 0]), 0)

    def test_reference_target_or_training_geometry_caps_numeric_support(self):
        target,candidates,scaler=setup()
        result=predict({**target,'reference_geometry':True},candidates,scaler)
        self.assertIsNotNone(result['pci'])
        self.assertEqual((result['prediction_status'],result['support']),('experimental','very_low'))
        candidates[0]['reference_geometry']=True
        result=predict(target,candidates,scaler)
        self.assertEqual((result['prediction_status'],result['support']),('experimental','very_low'))
        self.assertIsNone(predict({**target,'reference_geometry':True,'sources_ready':False},candidates,scaler)['pci'])

    def test_days_gate_and_unknown_site_gate(self):
        target, candidates, scaler = setup()
        for row in candidates: row['day'] = '2026-09-01'
        result = predict(target, candidates, scaler)
        self.assertIsNone(result['pci'])
        self.assertEqual(result['n_eff_days'], 1)
        self.assertIn('insufficient_distinct_days', result['reason_codes'])
        for index, row in enumerate(candidates): row.update(day=f'2026-09-0{index+1}', site_id='fukui')
        self.assertIn('missing_same_site', predict(target, candidates, scaler)['reason_codes'])

    def test_missing_features_fixed_mask_and_zero_weight(self):
        target, candidates, scaler = setup()
        candidates[0]['values']['current_along_m_s'] = None
        result = predict(target, candidates, scaler)
        self.assertIn('insufficient_analogs', result['reason_codes'])
        for row in candidates: row['quality_weight'] = 0
        self.assertEqual(predict(target, candidates, scaler)['n_eff'], 0)
        target['values']['tide_rate_m_per_hour'] = None
        target['values']['tide_excursion_m'] = None
        self.assertIn('missing_required_features', predict(target, candidates, scaler)['reason_codes'])

    def test_disabled_features_do_not_inflate_coverage(self):
        target, _, scaler = setup()
        _, coverage = target_mask(target['values'], scaler, read_json(ROOT / 'config/features.json'))
        self.assertAlmostEqual(coverage['tide'], 2/3)
        self.assertAlmostEqual(coverage['total'], .9)
        scaler['features']['reference_depth_m']['enabled'] = False
        _, coverage = target_mask(target['values'], scaler, read_json(ROOT / 'config/features.json'))
        self.assertAlmostEqual(coverage['total'], .8)

    def test_circular_pair_counts_once_and_candidate_mask_is_strict(self):
        target, _, scaler = setup()
        feature_config = dict(groups=dict(ocean=dict(weight=1, features=['wave_direction_sin', 'wave_direction_cos', 'current_speed_m_s'])))
        mask, coverage = target_mask(target['values'], scaler, feature_config)
        candidate = dict(target['values'], wave_direction_sin=1, wave_direction_cos=1)
        self.assertEqual(environmental_distance(target['values'], candidate, mask, scaler, feature_config), 1)
        candidate['wave_direction_cos'] = None
        self.assertIsNone(environmental_distance(target['values'], candidate, mask, scaler, feature_config))

    def test_neighbors_deterministic_k_before_site_multiplier(self):
        target, candidates, scaler = setup()
        config = read_json(ROOT / 'config/model.json'); config['maximum_neighbors'] = 2
        candidates[2]['site_id'] = 'mandolin'; candidates[0]['site_id'] = candidates[1]['site_id'] = 'fukui'
        selected, _, _ = neighbors(target, list(reversed(candidates)), scaler, read_json(ROOT / 'config/features.json'), config)
        self.assertEqual([row['candidate']['id'] for row in selected], ['0', '1'])

    def test_geometry_sources_and_scaler_future_block_numbers(self):
        target, candidates, scaler = setup()
        for key in ('geometry_verified', 'sources_ready'):
            self.assertIsNone(predict({**target, key: False}, candidates, scaler)['pci'])
        scaler['cutoff'] = '2026-10-05T00:00:00Z'
        self.assertIsNone(predict(target, candidates, scaler)['pci'])

    def test_vertical_pool_independent_unknown_excluded_no_probabilities(self):
        target, candidates, scaler = setup()
        candidates = [dict(candidates[0], id=str(i), day=f'2026-09-{i+1:02d}', pci=None, vertical='down' if i < 2 else 'none') for i in range(5)]
        result = predict(target, candidates, scaler)
        self.assertIsNone(result['pci'])
        self.assertEqual(result['vertical_evidence']['known_count'], 5)
        self.assertEqual(result['vertical_evidence']['directions']['down']['status'], 'evidence_available')
        candidates.append(dict(candidates[0], vertical='unknown', id='6'))
        self.assertEqual(predict(target, candidates, scaler)['vertical_evidence']['known_count'], 5)

    def test_support_requires_forward_evidence_and_preset_limits(self):
        config = read_json(ROOT / 'config/model.json')
        evidence = dict(mode='forward', operational_forecast=True, metrics=dict(predicted_days=20, mae=.1, global_baseline_mae=.2, large_error_threshold=.5, large_error_rate=0, global_baseline_large_error_rate=.1), sites={})
        self.assertEqual(support_level(20, 20, 20, 20, 'mandolin', evidence, config), 'low')
        config['large_error_threshold'] = .5
        self.assertEqual(support_level(20, 20, 20, 20, 'mandolin', evidence, config), 'medium')
        evidence['mode'] = 'leave_one_day_out'
        self.assertEqual(support_level(20, 20, 20, 20, 'mandolin', evidence, config), 'low')

    def test_fixed_depth_profile_keeps_missing_weather_and_thermal_penalties(self):
        target,candidates,scaler=setup()
        config=read_json(ROOT/'config/model.json')
        config.update(version='weighted-analog-v1.2',comparison_scope='site-18m-v1')
        scaler['features']['reference_depth_m']['enabled']=False
        for name in ('modelled_temperature_c','temperature_difference_10_30_c'):
            target['values'][name]=None
        result=predict(target,candidates,scaler,config=config)
        self.assertAlmostEqual(result['feature_coverage']['total'],.75/.9)
        self.assertAlmostEqual(result['pci'],1.3)
        for name in read_json(ROOT/'config/features.json')['groups']['weather']['features']:
            target['values'][name]=None
        result=predict(target,candidates,scaler,config=config)
        self.assertIsNone(result['pci'])
        self.assertIn('insufficient_feature_coverage',result['reason_codes'])
        # Old model and old coverage semantics remain reproducible.
        config.pop('comparison_scope');config['version']='weighted-analog-v1.1'
        self.assertAlmostEqual(predict(target,candidates,scaler,config=config)['feature_coverage']['total'],.55)

    def test_fixed_depth_profile_cannot_borrow_other_depth_labels(self):
        target,candidates,scaler=setup()
        config=read_json(ROOT/'config/model.json')
        config.update(version='weighted-analog-v1.2',comparison_scope='site-18m-v1')
        candidates[0]['values']['reference_depth_m']=15
        result=predict(target,candidates,scaler,config=config)
        self.assertIsNone(result['pci'])
        self.assertIn('insufficient_analogs',result['reason_codes'])
        target['values']['reference_depth_m']=15
        self.assertIn('outside_model_depth_scope',predict(target,candidates,scaler,config=config)['reason_codes'])
        vertical = [dict(candidates[1], id=str(i), day=f'2026-09-0{i+1}', vertical='down' if i<2 else 'none') for i in range(5)]
        self.assertEqual(predict(target,vertical,scaler,config=config)['vertical_evidence']['status'],'insufficient')

    def test_matched_baselines_abstention_and_wita_cutoff(self):
        rows = [dict(day='2026-09-01', pci=.5, actual=.4, global_baseline=.6, site_baseline=.7), dict(day='2026-09-02', pci=None, actual=10, global_baseline=0, site_baseline=0)]
        result = metrics(rows, .15)
        self.assertAlmostEqual(result['mae'], .1)
        self.assertAlmostEqual(result['global_baseline_mae'], .2)
        self.assertEqual(result['abstention_count'], 1)
        self.assertEqual(result['coverage'], .5)
        self.assertEqual(day_cutoff(date(2026, 10, 4)), '2026-10-03T12:00:00Z')


if __name__ == '__main__': unittest.main()
