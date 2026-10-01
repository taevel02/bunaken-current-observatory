from pathlib import Path
import unittest

import yaml


class EnvironmentWorkflowTest(unittest.TestCase):
    def test_private_atlas_preparation_uses_protected_secrets_and_no_public_cache(self):
        root = Path(__file__).resolve().parents[2]
        data = yaml.load((root/'.github/workflows/environment.yml').read_text(),Loader=yaml.BaseLoader)
        job = data['jobs']['environment']
        self.assertEqual(job['environment'],'environmental-data')
        self.assertEqual(data['permissions'],{'contents':'read'})
        steps = job['steps']
        prepare = next(step for step in steps if step.get('name') == 'Prepare private FES atlas')
        self.assertEqual(prepare['if'],"inputs.operation == 'collect'")
        self.assertEqual(prepare['env']['AVISO_USERNAME'],'${{ secrets.AVISO_USERNAME }}')
        self.assertEqual(prepare['env']['AVISO_PASSWORD'],'${{ secrets.AVISO_PASSWORD }}')
        self.assertIn('--extra providers --locked',prepare['run'])
        self.assertIn('FES_ATLAS_UNIT=cm',prepare['run'])
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
