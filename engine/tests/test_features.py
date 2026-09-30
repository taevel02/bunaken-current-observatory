import unittest
from bunaken_engine.features import interpolate, projection, wind_vector, circular_mean, sea_cell, profile_value, window_mean, build_scaler


class FeaturesTest(unittest.TestCase):
    def test_bounded_interpolation_preserves_missing(self):
        points = [(0,0),(10,10),(20,None),(30,30)]
        self.assertEqual(interpolate(points,5),5)
        self.assertEqual(interpolate(points,0),0)
        for target in (-1,15,25,31):
            self.assertIsNone(interpolate(points,target))
        self.assertIsNone(interpolate([],0))
        with self.assertRaises(ValueError):
            interpolate([(0,1),(0,2)],0)
        self.assertIsNone(profile_value([1,10],[2,20],11,100))
        self.assertIsNone(profile_value([1,10],[2,20],8,5))

    def test_vectors_preserve_true_north_and_wrap(self):
        self.assertAlmostEqual(projection(2,3,0),3)
        self.assertAlmostEqual(projection(2,3,90),2)
        self.assertIsNone(projection(2,3,None))
        self.assertAlmostEqual(wind_vector(5,90)[0],-5)
        mean = circular_mean([359,1])
        self.assertTrue(mean < 1e-9 or mean > 359.99999)
        self.assertIsNone(circular_mean([0,180]))

    def test_sea_mask_distance_and_seabed(self):
        geometry = dict(status="verified",lat=0,lon=0,max_grid_distance_km=1)
        cells = [dict(id="land",lat=0,lon=0,ocean=False,bottom_depth_m=100), dict(id="shallow",lat=0,lon=0,ocean=True,bottom_depth_m=5), dict(id="sea",lat=0,lon=.001,ocean=True,bottom_depth_m=100)]
        self.assertEqual(sea_cell(cells,geometry,10)["id"],"sea")
        self.assertIsNone(sea_cell(cells,{**geometry,"status":"unverified"},10))
        self.assertIsNone(sea_cell(cells,{**geometry,"max_grid_distance_km":.01},10))

    def test_window_uses_actual_interval_and_requires_endpoints(self):
        series = [("2026-01-01T00:00Z",0),("2026-01-01T01:00Z",6),("2026-01-01T02:00Z",12)]
        self.assertEqual(window_mean(series,"2026-01-01T00:30Z","2026-01-01T01:30Z"),6)
        self.assertIsNone(window_mean(series,"2025-12-31T23:30Z","2026-01-01T00:30Z"))

    def test_scaler_rejects_label_leakage_and_future_knowledge(self):
        rows = [dict(valid_time="2026-01-01T00:00Z",retrieved_at="2026-01-02T00:00Z",issued_at=None,features={"u":value,"constant":1}) for value in (1,3,5)]
        rows.append({**rows[0],"retrieved_at":"2026-01-04T00:00Z","features":{"u":1000}})
        result = build_scaler(rows,["u","constant","missing"],"2026-01-03T00:00Z")
        self.assertEqual(result["row_count"],3)
        self.assertEqual(result["features"]["u"]["median"],3)
        self.assertEqual(result["features"]["u"]["iqr"],2)
        self.assertEqual(result["features"]["constant"]["reason"],"zero_iqr")
        self.assertEqual(result["features"]["missing"]["reason"],"no_historical_distribution")
        with self.assertRaises(ValueError):
            build_scaler([{**rows[0],"overall_pci":1}],["u"],"2026-01-03T00:00Z")

    def test_feature_window_does_not_generate_phase_or_vertical_velocity(self):
        from bunaken_engine.features import extract_window
        geometry=dict(status="verified",reference_depth_m=15,wall_bearing_deg=0,offshore_bearing_deg=90,version="synthetic")
        rows=[dict(variable=var,depth_m=depth,valid_time=at,value=value) for var,depth,value in (("uo",15,2),("vo",15,3),("thetao",15,29)) for at in ("2026-01-01T00:00Z","2026-01-01T01:00Z")]
        result=extract_window(rows,geometry,"2026-01-01T00:00Z","2026-01-01T01:00Z")
        self.assertEqual(result["values"]["current_along_m_s"],3)
        self.assertEqual(result["values"]["current_cross_m_s"],2)
        self.assertEqual(result["values"]["modelled_temperature_c"],29)
        self.assertIsNone(result["values"]["tide_phase_sin"])
        self.assertIsNone(result["values"]["horizontal_shear_10_30_m_s"])
        self.assertNotIn("vertical_velocity",result["values"])
