"""CLI regressions: compressed input and actual storage evidence, no network."""
import contextlib
import gzip
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from bunaken_engine.__main__ import main
from bunaken_engine.model_data import model_context
from bunaken_engine.registry import ROOT
from bunaken_engine.snapshots import canonical, SnapshotError


class CLIModelBoundaryTest(unittest.TestCase):
    def test_scaler_plain_and_gzip_rows_are_equivalent(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            for suffix, encoded in [('json', canonical([])), ('json.gz', gzip.compress(canonical([])))]:
                source = folder / f'rows.{suffix}'; source.write_bytes(encoded)
                output = folder / f'{suffix}.out.json'
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    code = main(['scaler', '--input', str(source), '--cutoff', '2026-10-01T00:00:00Z', '--output', str(output)])
                self.assertEqual(code, 0, suffix)
                self.assertEqual(json.loads(output.read_text())['row_count'], 0)

    def test_operational_transfer_checks_storage_before_evaluation(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'context.json'
            source.write_bytes(canonical(model_context([], [], 'synthetic', 'synthetic', '2026-10-01T00:00:00Z')))
            store = Mock(); store.head.return_value = 'a' * 40
            with patch('bunaken_engine.__main__.store_from_env', return_value=store), \
                 patch('bunaken_engine.model_input.verify_context_storage', side_effect=SnapshotError('model_observation_history_incomplete')) as verify, \
                 patch('bunaken_engine.validation.evaluate_transfer') as evaluate, \
                 contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                code = main(['validate-transfer', '--context', str(source), '--operational', '--output', str(Path(directory)/'out.json')])
            self.assertEqual(code, 1)
            verify.assert_called_once()
            evaluate.assert_not_called()
