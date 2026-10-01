"""Bind numerical conformance evidence to the exact private atlas and runtime."""
from importlib.metadata import PackageNotFoundError, version
import json
from pathlib import Path

from bunaken_engine.features import finite
from bunaken_engine.fes_atlas import sha256
from bunaken_engine.fes_research import verify_atlas


def provenance(config: Path, geometry: dict, validation: str | None) -> tuple[bool,bool]:
    atlas_verified = False
    try:
        if config.name != 'fes2022.yaml':
            return False,False
        verify_atlas(config.parent)
        atlas_verified = True
        if not validation:
            return True,False
        path = Path(validation)
        proof = json.loads(path.read_text())
        if proof['kind'] != 'historical_environment_analysis' or proof['atlas_sha256'] != sha256(config.parent/'atlas-manifest.json'):
            return True,False
        runtimes = ('pyfes','numpy','netCDF4','xarray')
        if any(proof['runtime_versions'].get(name) != version(name) for name in runtimes):
            return True,False
        modules = ('fes_research.py','fes_atlas.py','features.py','registry.py')
        if any(proof['code_hashes'].get(name) != sha256(Path(__file__).parent/name) for name in modules):
            return True,False
        documents = {}
        for name in ('conformance.json','site-rows.json'):
            evidence = path.parent/name
            if proof['files'].get(name) != sha256(evidence):
                return True,False
            documents[name] = json.loads(evidence.read_text())
        report = documents['conformance.json']
        error = report.get('max_absolute_difference_m')
        count = report.get('comparisons')
        if type(count) is not int or count <= 0:
            return True,False
        if report.get('passed') is not True or report.get('reference') != 'LIBFES 2.9.7' or report.get('rejected') != 0 or report.get('tolerance_m') != .001 or not finite(error) or not 0 <= error <= .001:
            return True,False
        sites = [site for site in documents['site-rows.json'] if site['site_id'] == geometry['site_id']]
        matched = len(sites) == 1 and all(sites[0].get(key) == geometry.get(key) for key in ('lat','lon'))
        return True,matched
    except (OSError,ValueError,KeyError,TypeError,PackageNotFoundError):
        return atlas_verified,False
