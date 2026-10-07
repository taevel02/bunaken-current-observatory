from io import BytesIO
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from bunaken_engine.git_store import GitDataStore, StorageError


class GitProviderErrorsTest(unittest.TestCase):
    def test_validation_is_only_a_branch_race_at_the_ref_update_boundary(self):
        store = GitDataStore('synthetic', 'synthetic', 'synthetic')
        for method, path, expected in [
            ('PATCH', '/git/refs/heads/data', 'branch_conflict'),
            ('POST', '/git/blobs', 'github_blob_validation_failed'),
            ('POST', '/git/trees', 'github_tree_validation_failed'),
            ('POST', '/git/commits', 'github_commit_validation_failed'),
            ('GET', '/git/blobs/' + 'a' * 40, 'github_validation_failed'),
        ]:
            with self.subTest(method=method, path=path):
                error = HTTPError('https://synthetic.invalid', 422, 'validation', {}, BytesIO(b'private provider body'))
                with patch('bunaken_engine.git_store.urlopen', side_effect=error):
                    with self.assertRaisesRegex(StorageError, '^' + expected + '$'):
                        store.request(method, path)
