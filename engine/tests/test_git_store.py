import base64
import unittest
from urllib.parse import urlparse, unquote, parse_qs
from bunaken_engine.git_store import GitDataStore, StorageError

RUN="11111111-1111-4111-8111-111111111111"
PATH=f"snapshots/2026-10-01/{RUN}/manifest.json"


class GitMock:
    def __init__(self,mode=None):
        self.head="0"*40; self.serial=0; self.versions={self.head:{}}; self.blobs={}; self.trees={};self.mode=mode;self.ref_calls=[]
    def sha(self):
        self.serial+=1
        return f"{self.serial:040x}"
    def request(self,method,path,body):
        if path=="/git/ref/heads/data":return dict(object=dict(sha=self.head))
        if path.startswith("/contents/"):
            parsed=urlparse(path); filename=unquote(parsed.path.removeprefix("/contents/")); head=parse_qs(parsed.query)["ref"][0];raw=self.versions[head].get(filename)
            children=[dict(type="file",path=name) for name in self.versions[head] if name.startswith(filename+"/")]
            if children: return dict(entries=children)
            return None if raw is None else dict(content=base64.b64encode(raw).decode(),encoding="base64")
        if path.startswith("/commits?"): return [dict(commit=dict(committer=dict(date="2026-09-30T11:00:00Z")))]
        if method=="GET" and path.startswith("/git/commits/"):return dict(tree=dict(sha=path.rsplit("/",1)[1]),committer=dict(date="2026-09-30T11:00:00Z"))
        if path=="/git/blobs":
            sha=self.sha();self.blobs[sha]=base64.b64decode(body["content"]);return dict(sha=sha)
        if path=="/git/trees":
            sha=self.sha();tree=dict(self.versions[body["base_tree"]])
            tree.update({entry["path"]:self.blobs[entry["sha"]] for entry in body["tree"]});self.trees[sha]=tree;return dict(sha=sha)
        if path=="/git/commits":
            sha=self.sha();self.versions[sha]=self.trees[body["tree"]];return dict(sha=sha)
        if path=="/git/refs/heads/data":
            self.ref_calls.append(body)
            if self.mode=="race":
                self.mode=None;sha=self.sha();self.versions[sha]={**self.versions[self.head],"observations/unrelated.json":b"kept"};self.head=sha
                raise StorageError("branch_conflict")
            self.head=body["sha"]
            if self.mode=="timeout":self.mode=None;raise StorageError("github_unavailable")
            return {}
        raise AssertionError((method,path))


