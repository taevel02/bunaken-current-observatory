"""Synthetic deadline/retry fixtures; no provider credentials or requests."""
import os
import sys
import time
import unittest
from unittest.mock import patch
from bunaken_engine.copernicus_batch import collect_batch, run_worker
from bunaken_engine.sources import SourceError

class BatchTest(unittest.TestCase):
    def test_deadline_terminates_worker_and_redacts_output(self):
        before=time.monotonic()
        with self.assertRaises(SourceError) as error:
            run_worker({}, timeout=.15, command=[sys.executable,'-c',"import time; print('secret',flush=True); time.sleep(10)"])
        self.assertEqual(error.exception.code,'provider_request_timeout')
        self.assertLess(time.monotonic()-before, 3)
        self.assertNotIn('secret',str(error.exception))

    def test_retry_is_bounded_and_missing_credentials_never_launch(self):
        calls=[]
        def transient(payload):
            calls.append(payload)
            if len(calls)==1: raise SourceError('provider_request_timeout',True)
            return {'ok':[]}
        with patch.dict(os.environ,{'COPERNICUSMARINE_SERVICE_USERNAME':'synthetic','COPERNICUSMARINE_SERVICE_PASSWORD':'synthetic'}):
            self.assertEqual(collect_batch({},[dict(reference_depth_m=18)],'a','b',runner=transient,sleep=lambda _:None),{'ok':[]})
            self.assertEqual(calls[0]['depths'],[10,18,30])
            self.assertNotIn('password',calls[0])
            calls.clear()
            def always(payload):
                calls.append(payload); raise SourceError('provider_read_failed',True)
            with self.assertRaises(SourceError):collect_batch({},[dict(reference_depth_m=18)],'a','b',runner=always,sleep=lambda _:None)
            self.assertEqual(len(calls),2)
        with patch.dict(os.environ,{'COPERNICUSMARINE_SERVICE_USERNAME':'','COPERNICUSMARINE_SERVICE_PASSWORD':''}):
            with self.assertRaises(SourceError):collect_batch({},[{}],'a','b',runner=lambda _:self.fail('never launch'))
