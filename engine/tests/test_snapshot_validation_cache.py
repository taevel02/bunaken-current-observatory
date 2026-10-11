import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from jsonschema import ValidationError
from jsonschema import Draft202012Validator
from bunaken_engine.snapshots import schema_validator, validate
from bunaken_engine import snapshots


class SnapshotValidationCacheTest(unittest.TestCase):
    def setUp(self):
        snapshots._validated_documents.clear()

    def test_identical_schemas_in_replay_roots_share_success_without_revalidation(self):
        with tempfile.TemporaryDirectory() as directory:
            roots = [Path(directory)/name for name in ('original','replay')]
            schema = {'$schema':'https://json-schema.org/draft/2020-12/schema',
                      '$id':'https://synthetic.test/model-context.schema.json',
                      'type':'object','properties':{'value':{'type':'number'}}}
            for root in roots:
                path = root/'packages/contracts/json-schema/model-context.schema.json'
                path.parent.mkdir(parents=True)
                path.write_text(json.dumps(schema))
            path = roots[0]/'packages/contracts/json-schema/model-context.schema.json'
            validator = Mock(wraps=schema_validator('model-context',((path,path.stat().st_mtime_ns,path.stat().st_size),)))
            with patch('bunaken_engine.snapshots.schema_validator',return_value=validator):
                for root in roots:
                    validate('model-context',{'value':7},root)
                self.assertEqual(validator.validate.call_count,1)

    def test_changed_context_reuses_unchanged_references_but_rejects_nested_tampering(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            schemas=root/'packages/contracts/json-schema';schemas.mkdir(parents=True)
            child={'$schema':'https://json-schema.org/draft/2020-12/schema',
                   '$id':'https://synthetic.test/snapshot.schema.json','type':'object',
                   'required':['value'],'additionalProperties':False,
                   'properties':{'value':{'type':'number','minimum':0}}}
            parent={'$schema':child['$schema'],'$id':'https://synthetic.test/model-context.schema.json',
                    'type':'object','properties':{'marker':{'type':'number'},'bundles':{'type':'array','items':{'$ref':'snapshot.schema.json'}}}}
            (schemas/'snapshot.schema.json').write_text(json.dumps(child))
            (schemas/'model-context.schema.json').write_text(json.dumps(parent))
            original=Draft202012Validator.VALIDATORS['minimum']
            calls=[]
            def counted(validator,limit,value,schema):
                calls.append(value)
                yield from original(validator,limit,value,schema)
            with patch.dict(Draft202012Validator.VALIDATORS,minimum=counted):
                validate('model-context',{'marker':1,'bundles':[{'value':7}]},root)
                validate('model-context',{'marker':2,'bundles':[{'value':7}]},root)
                self.assertEqual(calls,[7])
                with self.assertRaises(ValidationError):
                    validate('model-context',{'marker':3,'bundles':[{'value':-1}]},root)
                with self.assertRaises(ValidationError):
                    validate('model-context',{'marker':3,'bundles':[{'value':7,'private_note':'forbidden'}]},root)

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
