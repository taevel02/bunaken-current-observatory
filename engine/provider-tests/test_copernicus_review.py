"""Synthetic private point extraction; no provider credentials or field claims."""
import tempfile
import unittest
from pathlib import Path
import xarray as xr
import numpy as np
from bunaken_engine.copernicus_review import point_review
from bunaken_engine.registry import load_geometry
from bunaken_engine.fes_atlas import sha256
from bunaken_engine.snapshots import canonical


class PointReviewTest(unittest.TestCase):
    def fixture(self,root,depths):
        dataset=xr.Dataset(dict(uo=(('time','depth','latitude','longitude'),np.array([[[[1.]],[[3.]]]])),
                                vo=(('time','depth','latitude','longitude'),np.array([[[[2.]],[[4.]]]]))),
                           coords=dict(time=np.array(['2026-09-01T00:00'],dtype='datetime64[ns]'),depth=depths,latitude=[1.6],longitude=[124.75]))
        dataset.to_netcdf(root/'copernicus-currents.nc')
        points=[dict(site_id=row['site_id'],selected_lat=1.6,selected_lon=124.75,bottom_depth_m=100,distance_km=3,reference_depth_m=18,accepted=False) for row in load_geometry()['sites']]
        (root/'grid-review.json').write_bytes(canonical(points))
        manifest=dict(kind='private_provider_inspection',geometry_sha256=sha256(Path('config/geometry.json')),retrieved_at='2026-09-02T00:00:00Z',
                      files={name:sha256(root/name) for name in ('grid-review.json','copernicus-currents.nc')},
                      providers={'copernicus-currents':dict(status='retrieved',dataset='cmems_mod_glo_phy-cur_anfc_0.083deg_PT6H-i',version='202406',source_updated_at=None)})
        (root/'manifest.json').write_bytes(canonical(manifest))

    def test_bounded_18m_private_samples_and_input_hash_tampering(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);self.fixture(root,[10,20])
            result=point_review(root,root/'review.json')
            self.assertEqual(result['sites'],19)
            self.assertEqual(result['finite_samples'],38)
            self.assertFalse(result['operational_eligible'])
            with self.assertRaisesRegex(ValueError,'immutable_review_output_exists'):point_review(root,root/'review.json')
            (root/'grid-review.json').write_bytes(b'[]')
            with self.assertRaisesRegex(ValueError,'review_input_hash_mismatch'):point_review(root,root/'tampered.json')

    def test_depth_extrapolation_stays_null(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);self.fixture(root,[10,17])
            self.assertEqual(point_review(root,root/'review.json')['finite_samples'],0)


if __name__=='__main__':unittest.main()
