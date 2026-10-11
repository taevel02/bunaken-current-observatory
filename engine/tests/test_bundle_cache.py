import copy
import gzip
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from jsonschema import ValidationError
from bunaken_engine import snapshots
from bunaken_engine.pipeline import collect_run
from bunaken_engine.registry import ROOT
from bunaken_engine.snapshots import make_bundle, validate_bundle, canonical, digest, SnapshotError


class BundleCacheTest(unittest.TestCase):
    def test_current_license_change_invalidates_the_checked_bundle_cache(self):
        from bunaken_engine.sources import sample
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            shutil.copytree(ROOT/'config',root/'config')
            shutil.copytree(ROOT/'packages/contracts',root/'packages/contracts')
            def collector(source,geometry,start,end):
                return [sample(source,geometry,'tide_height',0,start,'2026-10-11T10:00:00Z')] if source['id']=='fes-height' else []
            manifest,files=collect_run('2026-10-12','a'*40,days=1,root=root,collector=collector)
            features=json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('/features.json.gz'))))
            forecast=json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('/forecast.json.gz'))))
            make_bundle(manifest,features,forecast,root=root)
            path=root/'config/source-registry.json'
            registry=json.loads(path.read_text())
            next(source for source in registry['sources'] if source['id']=='fes-height')['redistribution']['derived_allowed']=False
            path.write_text(json.dumps(registry))
            with self.assertRaisesRegex(SnapshotError,'source_export_forbidden'):
                make_bundle(manifest,features,forecast,root=root)

    def test_replay_reuses_success_but_mutation_and_schema_changes_are_rechecked(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            shutil.copytree(ROOT/'config',root/'config')
            shutil.copytree(ROOT/'packages/contracts',root/'packages/contracts')
            manifest,files=collect_run('2026-10-12','a'*40,days=1,root=root,
                                      collector=lambda *args:[])
            features=json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('/features.json.gz'))))
            forecast=json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('/forecast.json.gz'))))
            with patch('bunaken_engine.snapshots.validate',wraps=snapshots.validate) as validate:
                first=make_bundle(manifest,features,forecast,root=root)
                count=validate.call_count
                second=make_bundle(copy.deepcopy(manifest),copy.deepcopy(features),copy.deepcopy(forecast),root=root)
                self.assertEqual(validate.call_count,count)
                self.assertEqual(first,second)
                path=next(iter(first));first[path]=b'caller mutation'
                self.assertNotEqual(first[path],make_bundle(manifest,features,forecast,root=root)[path])
                altered=copy.deepcopy(features);altered[0]['values']['forbidden']=1
                with self.assertRaisesRegex(SnapshotError,'unknown_feature_field'):
                    make_bundle(manifest,altered,forecast,root=root)
                altered=copy.deepcopy(forecast);altered[0]['pci']=.5
                with self.assertRaisesRegex(SnapshotError,'numeric_model_not_implemented'):
                    make_bundle(manifest,features,altered,root=root)
            path=root/'packages/contracts/json-schema/snapshot.schema.json'
            schema=json.loads(path.read_text());schema['required'].append('new_required_field')
            path.write_text(json.dumps(schema))
            with self.assertRaises(ValidationError):
                make_bundle(manifest,features,forecast,root=root)

    def test_verification_checks_artifact_hashes_without_reserializing_history(self):
        manifest,files=collect_run('2026-10-12','a'*40,days=1,collector=lambda *args:[])
        features=json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('/features.json.gz'))))
        forecast=json.loads(gzip.decompress(next(raw for path,raw in files.items() if path.endswith('/forecast.json.gz'))))
        forecast[0]['reason_codes'].append('synthetic_validation_only')
        manifest['artifact_hashes']['forecast.json.gz']=digest(gzip.compress(canonical(forecast),mtime=0))
        with patch('bunaken_engine.snapshot_io.encode_manifest',side_effect=AssertionError('verification must not serialize history')):
            validate_bundle(manifest,features,forecast)
            manifest['artifact_hashes']['forecast.json.gz']='0'*64
            with self.assertRaisesRegex(SnapshotError,'artifact_hash_mismatch'):
                validate_bundle(manifest,features,forecast)
