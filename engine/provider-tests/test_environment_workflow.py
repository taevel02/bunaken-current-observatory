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
        self.assertEqual(prepare['if'],"env.OPERATION == 'collect' && env.RESUME_RUN_ID == ''")
        self.assertEqual(prepare['env']['GITHUB_WRITE_TOKEN'],'${{ secrets.DATA_WRITE_TOKEN }}')
        self.assertIn('fes_cache fetch',prepare['run'])
        self.assertIn('FES_DERIVED_ROOT=',prepare['run'])
        self.assertIn('$GITHUB_ENV',prepare['run'])
        for step in steps:
            if 'uses' in step:
                self.assertRegex(step['uses'],r'@[0-9a-f]{40}$')
                if step['uses'].startswith('actions/cache/'):
                    self.assertEqual(step['with']['path'],'${{ env.GIT_DATA_CACHE_ROOT }}/blobs')
                    self.assertTrue(step['with']['key'].startswith('bunaken-public-blobs-v1-'))
                else:
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
        template = yaml.load((root/'ops/workflows/data-entrypoint.yml').read_text(),Loader=yaml.BaseLoader)
        pin = template['jobs']['environment']['with']['code_commit']
        self.assertRegex(pin, r'^[0-9a-f]{40}$')
        self.assertEqual(job['env']['CODE_COMMIT'], "${{ inputs.code_commit || '" + pin + "' }}")
        self.assertTrue(template['jobs']['environment']['uses'].endswith('@' + pin))
        self.assertIn("github.event.schedule == '17 12 * * *'",job['env']['OPERATION'])
        prepare = next(step for step in job['steps'] if step.get('name') == 'Fetch verified tidal ephemeris')
        self.assertNotIn('fes_atlas', prepare['run'])
        self.assertNotIn('AVISO_PASSWORD', str(job))
        self.assertLess(job['steps'].index(prepare),next(i for i,step in enumerate(job['steps']) if step.get('name') == 'Collect or seal in one chain'))
        chain = next(step['run'] for step in job['steps'] if step.get('name') == 'Collect or seal in one chain')
        self.assertIn('TZ=Asia/Makassar date -d tomorrow',chain)
        self.assertIn('--model-from-data',chain)
        publish = next(step for step in job['steps'] if step.get('name') == 'Publish validated web release')
        self.assertIn('bunaken_engine.public_release',publish['run'])
        self.assertEqual(publish['if'], "env.OPERATION == 'collect'")
        self.assertGreater(int(job['timeout-minutes']), 180)
        self.assertIn('SNAPSHOT_RUN_ID=$SNAPSHOT_RUN_ID',chain)
        match = next(step for step in job['steps'] if step.get('name') == 'Match official D+1 observations')
        self.assertIn('bunaken_engine.d1_matching', match['run'])
        self.assertEqual(job['env']['GIT_DATA_CACHE_ROOT'],'${{ runner.temp }}/bunaken-git-data-cache')
        restore = next(step for step in job['steps'] if step.get('name') == 'Restore public Git blob cache')
        save = next(step for step in job['steps'] if step.get('name') == 'Save public Git blob cache')
        self.assertLess(job['steps'].index(restore),job['steps'].index(prepare))
        self.assertEqual(save['if'],'always() && !cancelled()')
        self.assertEqual(restore['with']['key'],save['with']['key'])

    def test_web_visibility_is_required_after_publish_and_before_matching(self):
        import io
        import json
        from contextlib import redirect_stdout
        from unittest.mock import patch
        root = Path(__file__).resolve().parents[2]
        data = yaml.load((root/'.github/workflows/environment.yml').read_text(),Loader=yaml.BaseLoader)
        steps = data['jobs']['environment']['steps']
        names = [step.get('name') for step in steps]
        verify = steps[names.index('Verify Vercel release visibility')]
        self.assertEqual(verify['if'], "env.OPERATION == 'collect'")
        self.assertLess(names.index('Publish validated web release'),names.index(verify['name']))
        self.assertLess(names.index(verify['name']),names.index('Match official D+1 observations'))
        script = verify['run'].split('\n',1)[1].rsplit('\nPY',1)[0]
        def response(release):
            return io.BytesIO(json.dumps(dict(release_id=release)).encode())
        with patch.dict(os.environ, RUNNER_TEMP='/tmp/synthetic'), patch.object(Path,'read_text',return_value='{"release_id":"expected"}'), patch('time.sleep') as sleep, redirect_stdout(io.StringIO()) as output:
            with patch('urllib.request.urlopen',side_effect=[OSError('offline'),response('old'),response('expected')]) as fetch:
                exec(compile(script,'vercel-visibility','exec'),{})
            self.assertEqual(fetch.call_count,3)
            self.assertEqual(sleep.call_count,2)
            self.assertTrue(json.loads(output.getvalue())['vercel_release_visible'])
            with patch('urllib.request.urlopen',side_effect=lambda *args,**kwargs:response('old')) as fetch:
                with self.assertRaisesRegex(SystemExit,'vercel_release_not_visible'):
                    exec(compile(script,'vercel-visibility','exec'),{})
            self.assertEqual(fetch.call_count,24)

    def test_invocation_rejects_preview_tags_and_invalid_inputs(self):
        root = Path(__file__).resolve().parents[2]
        data = yaml.load((root/'.github/workflows/environment.yml').read_text(),Loader=yaml.BaseLoader)
        script = next(step['run'] for step in data['jobs']['environment']['steps'] if step.get('name') == 'Validate trusted invocation')
        def accepted(**updates):
            env = dict(os.environ,CODE_COMMIT='a'*40,TARGET_DATE='',RESUME_RUN_ID='',OPERATION='collect',EVENT='workflow_dispatch',EVENT_REF='refs/heads/main')
            env.update(updates)
            return subprocess.run(['bash','-e','-c',script],env=env,capture_output=True).returncode == 0
        self.assertTrue(accepted())
        self.assertTrue(accepted(EVENT='push',EVENT_REF='refs/heads/data'))
        self.assertTrue(accepted(EVENT='schedule',OPERATION='seal'))
        run_id = '11111111-1111-4111-8111-111111111111'
        self.assertTrue(accepted(RESUME_RUN_ID=run_id,TARGET_DATE='2026-10-08'))
        self.assertFalse(accepted(RESUME_RUN_ID=run_id))
        self.assertFalse(accepted(RESUME_RUN_ID='../manifest.json',TARGET_DATE='2026-10-08'))
        self.assertFalse(accepted(RESUME_RUN_ID=run_id,TARGET_DATE='2026-10-08',OPERATION='seal'))
        self.assertFalse(accepted(EVENT='pull_request',EVENT_REF='refs/pull/1/merge'))
        self.assertFalse(accepted(EVENT_REF='refs/heads/preview'))
        self.assertFalse(accepted(EVENT_REF='refs/tags/release'))
        self.assertFalse(accepted(EVENT='schedule',EVENT_REF='refs/heads/data'))
        self.assertFalse(accepted(CODE_COMMIT='main'))
        self.assertFalse(accepted(OPERATION='delete'))
        self.assertFalse(accepted(TARGET_DATE='2026-10-06; echo injected'))
        self.assertFalse(accepted(OPERATION='seal'))
