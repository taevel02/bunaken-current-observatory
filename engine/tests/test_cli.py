import contextlib
import io
import json
import unittest
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
