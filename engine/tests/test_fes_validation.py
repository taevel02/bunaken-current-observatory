import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from bunaken_engine.fes_atlas import sha256
from bunaken_engine.fes_validation import provenance


class ValidationTest(unittest.TestCase):
    def test_proof_requires_exact_runtime_code_atlas_site_and_report(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/'atlas-manifest.json').write_text('{}')
            config = root/'fes2022.yaml'
            config.write_text('{}')
            site = dict(site_id='synthetic',lat=1.6,lon=124.7)
            report = dict(passed=True,reference='LIBFES 2.9.7',comparisons=8,rejected=0,tolerance_m=.001,max_absolute_difference_m=.0009)
            (root/'conformance.json').write_text(json.dumps(report))
            (root/'site-rows.json').write_text(json.dumps([site]))
            modules = ('fes_research.py','fes_atlas.py','features.py','registry.py')
            code = Path(__file__).parents[1]/'bunaken_engine'
            proof = dict(kind='historical_environment_analysis',atlas_sha256=sha256(root/'atlas-manifest.json'),runtime_versions={name:'fixture' for name in ('pyfes','numpy','netCDF4','xarray')},code_hashes={name:sha256(code/name) for name in modules},files={name:sha256(root/name) for name in ('conformance.json','site-rows.json')})
            path = root/'manifest.json'
            path.write_text(json.dumps(proof))
            with patch('bunaken_engine.fes_validation.verify_atlas'), patch('bunaken_engine.fes_validation.version',return_value='fixture'):
                self.assertEqual(provenance(config,site,str(path)),(True,True))
                self.assertEqual(provenance(config,site,None),(True,False))
                self.assertEqual(provenance(config,{**site,'lon':124.8},str(path)),(True,False))
                (root/'conformance.json').write_text('{}')
                self.assertEqual(provenance(config,site,str(path)),(True,False))
                for count in (0,True,-1):
                    (root/'conformance.json').write_text(json.dumps({**report,'comparisons':count}))
                    proof['files']['conformance.json']=sha256(root/'conformance.json')
                    path.write_text(json.dumps(proof))
                    self.assertEqual(provenance(config,site,str(path)),(True,False))
                (root/'conformance.json').write_text(json.dumps(report))
                proof['files']['conformance.json']=sha256(root/'conformance.json')
                proof['code_hashes']['features.py']='changed'
                path.write_text(json.dumps(proof))
                self.assertEqual(provenance(config,site,str(path)),(True,False))
            with patch('bunaken_engine.fes_validation.verify_atlas',side_effect=ValueError('changed')):
                self.assertEqual(provenance(config,site,str(path)),(False,False))
