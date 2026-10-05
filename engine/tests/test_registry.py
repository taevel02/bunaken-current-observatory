import copy
import unittest
from bunaken_engine.registry import load_sources, load_geometry, resolve_geometry, validate_geometry, export_allowed


class RegistryTest(unittest.TestCase):
    def test_entry_points_have_user_accepted_reference_axes_without_measured_geometry(self):
        geometry = load_geometry()
        self.assertEqual(len(geometry["sites"]), 19)
        self.assertEqual(geometry["zones"], [])
        self.assertTrue(all(entry["status"] == "reference_geometry" for entry in geometry["sites"]))
        self.assertEqual(resolve_geometry("mandolin")["lat"], 1.612167)
        self.assertTrue(all(entry["max_grid_distance_km"] == 6 and entry["verified_at"] is None for entry in geometry["sites"]))
        with self.assertRaises(ValueError):
            resolve_geometry("mandolin", "made-up-zone")

    def test_map_pixel_provenance_uses_the_recorded_digitization_frame(self):
        import math
        for entry in load_geometry()['sites']:
            reference=entry['direction_reference']
            self.assertEqual(reference['image_size_px'],[2286,1750])
            width,height=reference['digitization_frame_size_px']
            for key,bearing in [('red_tail_tip_px','wall_bearing_deg'),('blue_tail_tip_px','offshore_bearing_deg')]:
                x0,y0,x1,y1=reference[key]
                self.assertTrue(0 <= x0 < width and 0 <= x1 < width and 0 <= y0 < height and 0 <= y1 < height)
                angle=math.degrees(math.atan2(x1-x0,y0-y1))%360
                self.assertEqual(entry[bearing],(round(angle/15)*15)%360)

    def test_verified_geometry_requires_real_evidence(self):
        entry = copy.deepcopy(resolve_geometry("mandolin"))
        entry["lat"] = 91
        with self.assertRaises(ValueError):
            validate_geometry(entry)
        entry.update(status="verified", lat=1, lon=124, reference_depth_m=15, wall_bearing_deg=0, offshore_bearing_deg=90, max_grid_distance_km=1, evidence=[])
        with self.assertRaises(ValueError):
            validate_geometry(entry)

    def test_reference_axes_are_independent_and_do_not_bypass_verified_orthogonality(self):
        entry=copy.deepcopy(resolve_geometry('mikes-point'))
        validate_geometry(entry)
        self.assertEqual(entry['wall_bearing_deg'],210)
        self.assertEqual(entry['offshore_bearing_deg'],0)
        entry['status']='verified';entry['verified_at']='2026-10-04'
        with self.assertRaisesRegex(ValueError,'orthogonal'):validate_geometry(entry)
        entry['status']='reference_geometry';entry['max_grid_distance_km']=0
        with self.assertRaisesRegex(ValueError,'range'):validate_geometry(entry)
        entry['max_grid_distance_km']=6;entry['direction_reference']={}
        with self.assertRaisesRegex(ValueError,'acceptance'):validate_geometry(entry)

    def test_six_km_selection_excludes_more_distant_and_dry_cells(self):
        from bunaken_engine.features import sea_cell
        entry=copy.deepcopy(resolve_geometry('mandolin'));entry.update(lat=0,lon=0)
        wet=dict(id='within',lat=0,lon=.05,ocean=True,bottom_depth_m=40)
        self.assertEqual(sea_cell([wet],entry,18)['id'],'within')
        self.assertIsNone(sea_cell([{**wet,'lon':.06}],entry,18))
        self.assertIsNone(sea_cell([{**wet,'ocean':False}],entry,18))
        self.assertIsNone(sea_cell([{**wet,'bottom_depth_m':17}],entry,18))

    def test_variable_specific_resolution_and_export_gate(self):
        sources = load_sources()
        self.assertEqual(sources["copernicus-currents"]["native_resolution"]["time_hours"], 6)
        self.assertEqual(sources["open-meteo-wave"]["native_resolution"]["time_hours"], 3)
        self.assertEqual(sources["open-meteo-wind"]["native_resolution"]["time_hours"],1)
        self.assertEqual(sources["open-meteo-wind"]["dataset"],"ecmwf_ifs")
        self.assertTrue(export_allowed(sources["copernicus-currents"], ["uo"]))
        self.assertFalse(export_allowed(sources["copernicus-currents"], ["password"]))
        self.assertFalse(sources["copernicus-currents"]["redistribution"]["raw_allowed"])
        self.assertFalse(export_allowed(sources["open-meteo-wave"], ["password"]))
        self.assertTrue(export_allowed(sources["open-meteo-wave"], ["wave_height"]))
