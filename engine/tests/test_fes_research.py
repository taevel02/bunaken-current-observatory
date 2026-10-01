import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from bunaken_engine.fes_atlas import WAVES, sha256
from bunaken_engine.fes_research import history, verify_atlas


class FesResearchTest(unittest.TestCase):
    def atlas(self, directory):
        regional = directory / 'regional'
        regional.mkdir()
        entries = []
        paths = {}
        for wave in WAVES:
            name = wave.lower()+'_fes2022.nc'
            path = regional/name
            path.write_bytes(b'synthetic fixture')
            paths[wave] = str(path.resolve())
            entries.append(dict(wave=wave,file=name,regional_sha256=sha256(path)))
        config = directory/'fes2022.yaml'
        config.write_text(json.dumps({'tide':{'cartesian':{'paths':paths}}}))
        manifest = dict(layout='longitude_latitude',dataset='FES2022b',unit='cm',files=entries,config_sha256=sha256(config))
        (directory/'atlas-manifest.json').write_text(json.dumps(manifest))
        return manifest

    def test_checks_all_constituents_and_regional_hashes(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.atlas(root)
            self.assertEqual(len(verify_atlas(root)['files']),34)
            (root/'regional/m2_fes2022.nc').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError,'atlas_file_changed'):
                verify_atlas(root)

    def test_config_mutation_is_rejected(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.atlas(root)
            (root/'fes2022.yaml').write_text('{}')
            with self.assertRaisesRegex(ValueError,'atlas_config_changed'):
                verify_atlas(root)

    def test_incomplete_constituent_set_is_rejected(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = self.atlas(root)
            manifest['files'].pop()
            (root/'atlas-manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError,'atlas_constituents_incomplete'):
                verify_atlas(root)

    def test_history_bounds_and_immutable_output(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            for days in (0,32):
                with self.assertRaisesRegex(ValueError,'history_days_out_of_range'):
                    history(root,root,'2026-01-01T00:00Z',days,root/'lib',root/'out')
            with self.assertRaisesRegex(ValueError,'history_future_interval'):
                history(root,root,'2099-01-01T00:00Z',1,root/'lib',root/'out')
            (root/'out').mkdir()
            with self.assertRaisesRegex(ValueError,'history_output_exists'):
                history(root,root,'2026-01-01T00:00Z',1,root/'lib',root/'out')

    def test_partial_history_preserves_missing_features_and_retrieval_cutoff(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.atlas(root)
            (root/'config').mkdir()
            (root/'config/geometry.json').write_text('{}')
            (root/'packages/contracts/data').mkdir(parents=True)
            (root/'packages/contracts/data/sites.json').write_text('[]')
            (root/'config/features.json').write_text(json.dumps(dict(version='synthetic',groups={'tide':{'features':['tide_rate_m_per_hour','tide_excursion_m']},'ocean':{'features':['current_speed_m_s']}},disabled={})))
            site = dict(site_id='synthetic',status='coordinates_verified',version='fixture',lat=1.6,lon=124.7)
            def evaluate(atlas,sites,times):
                return {'synthetic':[(float(i*i),4) for i in range(len(times))]}
            with patch('bunaken_engine.fes_research.load_geometry',return_value={'sites':[site]}), patch('bunaken_engine.fes_research.evaluate',side_effect=evaluate), patch('bunaken_engine.fes_research.compare',return_value={'passed':True}), patch('bunaken_engine.fes_research.package_version',return_value='synthetic'):
                result = history(root,root,'2026-01-01T00:00Z',1,root/'lib',root/'out')
            rows = json.loads((root/'out/rows.json').read_text())
            scaler = json.loads((root/'out/scaler.json').read_text())
            self.assertTrue(result['partial'])
            self.assertGreater(len(rows),0)
            self.assertTrue(all(row['features']['current_speed_m_s'] is None for row in rows))
            self.assertTrue(scaler['features']['tide_rate_m_per_hour']['enabled'])
            self.assertEqual(scaler['features']['current_speed_m_s']['reason'],'historical_source_or_geometry_unverified')
            self.assertEqual(rows[0]['retrieved_at'],scaler['cutoff'])
            self.assertNotIn('overall_pci',rows[0])

            def mutate_inputs(atlas,sites,times):
                (root/'config/geometry.json').write_text('{"changed":true}')
                return evaluate(atlas,sites,times)
            with patch('bunaken_engine.fes_research.load_geometry',return_value={'sites':[site]}), patch('bunaken_engine.fes_research.evaluate',side_effect=mutate_inputs), patch('bunaken_engine.fes_research.compare',return_value={'passed':True}), patch('bunaken_engine.fes_research.package_version',return_value='synthetic'):
                with self.assertRaisesRegex(ValueError,'history_inputs_changed'):
                    history(root,root,'2026-01-01T00:00Z',1,root/'lib',root/'out-changed')
            self.assertFalse((root/'out-changed').exists())
