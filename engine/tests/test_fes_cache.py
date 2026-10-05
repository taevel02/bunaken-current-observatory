import gzip
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from bunaken_engine.fes_cache import TideEphemeris
from bunaken_engine.sources import SourceError
from bunaken_engine.registry import load_geometry, load_sources
from bunaken_engine.snapshots import canonical, digest, allowed_data_path


class TideCacheTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree('config',self.root/'config')
        shutil.copytree('packages',self.root/'packages')
        self.directory = self.root/'cache'; self.directory.mkdir()
        self.sites = load_geometry(self.root)['sites']
        source = load_sources(self.root)['fes-height']
        raw = gzip.compress(canonical({site['site_id']:[.1,.2,.3] for site in self.sites}),mtime=0)
        from bunaken_engine import fes_cache
        self.manifest = dict(schema_version='1.0',kind='tidal_ephemeris',generated_at='2026-01-01T00:00:00Z',
            valid_start='2026-10-06T00:00:00Z',valid_end='2026-10-06T01:00:00Z',interval_seconds=1800,
            sample_count=3,geometry_sha256=digest(canonical(load_geometry(self.root))),
            source_sha256=digest(canonical(source)),generator_sha256=digest(Path(fes_cache.__file__).read_bytes()),
            code_hashes={},conformance=dict(passed=True,reference='LIBFES 2.9.7',comparisons=152,rejected=0,
                tolerance_m=.001,max_absolute_difference_m=.0001),artifact_sha256=digest(raw))
        self.raw = raw
        self.pin()

    def pin(self):
        encoded = canonical(self.manifest)
        (self.directory/'manifest.json').write_bytes(encoded)
        (self.directory/'heights.json.gz').write_bytes(self.raw)
        (self.root/'config/fes-derived.json').write_bytes(canonical(dict(schema_version='1.0',
            path='tides/ephemerides/'+digest(encoded),manifest_sha256=digest(encoded),artifact_sha256=digest(self.raw))))

    def test_exact_values_and_original_generation_time_are_preserved(self):
        cache = TideEphemeris(self.directory,self.root)
        rows = cache.collect(load_sources(self.root)['fes-height'],self.sites[0],
            '2026-10-06T00:00:00Z','2026-10-06T01:00:00Z')
        self.assertEqual([row['value'] for row in rows],[.1,.2,.3])
        self.assertTrue(all(row['retrieved_at']=='2026-01-01T00:00:00Z' and row['issued_at'] is None for row in rows))
        self.assertTrue(all('precomputed_tidal_ephemeris' in row['quality_flags'] for row in rows))

    def test_horizon_and_non_aligned_times_fail_closed(self):
        cache = TideEphemeris(self.directory,self.root)
        for start,end in [('2026-10-05T23:30:00Z','2026-10-06T00:00:00Z'),
                          ('2026-10-06T01:00:00Z','2026-10-06T01:30:00Z'),
                          ('2026-10-06T00:01:00Z','2026-10-06T00:31:00Z')]:
            with self.assertRaises(SourceError): cache.collect(load_sources(self.root)['fes-height'],self.sites[0],start,end)

    def test_tamper_configuration_code_and_conformance_rejected(self):
        (self.directory/'heights.json.gz').write_bytes(self.raw+b'tamper')
        with self.assertRaises(SourceError): TideEphemeris(self.directory,self.root)
        for field,value in [('geometry_sha256','a'*64),('generator_sha256','a'*64),('sample_count',4)]:
            old = self.manifest[field]; self.manifest[field]=value; self.pin()
            with self.assertRaises(SourceError): TideEphemeris(self.directory,self.root)
            self.manifest[field]=old
        self.manifest['conformance']['passed']=False; self.pin()
        with self.assertRaises(SourceError): TideEphemeris(self.directory,self.root)

    def test_allowlist_excludes_raw_atlas(self):
        self.assertTrue(allowed_data_path('tides/ephemerides/'+'a'*64+'/heights.json.gz'))
        self.assertFalse(allowed_data_path('tides/ephemerides/'+'a'*64+'/m2_fes2022.nc'))
        self.assertFalse(allowed_data_path('tides/ephemerides/../manifest.json'))
