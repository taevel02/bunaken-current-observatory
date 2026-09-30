"""Synthetic regressions for review findings; never operational Site evidence."""
import io
import unittest
from urllib.error import HTTPError
from unittest.mock import patch
from bunaken_engine.features import build_scaler
from bunaken_engine.registry import load_sources
from bunaken_engine.sources import fetch_json
from bunaken_engine.snapshots import assess_sources

class ReviewRegressionTest(unittest.TestCase):
    def test_scaler_period_orders_instants_across_offsets(self):
        rows=[dict(valid_time=at,retrieved_at='2026-01-02T00:00Z',features={'x':value}) for at,value in [('2026-01-02T00:00:00+08:00',1),('2026-01-01T18:00:00Z',2)]]
        result=build_scaler(rows,['x'],'2026-01-03T00:00Z')
        self.assertEqual(result['start'],'2026-01-01T16:00:00Z')
        self.assertEqual(result['end'],'2026-01-01T18:00:00Z')

    def test_retry_after_is_honored_without_early_retry(self):
        waits=[];attempts=[]
        def opener(*args,**kwargs):
            attempts.append(1)
            if len(attempts)==1:
                raise HTTPError('private-url',429,'private',{'Retry-After':'17'},None)
            return io.BytesIO(b'{}')
        fetch_json('https://example.com',opener=opener,sleep=waits.append)
        self.assertEqual(waits,[17])

    def test_optional_deep_current_does_not_invalidate_reference(self):
        sources=load_sources()
        sources['copernicus-currents']['redistribution']['derived_allowed']=True
        sources['copernicus-currents']['redistribution']['public_variables']=['uo','vo']
        rows=[dict(source='copernicus-currents',variable=variable,depth_m=depth,value=value,quality_flags=[],issued_at='2026-09-30T00:00Z') for depth,value in [(15,.2),(30,None)] for variable in ['uo','vo']]
        with patch('bunaken_engine.snapshots.load_sources',return_value=sources):
            result=assess_sources(rows,['copernicus-currents'],'2026-09-30T01:00Z',reference_depth=15)
        self.assertEqual(result['copernicus-currents']['status'],'succeeded')


    def test_historical_freshness_is_separate_from_forecast_source_age(self):
        sources=load_sources()
        sources['copernicus-currents']['redistribution'].update(derived_allowed=True,public_variables=['uo','vo'])
        rows=[dict(source='copernicus-currents',variable=variable,depth_m=15,value=.2,quality_flags=[],issued_at='2026-01-01T00:00Z') for variable in ['uo','vo']]
        with patch('bunaken_engine.snapshots.load_sources',return_value=sources):
            live=assess_sources(rows,['copernicus-currents'],'2026-09-30T01:00Z',reference_depth=15)
            history=assess_sources(rows,['copernicus-currents'],'2026-09-30T01:00Z',reference_depth=15,historical=True)
        self.assertEqual(live['copernicus-currents']['status'],'failed')
        self.assertEqual(history['copernicus-currents']['status'],'succeeded')
