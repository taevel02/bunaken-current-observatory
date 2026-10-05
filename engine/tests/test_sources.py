import io
import json
import unittest
from urllib.error import HTTPError
from bunaken_engine.registry import load_sources, resolve_geometry
from bunaken_engine.sources import collect_open_meteo, collect_copernicus, fetch_json, SourceError

GEOMETRY=dict(site_id="mandolin",status="verified",lat=1,lon=124,reference_depth_m=15,wall_bearing_deg=0,offshore_bearing_deg=90,max_grid_distance_km=10,verified_at="2026-09-30T00:00:00Z",version="synthetic",evidence=["synthetic fixture"])


class SourcesTest(unittest.TestCase):
    def test_unverified_geometry_never_queries_provider(self):
        unverified={**resolve_geometry("mandolin"),"status":"unverified"}
        for key in ("lat","lon","reference_depth_m","wall_bearing_deg","offshore_bearing_deg","max_grid_distance_km"):unverified[key]=None
        with self.assertRaises(SourceError) as error:
            collect_open_meteo(load_sources()["open-meteo-wind"],unverified,"2026-01-01T00:00Z","2026-01-01T01:00Z",fetcher=lambda url: self.fail("must not fetch"))
        self.assertEqual(error.exception.code,"unverified_geometry")

    def test_open_meteo_units_times_native_resolution_and_missing(self):
        source=load_sources()["open-meteo-wind"]
        data=dict(latitude=1,longitude=124,hourly_units=dict(wind_speed_10m="m/s",wind_direction_10m="°"),hourly=dict(time=[1767225600,1767229200],wind_speed_10m=[0,None],wind_direction_10m=[359,1]))
        urls=[]
        def fetcher(url):
            urls.append(url)
            return data
        samples=collect_open_meteo(source,GEOMETRY,"2026-01-01T00:00Z","2026-01-01T01:00Z",fetcher=fetcher,usage_mode="noncommercial")
        self.assertEqual(len(samples),4)
        self.assertEqual(samples[0]["value"],0)
        self.assertIsNone(samples[1]["value"])
        self.assertIsNone(samples[0]["issued_at"])
        self.assertNotIn("native_time_resolution_unknown",samples[0]["quality_flags"])
        self.assertTrue(any("models=ecmwf_ifs" in url for url in urls))
        data["hourly_units"]["wind_speed_10m"]="km/h"
        with self.assertRaises(SourceError):
            collect_open_meteo(source,GEOMETRY,"2026-01-01T00:00Z","2026-01-01T01:00Z",fetcher=fetcher,usage_mode="noncommercial")

    def test_open_meteo_uses_stable_provider_update_metadata(self):
        from unittest.mock import patch
        source=load_sources()["open-meteo-wave"]
        metadata=dict(last_run_initialisation_time=1767225600,last_run_modification_time=1767226200,
                      last_run_availability_time=1767226800,temporal_resolution_seconds=10800,
                      update_interval_seconds=43200,data_end_time=1767312000)
        data=dict(latitude=1,longitude=124,hourly_units={name:unit for name,unit in source['variables'].items()},
                  hourly=dict(time=[1767225600,1767229200],**{name:[1,2] for name in source['variables']}))
        def fetcher(url): return metadata if '/static/meta.json' in url else data
        with patch('bunaken_engine.sources.utc_now',return_value='2026-01-01T01:20:00Z'):
            rows=collect_open_meteo(source,GEOMETRY,'2026-01-01T00:00Z','2026-01-01T01:00Z',fetcher=fetcher,usage_mode='noncommercial')
        self.assertEqual(rows[0]['source_updated_at'],'2026-01-01T00:20:00Z')
        self.assertNotIn('source_age_unknown',rows[0]['quality_flags'])
        self.assertIsNone(rows[0]['issued_at'])  # Feed metadata is not the exact run identity of every sample.
        metadata['last_run_availability_time']=1767232800
        with patch('bunaken_engine.sources.utc_now',return_value='2026-01-01T01:20:00Z'):
            rows=collect_open_meteo(source,GEOMETRY,'2026-01-01T00:00Z','2026-01-01T01:00Z',fetcher=fetcher,usage_mode='noncommercial')
        self.assertIsNone(rows[0]['source_updated_at'])
        self.assertIn('source_age_unknown',rows[0]['quality_flags'])

    def test_missing_credentials_fail_without_prompt(self):
        with self.assertRaises(SourceError) as error:
            collect_copernicus(load_sources()["copernicus-currents"],GEOMETRY,"2026-01-01T00:00Z","2026-01-01T01:00Z",15)
        self.assertEqual(error.exception.code,"provider_credentials_missing")

    def test_http_retries_only_retryable_errors_and_redacts_url(self):
        attempts=[]
        def opener(request,timeout):
            attempts.append(request)
            if len(attempts)<3:
                raise HTTPError("secret-bearing-url",429,"private",{},None)
            return io.BytesIO(b'{"ok":true}')
        self.assertEqual(fetch_json("https://example.com",opener=opener,sleep=lambda _: None),{"ok":True})
        self.assertEqual(len(attempts),3)
        def forbidden(request,timeout):
            raise HTTPError("secret-bearing-url",401,"private",{},None)
        with self.assertRaises(SourceError) as error:
            fetch_json("https://example.com",opener=forbidden,sleep=lambda _: self.fail("no retry"))
        self.assertNotIn("secret",str(error.exception))
        self.assertFalse(error.exception.retryable)
