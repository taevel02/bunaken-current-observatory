"""Synthetic dive windows, unknown depth and immutable local analysis tests."""
import json
import tempfile
import unittest
from pathlib import Path
from bunaken_engine.enrichment import collection_plan, enrich
from bunaken_engine.model_data import model_context
from test_model_data import observation
import test_model_integration as fixtures

class PlanTest(unittest.TestCase):
    def test_unknown_depth_and_withdrawn_do_not_trigger_fetch(self):
        rows=[observation(representative_depth_m=None),observation(id='4f6f6c58-84a8-4dd5-b882-8ce58ee14b39',record_status='withdrawn')]
        plan=collection_plan(rows,[],'synthetic-observer','synthetic-rubric','2026-10-04T00:00:00Z')
        self.assertEqual(plan['ranges'],[])
        self.assertEqual(set(plan['excluded'].values()),{'missing_observation_depth','inactive_record'})
    def test_overnight_and_actual_depth_preserved(self):
        row=observation(start_at='2026-09-01T15:40:00Z',end_at='2026-09-01T17:00:00Z',representative_depth_m=13.4)
        plan=collection_plan([row],[],'synthetic-observer','synthetic-rubric','2026-10-04T00:00:00Z')
        self.assertEqual(plan['ranges'],[dict(date='2026-09-01',days=2)])
        self.assertEqual(plan['depths'],[13.4])

class EnrichmentIntegrationTest(unittest.TestCase):
    def test_missing_window_collects_links_and_scaler_without_writing_raw_observations(self):
        fixture=fixtures.ModelIntegrationTest();fixture.setUp()
        try:
            with tempfile.TemporaryDirectory() as folder:
                output=Path(folder)/'analysis'
                def collector(source, geometry, start, end):
                    rows={}
                    for day in range(3):
                        begin=(fixtures.instant(start)+fixtures.timedelta(days=day)).isoformat()
                        for row in fixture.collector(day+1,'2026-09-04T02:00:00Z')(source,geometry,begin,end):
                            rows[(row['variable'],row['valid_time'],row['depth_m'])]=row
                    return list(rows.values())
                report=enrich(fixture.observations,[], 'synthetic-observer','synthetic-rubric','a'*40,output,
                              root=fixture.root,collector=collector,source_data_commit='b'*40)
                self.assertEqual(report['eligible_candidates'],3,report['excluded'])
                self.assertEqual(json.loads((output/'enrichment.json').read_bytes())['source_data_commit'],'b'*40)
                self.assertEqual(len(report['new_runs']),1)
                self.assertGreater(report['scaler_rows'],0)
                self.assertFalse(report['saved_to_public_repository'])
                self.assertFalse(report['operational_forecast'])
                links=json.loads((output/'environment-links.json').read_bytes())
                self.assertEqual(len(links),3)
                self.assertTrue(all(r['interval_kind']=='dive_interval' for r in links))
                context=json.loads((output/'model-context.json').read_bytes())
                self.assertEqual(context['observations'],model_context(fixture.observations,[],'synthetic-observer','synthetic-rubric',report['created_at'],root=fixture.root)['observations'])
                with self.assertRaises(FileExistsError):enrich(fixture.observations,[], 'synthetic-observer','synthetic-rubric','a'*40,output,root=fixture.root)
        finally:fixture.doCleanups()
    def test_existing_environment_skips_recollection(self):
        fixture=fixtures.ModelIntegrationTest();fixture.setUp()
        try:
            plan=collection_plan(fixture.observations,fixture.bundles,'synthetic-observer','synthetic-rubric','2026-10-04T00:00:00Z',root=fixture.root)
            self.assertEqual(plan['ranges'],[])
            self.assertEqual(plan['missing_ids'],[])
        finally:fixture.doCleanups()
