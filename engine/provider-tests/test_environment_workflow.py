from pathlib import Path
import unittest
import os
import subprocess

import yaml


class EnvironmentWorkflowTest(unittest.TestCase):
    def test_private_atlas_preparation_uses_protected_secrets_and_no_public_cache(self):
        root = Path(__file__).resolve().parents[2]
        data = yaml.load((root/'.github/workflows/environment.yml').read_text(),Loader=yaml.BaseLoader)
        job = data['jobs']['environment']
        self.assertEqual(job['environment'],'environmental-data')
        self.assertEqual(data['permissions'],{'contents':'read'})
        steps = job['steps']
        prepare = next(step for step in steps if step.get('name') == 'Fetch verified tidal ephemeris')
        self.assertEqual(prepare['if'],"env.OPERATION == 'collect'")
        self.assertEqual(prepare['env']['GITHUB_WRITE_TOKEN'],'${{ secrets.DATA_WRITE_TOKEN }}')
        self.assertIn('fes_cache fetch',prepare['run'])
        self.assertIn('FES_DERIVED_ROOT=',prepare['run'])
        self.assertIn('$GITHUB_ENV',prepare['run'])
        for step in steps:
            if 'uses' in step:
                self.assertRegex(step['uses'],r'@[0-9a-f]{40}$')
                self.assertNotIn('cache',step['uses'])
                self.assertNotIn('upload-artifact',step['uses'])
        entry = yaml.load((root/'ops/workflows/data-entrypoint.yml').read_text(),Loader=yaml.BaseLoader)
        invocation = entry['jobs']['environment']
        self.assertRegex(invocation['with']['code_commit'],r'^[0-9a-f]{40}$')
        self.assertEqual(invocation['uses'].rsplit('@',1)[1],invocation['with']['code_commit'])
        declared = data['on']['workflow_call']['secrets']
        self.assertTrue(set(invocation['secrets']).issubset(declared))
        self.assertTrue(all(not name.startswith('GITHUB_') for name in declared))
        self.assertEqual(invocation['secrets']['DATA_WRITE_TOKEN'], '${{ secrets.DATA_WRITE_TOKEN }}')
        self.assertEqual(invocation['secrets']['COPERNICUSMARINE_SERVICE_PASSWORD'],
                         '${{ secrets.COPERNICUSMARINE_SERVICE_PASSWORD || secrets.COPERNICUSMARINE__SERVICE_PASSWORD }}')
        for name, specification in declared.items():
            if specification['required'] == 'true':
                self.assertIn(name, invocation['secrets'])

    def test_schedule_serializes_collection_without_delaying_seal(self):
        root = Path(__file__).resolve().parents[2]
        data = yaml.load((root/'.github/workflows/environment.yml').read_text(),Loader=yaml.BaseLoader)
        self.assertEqual([entry['cron'] for entry in data['on']['schedule']],['17 23,11 * * *','17 12 * * *'])
        job = data['jobs']['environment']
        self.assertEqual(job['concurrency']['cancel-in-progress'],'false')
        self.assertIn("'seal'",job['concurrency']['group'])
        self.assertEqual(job['env']['CODE_COMMIT'],'${{ inputs.code_commit || github.sha }}')
        self.assertIn("github.event.schedule == '17 12 * * *'",job['env']['OPERATION'])
        prepare = next(step for step in job['steps'] if step.get('name') == 'Fetch verified tidal ephemeris')
        self.assertNotIn('fes_atlas', prepare['run'])
        self.assertNotIn('AVISO_PASSWORD', str(job))
        self.assertLess(job['steps'].index(prepare),next(i for i,step in enumerate(job['steps']) if step.get('name') == 'Collect or seal in one chain'))
        chain = job['steps'][-1]['run']
        self.assertIn('TZ=Asia/Makassar date -d tomorrow',chain)
        self.assertIn('--model-from-data',chain)
        self.assertIn('bunaken_engine.public_release',chain)

    def test_invocation_rejects_preview_tags_and_invalid_inputs(self):
        root = Path(__file__).resolve().parents[2]
        data = yaml.load((root/'.github/workflows/environment.yml').read_text(),Loader=yaml.BaseLoader)
        script = next(step['run'] for step in data['jobs']['environment']['steps'] if step.get('name') == 'Validate trusted invocation')
        def accepted(**updates):
            env = dict(os.environ,CODE_COMMIT='a'*40,TARGET_DATE='',OPERATION='collect',EVENT='workflow_dispatch',EVENT_REF='refs/heads/main')
            env.update(updates)
            return subprocess.run(['bash','-e','-c',script],env=env,capture_output=True).returncode == 0
        self.assertTrue(accepted())
        self.assertTrue(accepted(EVENT='push',EVENT_REF='refs/heads/data'))
        self.assertTrue(accepted(EVENT='schedule',OPERATION='seal'))
        self.assertFalse(accepted(EVENT='pull_request',EVENT_REF='refs/pull/1/merge'))
        self.assertFalse(accepted(EVENT_REF='refs/heads/preview'))
        self.assertFalse(accepted(EVENT_REF='refs/tags/release'))
        self.assertFalse(accepted(EVENT='schedule',EVENT_REF='refs/heads/data'))
        self.assertFalse(accepted(CODE_COMMIT='main'))
        self.assertFalse(accepted(OPERATION='delete'))
        self.assertFalse(accepted(TARGET_DATE='2026-10-06; echo injected'))
        self.assertFalse(accepted(OPERATION='seal'))
