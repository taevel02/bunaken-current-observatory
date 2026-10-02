import copy
import unittest
from bunaken_engine.registry import load_sources, load_geometry, resolve_geometry, validate_geometry, export_allowed


class RegistryTest(unittest.TestCase):
    def test_entry_points_are_verified_without_promoting_full_geometry(self):
        geometry = load_geometry()
        self.assertEqual(len(geometry["sites"]), 19)
        self.assertEqual(geometry["zones"], [])
        self.assertTrue(all(entry["status"] == "coordinates_depth_verified" for entry in geometry["sites"]))
        self.assertEqual(resolve_geometry("mandolin")["lat"], 1.612167)
        self.assertTrue(all(entry["wall_bearing_deg"] is None for entry in geometry["sites"]))
        with self.assertRaises(ValueError):
            resolve_geometry("mandolin", "made-up-zone")

    def test_verified_geometry_requires_real_evidence(self):
        entry = copy.deepcopy(resolve_geometry("mandolin"))
        entry["lat"] = 91
        with self.assertRaises(ValueError):
            validate_geometry(entry)
        entry.update(status="verified", lat=1, lon=124, reference_depth_m=15, wall_bearing_deg=0, offshore_bearing_deg=90, max_grid_distance_km=1, evidence=[])
        with self.assertRaises(ValueError):
            validate_geometry(entry)

    def test_variable_specific_resolution_and_export_gate(self):
        sources = load_sources()
        self.assertEqual(sources["copernicus-currents"]["native_resolution"]["time_hours"], 6)
        self.assertEqual(sources["open-meteo-wave"]["native_resolution"]["time_hours"], 3)
        self.assertIsNone(sources["open-meteo-wind"]["native_resolution"]["time_hours"])
        self.assertFalse(export_allowed(sources["copernicus-currents"], ["uo"]))
        self.assertFalse(export_allowed(sources["open-meteo-wave"], ["password"]))
        self.assertTrue(export_allowed(sources["open-meteo-wave"], ["wave_height"]))