class GitStoreTest(unittest.TestCase):
    def test_snapshot_files_commit_together_and_retry_is_immutable(self):
        mock=GitMock();store=GitDataStore("synthetic","synthetic","synthetic",requester=mock.request)
        files={PATH:b"{}",PATH.replace("manifest.json","features.json.gz"):b"compressed"}
        sha=store.insert(files)
        self.assertEqual(mock.versions[sha],files)
        self.assertEqual(store.insert(files),sha)
        self.assertEqual(len(mock.ref_calls),1)
        self.assertFalse(mock.ref_calls[0]["force"])
        with self.assertRaises(StorageError):store.insert({PATH:b"changed"})
        with self.assertRaises(StorageError):store.insert({".env":b"secret"})

    def test_unrelated_branch_race_rebuilds_on_new_head(self):
        mock=GitMock("race");store=GitDataStore("synthetic","synthetic","synthetic",requester=mock.request)
        sha=store.insert({PATH:b"{}"})
        self.assertEqual(mock.versions[sha][PATH],b"{}")
        self.assertEqual(mock.versions[sha]["observations/unrelated.json"],b"kept")
        self.assertEqual(len(mock.ref_calls),2)

    def test_lost_ref_response_is_verified_before_success(self):
        mock=GitMock("timeout");store=GitDataStore("synthetic","synthetic","synthetic",requester=mock.request)
        sha=store.insert({PATH:b"{}"})
        self.assertEqual(mock.versions[sha][PATH],b"{}")
        self.assertEqual(len(mock.ref_calls),1)


    def test_receipt_index_bounds_dates_instead_of_scanning_all_history(self):
        import json
        mock=GitMock();store=GitDataStore("synthetic","synthetic","synthetic",requester=mock.request)
        files={f"snapshot-receipt-index/{day}/{RUN}.json":json.dumps(dict(day=day)).encode() for day in ["2026-01-01","2026-09-30","2026-10-01"]}
        head=store.insert(files)
        self.assertEqual(store.receipts(head,"2026-10-01"),[dict(day="2026-10-01"),dict(day="2026-09-30")])

    def test_publish_receipt_replay_and_artifact_verification(self):
        from unittest.mock import patch
        from bunaken_engine.pipeline import collect_run,publish_bundle,verified_receipt
        from bunaken_engine.snapshots import SnapshotError
        mock=GitMock();store=GitDataStore("synthetic","synthetic","synthetic",requester=mock.request)
        manifest,files=collect_run("2026-10-01","a"*40,days=1,run_id=RUN)
        with patch("bunaken_engine.pipeline.utc_now",return_value="2026-09-30T11:01:00Z"):
            receipt=publish_bundle(store,manifest,files)
        self.assertEqual(len(mock.ref_calls),3)
        self.assertEqual(publish_bundle(store,manifest,files),receipt)
        verified=verified_receipt(store,receipt,store.head())
        self.assertTrue(verified["storage_verified"])
        self.assertEqual(store.receipts(store.head(),"2026-10-01"),[receipt])
        artifact=next(path for path in files if path.endswith("features.json.gz"))
        mock.versions[receipt["storage_commit"]][artifact]=b"tampered"
        with self.assertRaises(SnapshotError):verified_receipt(store,receipt,store.head())


    def test_large_contents_response_reads_only_validated_git_blob(self):
        content=b"x"*1_048_577
        calls=[]
        def requester(method,path,body):
            calls.append(path)
            if path.startswith("/contents/"):return dict(encoding="none",sha="a"*40,size=len(content))
            self.assertEqual(path,"/git/blobs/"+"a"*40)
            return dict(encoding="base64",content=base64.b64encode(content).decode())
        store=GitDataStore("synthetic","synthetic","synthetic",requester=requester)
        self.assertEqual(store.read(PATH,"b"*40),content)
        self.assertEqual(len(calls),2)

    def test_delayed_receipt_ref_uses_confirmation_time_after_cutoff(self):
        from unittest.mock import patch
        from bunaken_engine.pipeline import collect_run,publish_bundle,verified_receipt
        mock=GitMock();store=GitDataStore("synthetic","synthetic","synthetic",requester=mock.request)
        manifest,files=collect_run("2026-10-01","a"*40,days=1,run_id=RUN)
        with patch("bunaken_engine.pipeline.utc_now",side_effect=["2026-09-30T11:59:59Z","2026-09-30T12:00:05Z"]):
            receipt=publish_bundle(store,manifest,files)
        self.assertEqual(verified_receipt(store,receipt,store.head())["persisted_at"],"2026-09-30T12:00:05Z")

    def test_revision_history_read_does_not_widen_write_allowlist(self):
        content=b'{"revision":1}'
        requester=lambda method,path,body: dict(encoding='base64',content=base64.b64encode(content).decode())
        store=GitDataStore('synthetic','synthetic','synthetic',requester=requester)
        path='observations/11111111-1111-4111-8111-111111111111/revisions/000001.json'
        self.assertEqual(store.read_observation_revision(path,'a'*40),content)
        for bad in ('observations/../.env','observations/11111111-1111-4111-8111-111111111111/current.json'):
            with self.assertRaises(StorageError):store.read_observation_revision(bad,'a'*40)
        with self.assertRaises(StorageError):store.insert({path:content})
