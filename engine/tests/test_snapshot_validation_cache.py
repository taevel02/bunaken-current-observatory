import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from jsonschema import ValidationError
from bunaken_engine.snapshots import schema_validator, validate


class SnapshotValidationCacheTest(unittest.TestCase):
    def test_repeated_large_document_validation_checks_content_and_schema_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            schemas = root/'packages/contracts/json-schema'
            schemas.mkdir(parents=True)
            path = schemas/'model-context.schema.json'
            schema = {'$schema':'https://json-schema.org/draft/2020-12/schema',
                      '$id':'https://synthetic.test/model-context.schema.json',
                      'type':'object','required':['value'],'properties':{'value':{'type':'number'}}}
            path.write_text(json.dumps(schema))
            fingerprint = ((path,path.stat().st_mtime_ns,path.stat().st_size),)
            validator = Mock(wraps=schema_validator('model-context',fingerprint))
            with patch('bunaken_engine.snapshots.schema_validator',return_value=validator):
                document = {'value':1}
                validate('model-context',document,root)
                validate('model-context',dict(document),root)
                self.assertEqual(validator.validate.call_count,1)
                document['value'] = 'tampered'
                for _ in range(2):
                    with self.assertRaises(ValidationError):
                        validate('model-context',document,root)
                self.assertEqual(validator.validate.call_count,3)
            schema['required'].append('new_field')
            path.write_text(json.dumps(schema))
            with self.assertRaises(ValidationError):
                validate('model-context',{'value':1},root)
