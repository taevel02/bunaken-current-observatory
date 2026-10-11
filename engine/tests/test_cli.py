import contextlib
import io
import json
import unittest
import tempfile
from unittest.mock import Mock, patch
from bunaken_engine.__main__ import main


class CLITest(unittest.TestCase):
    def test_status_is_machine_readable_and_does_not_expose_credentials(self):
        output=io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(main(["status"]),0)
        result=json.loads(output.getvalue())
        self.assertEqual(result["sites"],19)
        self.assertEqual(result["verified_sites"],0)
        self.assertNotIn("token",output.getvalue())
        self.assertNotIn("password",output.getvalue())

    def test_collect_rejects_unverified_code_before_writing(self):
        output=io.StringIO()
        with contextlib.redirect_stderr(output):
            self.assertEqual(main(["collect","--code-commit","invalid","--output","/private/tmp/must-not-write-bunaken"]),1)
        self.assertEqual(json.loads(output.getvalue())["error"],"code_commit_unverified_or_dirty")

    def test_collect_progress_uses_stderr_without_breaking_json_result(self):
        from bunaken_engine.pipeline import collect_run
        run='11111111-1111-4111-8111-111111111111'
        manifest,files=collect_run('2026-10-12','a'*40,days=1,run_id=run,collector=lambda *args:[])
        output=io.StringIO();progress=io.StringIO()
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(output), contextlib.redirect_stderr(progress):
            with patch('bunaken_engine.__main__.subprocess.run',side_effect=[Mock(stdout='a'*40),Mock(stdout='')]), patch('bunaken_engine.__main__.collect_run',return_value=(manifest,files)):
                self.assertEqual(main(['collect','--date','2026-10-12','--code-commit','a'*40,'--run-id',run,'--output',directory]),0)
        self.assertEqual(json.loads(output.getvalue())['run_id'],run)
        rows=[json.loads(line) for line in progress.getvalue().splitlines()]
        self.assertEqual([(row['stage'],row['event']) for row in rows],[
            ('provider_collection_and_forecast','started'),('provider_collection_and_forecast','finished'),
            ('snapshot_storage','started'),('snapshot_storage','finished')])
