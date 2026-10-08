"""Indexing preserves availability, point identity, feature order and values."""
import unittest
from bunaken_engine.model_data import environment_rows


class EnvironmentRowsTest(unittest.TestCase):
    def test_point_metadata_preserves_future_and_storage_availability(self):
        def feature(site,zone,value):
            return dict(site_id=site,zone_id=zone,end_at='2026-10-01T01:00:00Z',values={'value':value},geometry_version='synthetic')
        manifest=dict(status='succeeded',created_at='2026-10-01T00:00:00Z',feature_version='synthetic',dataset_versions={},samples=[
            dict(site_id='one',zone_id=None,retrieved_at='2026-10-01T02:00:00Z',issued_at=None),
            dict(site_id='one',zone_id=None,retrieved_at='2026-10-01T03:00:00Z',issued_at='2026-10-02T00:00:00Z'),
            dict(site_id='one',zone_id='zone',retrieved_at='2026-10-01T04:00:00Z',issued_at=None)])
        rows=environment_rows([dict(manifest=manifest,features=[feature('one',None,1),feature('one','zone',2),feature('one',None,3),feature('missing',None,4)],
                                    storage_evidence=dict(persisted_at='2026-10-01T05:00:00Z'))])
        self.assertEqual([r['features']['value'] for r in rows],[1,2,3])
        self.assertTrue(all(r['retrieved_at']=='2026-10-01T05:00:00Z' for r in rows))
        self.assertEqual([r['issued_at'] for r in rows],['2026-10-02T00:00:00Z',None,'2026-10-02T00:00:00Z'])
