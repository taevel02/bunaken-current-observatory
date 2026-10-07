import unittest
from unittest.mock import Mock, patch

from bunaken_engine.model_input import data_inputs
from bunaken_engine.snapshots import canonical


class ModelInputCutoffTest(unittest.TestCase):
    def test_future_only_snapshot_is_not_embedded_as_training_data(self):
        run = '11111111-1111-4111-8111-111111111111'
        path = f'snapshot-receipts/{run}.json'
        receipt = dict(schema_version='1.0', run_id=run, kind='snapshot', status='succeeded',
                       manifest_path=f'snapshots/2026-10-08/{run}/manifest.json',
                       manifest_sha256='b' * 64, storage_commit='c' * 40,
                       persisted_at='2026-10-07T10:00:00Z', valid_start='2026-10-07T16:00:00Z',
                       valid_end='2026-10-14T16:00:00Z')
        store = Mock()
        store.head.return_value = 'a' * 40
        store.request.side_effect = lambda method, url: (
            dict(tree=dict(sha='d' * 40)) if '/git/commits/' in url
            else dict(tree=[dict(type='blob', path=path)], truncated=False))
        def read(requested, head):
            self.assertEqual(requested, path, 'future-only training bundle must not be loaded')
            return canonical(receipt)
        store.read.side_effect = read
        verified = dict(receipt, storage_verified=True)
        with patch('bunaken_engine.model_input.verified_receipt', return_value=verified) as verify:
            head, observations, bundles = data_inputs(store, '2026-10-07T13:30:00Z')
        verify.assert_called_once()
        self.assertEqual(head, 'a' * 40)
        self.assertEqual(observations, [])
        self.assertEqual(bundles, [])
