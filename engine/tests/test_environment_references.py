"""Synthetic storage transport tests; reference encoding never changes model inputs."""
import copy
import gzip
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from bunaken_engine.environment_references import pack
from bunaken_engine.snapshot_io import decode_manifest, encode_manifest, load_manifest
from bunaken_engine.snapshots import canonical, digest, SnapshotError, allowed_data_path


class EnvironmentReferenceTest(unittest.TestCase):
    def fixture(self, count=3):
        return dict(model_context=dict(training_bundles=[
            dict(manifest=dict(samples=[dict(value=i) for i in range(1000)], run_id=str(n)),features=[],forecast=[])
            for n in range(count)]), samples=[])

    def test_roundtrip_dedup_and_linear_reference_growth(self):
        original=self.fixture()
        envelope,files=pack(original)
        self.assertEqual(decode_manifest(encode_manifest(envelope,compressed=True),input_reader=files.get),original)
        again,second=pack(original)
        self.assertEqual((again,second),(envelope,files))
        larger=self.fixture(4); more,more_files=pack(larger)
        self.assertEqual(len(set(more_files)-set(files)),1)
        self.assertLess(len(canonical(envelope)),len(canonical(original))/10)
        self.assertTrue(all(allowed_data_path(path) for path in files))

    def test_missing_modified_traversal_and_nested_inputs_fail_closed(self):
        envelope,files=pack(self.fixture())
        raw=encode_manifest(envelope)
        with self.assertRaisesRegex(SnapshotError,'reader_required'): decode_manifest(raw)
        with self.assertRaisesRegex(SnapshotError,'hash_mismatch'): decode_manifest(raw,input_reader=lambda path:b'{}')
        with self.assertRaisesRegex(SnapshotError,'hash_mismatch'): decode_manifest(raw,input_reader=lambda path:None)
        malformed=copy.deepcopy(envelope);malformed['training_bundle_references'][0]['path']='../.env'
        with self.assertRaisesRegex(SnapshotError,'invalid_environment_reference'): decode_manifest(encode_manifest(malformed),input_reader=files.get)
        malformed=copy.deepcopy(envelope);malformed['manifest']['samples']=[{'changed':True}]
        with self.assertRaisesRegex(SnapshotError,'expansion_hash_mismatch'): decode_manifest(encode_manifest(malformed),input_reader=files.get)
        nested=dict(manifest=dict(model_context={'training_bundles':[]}),features=[],forecast=[])
        data=encode_manifest(nested,compressed=True);sha=digest(data);path=f'environment-inputs/{sha}.json.gz'
        malformed=copy.deepcopy(envelope);malformed['training_bundle_references']=[dict(path=path,sha256=sha)]
        with self.assertRaisesRegex(SnapshotError,'nested_model_context'): decode_manifest(encode_manifest(malformed),input_reader={path:data}.get)

    def test_aggregate_input_size_does_not_reintroduce_manifest_limit(self):
        original=self.fixture(10)
        limit=30000
        self.assertGreater(len(canonical(original)),limit)
        with patch('bunaken_engine.snapshot_io.MAX_MANIFEST_BYTES',limit):
            envelope,files=pack(original)
            raw=encode_manifest(envelope,compressed=True)
            self.assertEqual(decode_manifest(raw,input_reader=files.get),original)

    def test_local_replay_and_legacy_format(self):
        original=self.fixture(); envelope,files=pack(original)
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for path,raw in files.items():
                target=root/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
            manifest=root/'snapshots/2026-10-08/synthetic/manifest.json.gz'
            manifest.parent.mkdir(parents=True);manifest.write_bytes(encode_manifest(envelope,compressed=True))
            self.assertEqual(load_manifest(manifest),original)
        self.assertEqual(decode_manifest(encode_manifest(original)),original)
