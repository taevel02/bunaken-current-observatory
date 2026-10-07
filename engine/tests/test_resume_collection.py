from contextlib import redirect_stderr
from io import StringIO
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from bunaken_engine.__main__ import main


class ResumeCollectionTest(unittest.TestCase):
    def test_missing_stored_run_never_falls_back_to_provider_collection(self):
        store = Mock()
        store.head.return_value = 'b' * 40
        store.read.return_value = None
        errors = StringIO()
        with patch('bunaken_engine.__main__.subprocess.run', side_effect=[SimpleNamespace(stdout='a' * 40), SimpleNamespace(stdout='')]), \
             patch('bunaken_engine.__main__.store_from_env', return_value=store), \
             patch('bunaken_engine.__main__.collect_run') as collect, redirect_stderr(errors):
            with self.assertRaises(SystemExit) as stopped:
                main(['collect', '--date', '2026-10-08', '--code-commit', 'a' * 40,
                      '--run-id', '11111111-1111-4111-8111-111111111111',
                      '--output', '/private/tmp/synthetic-unused-resume-output', '--publish', '--resume-only'])
        self.assertEqual(stopped.exception.code, 1)
        self.assertIn('stored_snapshot_missing', errors.getvalue())
        collect.assert_not_called()
