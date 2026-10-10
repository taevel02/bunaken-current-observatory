import contextlib
import datetime
import io
from pathlib import Path
import re
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo


class SealWorkflowDateTest(unittest.TestCase):
    def test_seal_target_tracks_latest_elapsed_wita_cutoff(self):
        workflow = (Path(__file__).resolve().parents[2] / '.github/workflows/environment.yml').read_text()
        workflow = '\n'.join(line for line in workflow.splitlines() if not line.lstrip().startswith('#'))
        match = re.search(r'if \[\[ "\$OPERATION" == seal \]\]; then\s+TARGET_DATE=\$\(uv run --project engine --locked python -c \'([^\']+)\'\)', workflow)
        self.assertIsNotNone(match, 'seal needs its own cutoff-aware target date')
        real_datetime = datetime.datetime
        for instant, expected in [('2026-10-09T19:59:59+08:00', '2026-10-09'), ('2026-10-09T20:00:00+08:00', '2026-10-10'), ('2026-10-09T20:17:00+08:00', '2026-10-10'), ('2026-10-10T02:52:00+08:00', '2026-10-10'), ('2026-10-10T07:17:00+08:00', '2026-10-10')]:
            with self.subTest(instant=instant):
                class Clock(real_datetime):
                    @classmethod
                    def now(cls, tz=None):
                        return real_datetime.fromisoformat(instant).astimezone(tz or ZoneInfo('UTC'))
                output = io.StringIO()
                with patch('datetime.datetime', Clock), contextlib.redirect_stdout(output):
                    exec(match.group(1), {})
                self.assertEqual(output.getvalue().strip(), expected)
        self.assertIn('TARGET_DATE=$(TZ=Asia/Makassar date -d tomorrow +%F)', workflow)
