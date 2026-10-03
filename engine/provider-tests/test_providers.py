"""Non-empty SDK-backed mock tests, requires uv --extra providers."""
from types import SimpleNamespace
import tempfile
import unittest
from pathlib import Path
import numpy as np
import xarray as xr
from bunaken_engine.registry import load_sources
from bunaken_engine.sources import collect_fes, collect_copernicus

GEOMETRY=dict(site_id="mandolin",status="verified",lat=1,lon=124,reference_depth_m=15,wall_bearing_deg=0,offshore_bearing_deg=90,max_grid_distance_km=10,verified_at="2026-09-30T00:00:00Z",version="synthetic",evidence=["synthetic fixture"])


class SDKBackedTest(unittest.TestCase):
    def test_fes_atlas_units_and_extrapolation(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"synthetic.yaml"; path.write_text("synthetic")
            result=collect_fes(load_sources()["fes-height"],GEOMETRY,"2026-01-01T00:00Z","2026-01-01T01:00Z",config_path=str(path),atlas_unit="cm",evaluator=lambda: (np.array([100,200,300]),np.array([10,10,10]),np.array([1,-1,0])))
        self.assertEqual(len(result),3)
        self.assertAlmostEqual(result[0]["value"],1.1)
        self.assertIsNone(result[1]["value"])
        self.assertIn("fes_extrapolation_rejected",result[1]["quality_flags"])
        self.assertIsNone(result[2]["value"])
        self.assertIn("pyfes-2026.5.2",result[0]["version"])

    def test_copernicus_uses_mask_bathy_exact_grid_and_depth(self):
        calls=[]
        class SDK:
            @staticmethod
            def describe(**params):
                dataset=SimpleNamespace(dataset_id=params["dataset_id"],versions=[SimpleNamespace(label="202406",get_part=lambda _: SimpleNamespace(name="default",arco_updated_date="2026-01-01T00:00:00Z"))])
                return SimpleNamespace(products=[SimpleNamespace(datasets=[dataset])])
            @staticmethod
            def open_dataset(**params):
                calls.append(params)
                if params.get("dataset_part")=="bathy":
                    return xr.Dataset(dict(deptho=(("latitude","longitude"),[[100.]]),mask=(("latitude","longitude"),[[1]])),coords=dict(latitude=[1.],longitude=[124.]))
                ds=xr.Dataset(dict(uo=(("time","depth","latitude","longitude"),np.array([[[[1.]],[[3.]]],[[[3.]],[[5.]]]])),vo=(("time","depth","latitude","longitude"),np.array([[[[0.]],[[2.]]],[[[2.]],[[4.]]]]))),coords=dict(time=np.array(["2026-01-01T00:00","2026-01-01T06:00"],dtype="datetime64[ns]"),depth=[10.,20.],latitude=[1.],longitude=[124.]))
                ds.uo.attrs["units"]="m s-1"; ds.vo.attrs["units"]="m s-1"
                return ds
        result=collect_copernicus(load_sources()["copernicus-currents"],GEOMETRY,"2026-01-01T00:00Z","2026-01-01T06:00Z",15,sdk=SDK,username="synthetic",password="synthetic")
        self.assertEqual(len(result),4)
        self.assertEqual(result[0]["value"],2)
        self.assertEqual(result[0]["native_depths_m"],[10,20])
        self.assertEqual(result[0]["selected_grid"],"1.000000,124.000000")
        self.assertEqual(calls[0]["dataset_version"],"202211")
        self.assertEqual(calls[1]["dataset_version"],"202406")
