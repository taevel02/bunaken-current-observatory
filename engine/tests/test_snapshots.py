import copy
import gzip
import json
import unittest
from unittest.mock import patch
from bunaken_engine.pipeline import collect_run
from bunaken_engine.snapshots import seal_cutoff, select_seal, make_bundle, SnapshotError, assess_sources, allowed_data_path

RUN="11111111-1111-4111-8111-111111111111"
CODE="a"*40


class SnapshotTest(unittest.TestCase):
    def receipt(self,at,**updates):
        return dict(kind="snapshot",status="succeeded",storage_verified=True,persisted_at=at,valid_start="2026-09-30T16:00Z",valid_end="2026-10-02T16:00Z",run_id=RUN,storage_commit=CODE,manifest_sha256="b"*64,**updates)

    def test_unverified_sites_produce_null_forecast_not_synthetic_environment(self):
        manifest,files=collect_run("2026-10-01",CODE,days=1,run_id=RUN,collector=lambda *args:self.fail("no geometry, no query"))
        self.assertEqual(manifest["status"],"failed")
        self.assertEqual(manifest["samples"],[])
        self.assertIsNone(manifest["source_retrieved_at"])
        forecast=json.loads(gzip.decompress(next(content for path,content in files.items() if path.endswith("forecast.json.gz"))))
        self.assertEqual(len(forecast),19*16)
        self.assertTrue(all(row["pci"] is None and "unverified_geometry" in row["reason_codes"] for row in forecast))

    def test_cutoff_actual_receipt_time_late_rerun_and_backfill(self):
        self.assertEqual(seal_cutoff("2026-10-01").isoformat(),"2026-09-30T12:00:00+00:00")
        before=self.receipt("2026-09-30T11:59:59Z")
        exact={**before,"persisted_at":"2026-09-30T12:00:00Z","run_id":"22222222-2222-4222-8222-222222222222"}
        late={**before,"persisted_at":"2026-09-30T12:01:00Z"}
        backfill={**before,"kind":"backfill"}
        missing={**before,"status":"failed"}
        result=select_seal("2026-10-01",[before,exact,late,backfill,missing],"2026-10-03T00:00Z")
        self.assertEqual(result["run_id"],RUN)
        self.assertEqual(select_seal("2026-10-01",[exact,late,backfill],"2026-10-01T00:00Z")["status"],"missed_d1_snapshot")
        with self.assertRaises(SnapshotError):
            select_seal("2026-10-01",[before],"2026-09-30T11:59Z")

    def test_wrong_target_horizon_and_unverified_receipt_are_excluded(self):
        original=self.receipt("2026-09-30T11:59Z")
        for updates in ({"valid_end":"2026-10-01T12:00Z"},{"valid_start":"2026-10-01T00:00Z"},{"storage_verified":False}):
            result=select_seal("2026-10-01",[{**original,**updates}],"2026-10-01T00:00Z")
            self.assertEqual(result["status"],"missed_d1_snapshot")

    def test_hash_determinism_unknown_fields_and_export_allowlist(self):
        with patch("bunaken_engine.pipeline.utc_now",return_value="2026-09-30T00:00:00Z"):
            a,files=collect_run("2026-10-01",CODE,days=1,run_id=RUN)
            b,again=collect_run("2026-10-01",CODE,days=1,run_id=RUN)
        self.assertEqual(files,again)
        changed={**a,"artifact_hashes":{**a["artifact_hashes"],"features.json.gz":"0"*64}}
        with self.assertRaises(SnapshotError):
            make_bundle(changed,[],[],kind="snapshot")
        self.assertFalse(allowed_data_path(".github/workflows/injection.yml"))
        self.assertFalse(allowed_data_path("snapshots/../password"))
        self.assertTrue(all(allowed_data_path(path) for path in files))
        readiness=assess_sources([], ["fes-height","copernicus-currents"],"2026-09-30T00:00:00Z")
        self.assertTrue(all(state["status"]=="failed" for state in readiness.values()))
