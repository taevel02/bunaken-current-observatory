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
            return None if raw is None else dict(content=base64.b64encode(raw).decode(),encoding="base64")
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
