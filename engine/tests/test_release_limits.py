import gzip
import json
import unittest
from unittest.mock import patch

from bunaken_engine.public_release import build_release
from bunaken_engine.snapshots import canonical, SnapshotError


class ReleaseLimitsTest(unittest.TestCase):
    def package(self, padding):
        def encode(value):
            raw = canonical(value)
            return b' ' * padding + raw if 'environment_samples' in value else raw

        with patch('bunaken_engine.public_release.canonical', side_effect=encode):
            return build_release('b' * 40)

    def test_seven_day_payload_can_exceed_the_old_ten_mb_limit(self):
        _, files = self.package(12_000_000)
        raw = next(raw for path, raw in files.items() if path.endswith('dashboard.json.gz'))
        self.assertGreater(len(gzip.decompress(raw)), 10_000_000)
        self.assertEqual(json.loads(gzip.decompress(raw))['schema_version'], '1.1')
        from bunaken_engine.git_store import GitDataStore
        from test_git_store import GitMock
        mock = GitMock()
        store = GitDataStore('synthetic', 'synthetic', 'synthetic', requester=mock.request)
        _, files = self.package(12_000_000)
        # The publication source must be the head actually verified by the store.
        pointer = json.loads(files['web/latest.json'])
        prefix = f"web/releases/{pointer['release_id']}"
        manifest = json.loads(files[prefix + '/manifest.json'])
        manifest['source_data_commit_sha'] = mock.head
        from bunaken_engine.snapshots import digest
        files[prefix + '/manifest.json'] = canonical(manifest)
        pointer['manifest_sha256'] = digest(files[prefix + '/manifest.json'])
        files['web/latest.json'] = canonical(pointer)
        with patch.object(store, 'current_observations', return_value=[]):
            store.publish_release(files, mock.head)
        self.assertEqual(len(mock.ref_calls), 1)

    def test_decompression_limit_remains_bounded(self):
        with self.assertRaisesRegex(SnapshotError, 'release_size_exceeded'):
            self.package(50_000_001)

    def test_cli_reports_controlled_codes_without_arbitrary_exception_text(self):
        from contextlib import redirect_stdout
        from io import StringIO
        from pathlib import Path
        from tempfile import TemporaryDirectory
        from bunaken_engine.public_release import main
        from bunaken_engine.git_store import StorageError
        for error, code in [(SnapshotError('release_size_exceeded'), 'release_size_exceeded'),
                            (StorageError('branch_conflict'), 'branch_conflict'),
                            (ValueError('secret credential content'), None),
                            (SnapshotError('credential=value'), None)]:
            with self.subTest(error=type(error).__name__), TemporaryDirectory() as folder:
                output = StringIO()
                argv = ['public_release', '--source-data-commit', 'b' * 40,
                        '--output', str(Path(folder) / 'output')]
                with patch('sys.argv', argv), patch('bunaken_engine.public_release.build_release', side_effect=error), redirect_stdout(output):
                    with self.assertRaises(SystemExit) as stopped:
                        main()
                self.assertEqual(stopped.exception.code, 1)
                report = json.loads(output.getvalue())
                self.assertEqual(report.get('error_code'), code)
                self.assertNotIn('credential', output.getvalue())
