import gzip
import unittest
from unittest.mock import patch
from jsonschema.exceptions import ValidationError

from bunaken_engine.pipeline import collect_run, publish_bundle, verified_receipt
from bunaken_engine.snapshot_io import encode_manifest, decode_manifest, read_stored_manifest
from bunaken_engine.snapshots import canonical, digest, make_bundle, SnapshotError, validate
from bunaken_engine.git_store import GitDataStore
from test_git_store import GitMock


class SnapshotIOTest(unittest.TestCase):
    def test_both_encodings_preserve_json_and_hash_the_actual_storage_bytes(self):
        document = {'kind': 'synthetic', 'value': 0.0}
        plain = encode_manifest(document)
        packed = encode_manifest(document, compressed=True)
        self.assertEqual(plain, canonical(document))
        self.assertEqual(gzip.decompress(packed), plain)
        self.assertEqual(decode_manifest(plain), document)
        self.assertEqual(decode_manifest(packed), document)
        self.assertNotEqual(digest(plain), digest(packed))

    def test_decompression_and_encoded_size_are_bounded(self):
        with patch('bunaken_engine.snapshot_io.MAX_MANIFEST_BYTES', 32):
            with self.assertRaisesRegex(SnapshotError, 'snapshot_manifest_size_exceeded'):
                decode_manifest(gzip.compress(b' ' * 100 + b'{}'))
            with self.assertRaisesRegex(SnapshotError, 'snapshot_manifest_size_exceeded'):
                encode_manifest({'value': 'x' * 100})
        with patch('bunaken_engine.snapshot_io.MAX_COMPRESSED_MANIFEST_BYTES', 10):
            with self.assertRaisesRegex(SnapshotError, 'snapshot_manifest_size_exceeded'):
                decode_manifest(gzip.compress(b'{}'))

    def test_compressed_receipt_round_trip_tamper_and_legacy_read(self):
        manifest, _ = collect_run('2026-10-07', 'a' * 40, days=1, collector=lambda *args: [])
        # This mock has no source evidence and cannot yield numeric PCI.
        _, legacy = collect_run('2026-10-07', 'a' * 40, days=1, collector=lambda *args: [])
        features = []
        forecast = []
        # Build a valid empty diagnostic bundle using its own canonical artifacts.
        manifest['artifact_hashes'] = {'features.json.gz': digest(gzip.compress(canonical(features), mtime=0)),
                                       'forecast.json.gz': digest(gzip.compress(canonical(forecast), mtime=0))}
        files = make_bundle(manifest, features, forecast, compress_manifest=True)
        mock = GitMock()
        store = GitDataStore('synthetic', 'synthetic', 'synthetic', requester=mock.request)
        receipt = publish_bundle(store, manifest, files)
        self.assertEqual(receipt['schema_version'], '1.1')
        self.assertTrue(receipt['manifest_path'].endswith('/manifest.json.gz'))
        self.assertEqual(receipt['manifest_sha256'], digest(files[receipt['manifest_path']]))
        self.assertTrue(verified_receipt(store, receipt, store.head())['storage_verified'])
        prefix = receipt['manifest_path'].rsplit('/', 1)[0]
        self.assertEqual(read_stored_manifest(store, prefix, store.head())[1], manifest)
        original = mock.versions[mock.head][receipt['manifest_path']]
        mock.versions[mock.head][receipt['manifest_path']] = original + b'tampered'
        with self.assertRaisesRegex(SnapshotError, 'receipt_manifest_mismatch'):
            verified_receipt(store, receipt, store.head())
        path = next(path for path in legacy if path.endswith('/manifest.json'))
        store.insert(legacy)
        self.assertTrue(read_stored_manifest(store, path.rsplit('/', 1)[0], store.head())[0].endswith('/manifest.json'))
        wrong = dict(receipt, schema_version='1.0')
        with self.assertRaises(ValidationError):
            validate('snapshot-receipt', wrong)
