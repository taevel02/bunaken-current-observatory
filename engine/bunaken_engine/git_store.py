"""Git Data API: immutable path allowlist, optimistic non-force commits, no local DB."""
import base64
import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from bunaken_engine.snapshots import allowed_data_path


class StorageError(Exception):
    pass


class GitDataStore:
    def __init__(self, owner: str, repo: str, token: str, *, requester=None):
        if not re.fullmatch(r"[A-Za-z0-9_.-]+",owner) or not re.fullmatch(r"[A-Za-z0-9_.-]+",repo) or not token:
            raise StorageError("storage_unconfigured")
        self.base=f"https://api.github.com/repos/{owner}/{repo}"
        self.token=token
        self.requester=requester

    def request(self,method,path,body=None):
        if self.requester:
            return self.requester(method,path,body)
        payload=None if body is None else json.dumps(body).encode()
        req=Request(self.base+path,data=payload,method=method,headers={"Authorization":f"Bearer {self.token}","Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"})
        try:
            with urlopen(req,timeout=30) as response:
                return json.load(response)
        except HTTPError as error:
            code=error.code
            error.close()
            if code==404:
                return None
            if code in {409,422}:
                raise StorageError("branch_conflict") from None
            raise StorageError("github_unavailable") from None
        except (URLError,TimeoutError,ValueError):
            raise StorageError("github_unavailable") from None

    def head(self):
        result=self.request("GET","/git/ref/heads/data")
        if not result:
            raise StorageError("data_branch_missing")
        return result["object"]["sha"]

    def read(self,path,ref):
        if not allowed_data_path(path):
            raise StorageError("path_forbidden")
        result=self.request("GET",f"/contents/{quote(path,safe='/')}?ref={quote(ref,safe='')}")
        if result is None:
            return None
        if result.get("encoding")!="base64":
            raise StorageError("unsupported_content_encoding")
        return base64.b64decode(result["content"])

    def insert(self,files: dict[str,bytes],message="store immutable environment artifacts") -> str:
        if not files or any(not allowed_data_path(path) for path in files):
            raise StorageError("path_forbidden")
        for _ in range(3):
            head=self.head()
            missing={}
            for path,content in files.items():
                current=self.read(path,head)
                if current is not None and current!=content:
                    raise StorageError("immutable_conflict")
                if current is None:
                    missing[path]=content
            if not missing:
                return head
            entries=[]
            for path,content in missing.items():
                blob=self.request("POST","/git/blobs",dict(content=base64.b64encode(content).decode(),encoding="base64"))
                entries.append(dict(path=path,mode="100644",type="blob",sha=blob["sha"]))
            parent=self.request("GET",f"/git/commits/{head}")
            tree=self.request("POST","/git/trees",dict(base_tree=parent["tree"]["sha"],tree=entries))
            commit=self.request("POST","/git/commits",dict(message=message,tree=tree["sha"],parents=[head]))
            try:
                self.request("PATCH","/git/refs/heads/data",dict(sha=commit["sha"],force=False))
            except StorageError as error:
                if str(error) not in {"branch_conflict","github_unavailable"}:
                    raise
            # Ref update may time out after success. Read actual branch content before retry.
            verified=self.head()
            if all(self.read(path,verified)==content for path,content in files.items()):
                return verified
            if verified==head:
                raise StorageError("github_unavailable")
        raise StorageError("branch_conflict")

    def commit_time(self,sha):
        commit=self.request("GET",f"/git/commits/{quote(sha,safe='')}")
        if not commit:
            raise StorageError("storage_commit_missing")
        return commit["committer"]["date"]

    def path_commit_time(self,path,head):
        commits=self.request("GET",f"/commits?sha={quote(head,safe='')}&path={quote(path,safe='')}&per_page=1")
        if not commits:
            raise StorageError("storage_commit_missing")
        return commits[0]["commit"]["committer"]["date"]

    def receipts(self,head):
        commit=self.request("GET",f"/git/commits/{head}")
        root=self.request("GET",f"/git/trees/{commit['tree']['sha']}")
        entry=next((item for item in root["tree"] if item["path"]=="snapshot-receipts" and item["type"]=="tree"),None)
        if entry is None:
            return []
        tree=self.request("GET",f"/git/trees/{entry['sha']}")
        if tree.get("truncated"):
            raise StorageError("receipt_index_required")
        result=[]
        for item in tree["tree"]:
            path="snapshot-receipts/"+item["path"]
            if item["type"]!="blob" or not allowed_data_path(path):
                raise StorageError("receipt_tree_invalid")
            result.append(json.loads(self.read(path,head)))
        return result
