"""Factor diagnostics cannot self-fit, weaken gates, select or promote a model."""
import copy
import unittest

from bunaken_engine.analog import neighbors
from bunaken_engine.model_audit import audit, candidate_diagnostics, influence, variants
from bunaken_engine.model_data import model_context
from bunaken_engine.registry import ROOT, read_json
from test_analog import setup


class ModelAuditTest(unittest.TestCase):
    def setUp(self):
        self.target,self.candidates,self.scaler=setup()
        self.config=read_json(ROOT/'config/model.json');self.features=read_json(ROOT/'config/features.json')
        fourth=copy.deepcopy(self.candidates[-1]);fourth.update(id='3',day='2026-09-04',pci=.4)
        self.candidates.append(fourth)
        for row in self.candidates: row['start_at']=row['day']+'T00:00:00Z'

    def test_labels_never_change_environment_weights(self):
        before=influence(self.target,self.candidates,self.scaler,self.features,self.config)
        for row in self.candidates: row['pci']*=10
        after=influence(self.target,self.candidates,self.scaler,self.features,self.config)
        self.assertEqual([(r['id'],r['weight']) for r in before],[(r['id'],r['weight']) for r in after])
        self.assertAlmostEqual(sum(r['normalized_weight'] for r in after),1)

    def test_whole_day_holdout_and_matched_comparisons(self):
        experiments,details=candidate_diagnostics(self.candidates,self.scaler,self.features,self.config)
        self.assertEqual(len(experiments),10)
        self.assertEqual(experiments[0]['metrics']['predicted_count'],4)
        for row in details:
            self.assertTrue(row['neighbors'])
            self.assertTrue(all(n['day'] != row['day'] for n in row['neighbors']))
            self.assertAlmostEqual(sum(n['pci_contribution'] for n in row['neighbors']),row['pci'])
        for experiment in experiments:
            self.assertEqual(experiment['common_with_current_metrics']['test_count'],4)

    def test_experiments_do_not_mutate_config_or_relax_numeric_gates(self):
        original=copy.deepcopy((self.features,self.config))
        for name,features,config in variants(self.features,self.config):
            self.assertAlmostEqual(sum(g['weight'] for g in features['groups'].values()),1)
            for key in ('minimum_labels','minimum_days','minimum_n_eff','minimum_coverage'):
                self.assertEqual(config[key],self.config[key])
        self.assertEqual((self.features,self.config),original)
        experiments,_=candidate_diagnostics(self.candidates[:3],self.scaler,self.features,self.config)
        self.assertTrue(all(experiment['metrics']['predicted_count']==0 for experiment in experiments))

    def test_report_never_selects_or_promotes_a_model(self):
        context=model_context([],[],'synthetic','synthetic','2026-10-01T00:00:00Z')
        result=audit(context)
        self.assertFalse(result['operational_forecast'])
        self.assertFalse(result['storage_confirmation_checked'])
        self.assertFalse(result['promotion'])
        self.assertIsNone(result['selection'])
        self.assertEqual(result['eligible_candidates'],0)
        self.assertEqual(len(result['experiments']),10)
        self.assertEqual(result['retrospective_forward']['metrics']['test_count'],0)
