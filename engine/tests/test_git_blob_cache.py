import base64
from hashlib import sha1
from pathlib import Path
import tempfile
import unittest

from bunaken_engine.git_store import GitDataStore, StorageError

PATH='snapshot-receipts/11111111-1111-4111-8111-111111111111.json'


def blob_id(raw):
    return sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()


class GitBlobCacheTest(unittest.TestCase):
    def test_cache_survives_processes_and_head_changes_without_stale_branch_reads(self):
        with tempfile.TemporaryDirectory() as directory:
            first,second=b'{"revision":1}',b'{"revision":2}'
            contents={blob_id(first):first,blob_id(second):second}
            calls=[]
            def requester(method,path,body):
                calls.append(path)
                if path=='/git/ref/heads/data':return {'object':{'sha':head[0]}}
                if path.startswith('/git/commits/'):return {'tree':{'sha':path.rsplit('/',1)[1]},'committer':{'date':'2026-10-11T10:00:00Z'}}
                if path.startswith('/commits?'):return [{'commit':{'committer':{'date':'2026-10-11T10:00:00Z'}}}]
                if path.startswith('/git/trees/'):
                    sha=blob_id(first if '/'+('a'*40)+'?' in path else second)
                    return {'truncated':False,'tree':[{'type':'blob','path':PATH,'sha':sha}]}
                if path.startswith('/git/blobs/'):
                    sha=path.rsplit('/',1)[1]
                    return {'encoding':'base64','content':base64.b64encode(contents[sha]).decode()}
                raise AssertionError(path)
            head=['a'*40]
            def store():return GitDataStore('synthetic','synthetic','synthetic',requester=requester,cache_root=directory)
            client=store();self.assertEqual(client.read(PATH,client.head()),first)
            self.assertEqual(store().read(PATH,'a'*40),first)
            self.assertEqual(calls.count('/git/blobs/'+blob_id(first)),1)
            for _ in range(2):
                self.assertEqual(client.commit_time('a'*40),'2026-10-11T10:00:00Z')
                self.assertEqual(client.path_commit_time(PATH,'a'*40),'2026-10-11T10:00:00Z')
            self.assertEqual(calls.count('/git/commits/'+('a'*40)),2)
            self.assertEqual(sum(path.startswith('/commits?') for path in calls),1)
            head[0]='b'*40
            self.assertEqual(client.read(PATH,client.head()),second)
            self.assertEqual(client.read(PATH,'a'*40),first)
            (Path(directory)/'blobs'/blob_id(first)).write_bytes(b'corrupt')
            self.assertEqual(store().read(PATH,'a'*40),first)
            self.assertEqual(calls.count('/git/blobs/'+blob_id(first)),2)
            with self.assertRaisesRegex(StorageError,'path_forbidden'):client.read('.env','a'*40)

    def test_blob_hash_mismatch_and_truncated_tree_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            def requester(method,path,body):
                if '/git/commits/' in path:return {'tree':{'sha':'a'*40}}
                if '/git/trees/' in path:return {'truncated':False,'tree':[{'type':'blob','path':PATH,'sha':'b'*40}]}
                return {'encoding':'base64','content':base64.b64encode(b'tampered').decode()}
            client=GitDataStore('synthetic','synthetic','synthetic',requester=requester,cache_root=directory)
            with self.assertRaisesRegex(StorageError,'blob_hash_mismatch'):client.read(PATH,'c'*40)
            self.assertEqual(list(Path(directory).rglob('*')),[])
            def truncated(method,path,body):
                return {'tree':{'sha':'a'*40}} if '/git/commits/' in path else {'truncated':True,'tree':[]}
            client=GitDataStore('synthetic','synthetic','synthetic',requester=truncated,cache_root=directory)
            with self.assertRaisesRegex(StorageError,'tree_truncated'):client.read(PATH,'c'*40)
