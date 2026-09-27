import json
import unittest
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[2]
CONTRACTS = ROOT / "packages/contracts"
sys.path.insert(0, str(ROOT / "engine"))
from bunaken_engine.time import wita_date, wita_local_to_utc


def schema(name: str) -> dict:
    return json.loads((CONTRACTS / "json-schema" / f"{name}.schema.json").read_text())


def fixture(name: str) -> dict:
    return json.loads((CONTRACTS / "fixtures/synthetic" / f"{name}.json").read_text())


class SharedContractsTest(unittest.TestCase):
    def test_synthetic_observation_contract(self):
        Draft202012Validator(schema("create-request"), format_checker=FormatChecker()).validate(
            fixture("observation-create")
        )

    def test_synthetic_stale_source_contract(self):
        sample = fixture("source-sample")
        Draft202012Validator(schema("source-sample"), format_checker=FormatChecker()).validate(sample)
        self.assertIsNone(sample["value"])
        self.assertEqual(sample["quality_flags"], ["stale"])

    def test_pci_above_one_and_vertical_unknown_are_preserved(self):
        observation = fixture("observation-create")
        Draft202012Validator(schema("create-request"), format_checker=FormatChecker()).validate(observation)
        self.assertEqual(observation["overall_pci"], 1.24)
        self.assertIsNone(observation["vertical"]["intensity"])

    def test_client_cannot_set_training_eligibility(self):
        observation = fixture("observation-create")
        observation["train_eligible"] = True
        errors = list(Draft202012Validator(schema("create-request")).iter_errors(observation))
        self.assertTrue(errors)

    def test_wita_conversion_and_date_grouping_match_shared_vectors(self):
        cases = json.loads((CONTRACTS / "fixtures/synthetic/time-cases.json").read_text())
        for case in cases:
            self.assertEqual(wita_local_to_utc(case["local"]), case["utc"])
            self.assertEqual(wita_date(case["utc"]).isoformat(), case["wita_date"])

    def test_units_enum_and_legacy_revision_contract(self):
        sample = fixture("source-sample")
        self.assertEqual(sample["unit"], "m/s")
        core = fixture("core")
        legacy = core["cases"][-1]
        self.assertEqual(legacy["label_scope"], "legacy_unspecified")
        self.assertFalse(legacy["train_eligible"])
        self.assertEqual(core["cases"][3]["error_code"], "revision_conflict")
        sample["unit"] = "knots"
        self.assertTrue(list(Draft202012Validator(schema("source-sample")).iter_errors(sample)))

    def test_all_schema_documents_are_valid(self):
        for path in (CONTRACTS / "json-schema").glob("*.schema.json"):
            Draft202012Validator.check_schema(json.loads(path.read_text()))


if __name__ == "__main__":
    unittest.main()
