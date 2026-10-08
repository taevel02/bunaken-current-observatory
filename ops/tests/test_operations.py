import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from performance_report import report
from configure_github import rules

class OperationsTest(unittest.TestCase):
    def test_no_measurements_never_claim_a_pass(self):
        result=report({})
        self.assertIsNone(result['storage_ms']['passed'])
        self.assertFalse(result['sufficient_sample_count'])
        self.assertEqual(report({'storage_ms':[1,10001]})['storage_ms']['passed'],False)
        with self.assertRaises(ValueError):report({'password':'synthetic'})
        with self.assertRaises(ValueError):report({'storage_ms':[float('nan')]})
    def test_main_checks_and_data_nonforce_preserve_storage(self):
        main=rules('main','main',True);data=rules('data','data')
        self.assertEqual(data['bypass_actors'],[])
        self.assertEqual({r['type'] for r in data['rules']},{'deletion','non_fast_forward'})
        self.assertTrue(any(r['type']=='required_status_checks' for r in main['rules']))
        self.assertTrue(any(r['type']=='pull_request' for r in main['rules']))
