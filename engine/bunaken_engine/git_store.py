"""Git Data API: immutable path allowlist, optimistic non-force commits, no local DB."""
from io import BytesIO
import base64
import json
import re
from datetime import date, timedelta
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
        req=Request(self.base+path,data=payload,method=method,headers={"Authorization":f"Bearer {self.token}","Accept":"application/vnd.github.object+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"})
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
        return self._read_content(path,ref)

    def read_observation_revision(self,path,ref):
        if not re.fullmatch(r'observations/[0-9a-f-]{36}/revisions/[0-9]{6}\.json',path):
            raise StorageError('path_forbidden')
        return self._read_content(path,ref)

    def _read_content(self,path,ref):
        result=self.request("GET",f"/contents/{quote(path,safe='/')}?ref={quote(ref,safe='')}")
        if result is None:
            return None
        if result.get("encoding")=="none":
            sha=result.get("sha","")
            if not re.fullmatch(r"[0-9a-f]{40}",sha):
                raise StorageError("invalid_blob_identity")
            result=self.request("GET",f"/git/blobs/{sha}")
        if not result or result.get("encoding")!="base64":
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

    def receipts(self,head,target_date=None):
        if target_date is not None:
            target=date.fromisoformat(target_date)
            result=[]
            # Collection horizons are capped at 14 days. Earlier runs cannot cover this day.
            for offset in range(14):
                day=(target-timedelta(days=offset)).isoformat()
                listing=self.request("GET",f"/contents/snapshot-receipt-index/{day}?ref={quote(head,safe='')}")
                if listing is None:
                    continue
                if isinstance(listing,dict):
                    listing=listing.get("entries")
                if not isinstance(listing,list) or len(listing)>=1000:
                    raise StorageError("receipt_index_required")
                for item in listing:
                    path=item.get("path","")
                    if item.get("type")!="file" or not allowed_data_path(path):
                        raise StorageError("receipt_tree_invalid")
                    result.append(json.loads(self.read(path,head)))
            return result
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

    def publish_release(self, files, expected_head):
        """One non-force commit, with validated immutable files and latest pointer."""
        from bunaken_engine.snapshots import digest, validate
        pointer = json.loads(files['web/latest.json'])
        validate('latest',pointer)
        prefix = f"web/releases/{pointer['release_id']}"
        if set(files) != {'web/latest.json',prefix+'/manifest.json',prefix+'/dashboard.json.gz'}:
            raise StorageError('release_paths_invalid')
        manifest = json.loads(files[prefix+'/manifest.json'])
        import gzip
        compressed=files[prefix+'/dashboard.json.gz']
        if len(compressed)>1_250_000:raise StorageError('release_size_exceeded')
        with gzip.GzipFile(fileobj=BytesIO(compressed)) as stream:
            raw=stream.read(10_000_001)
        if len(raw)>10_000_000:raise StorageError('release_size_exceeded')
        payload = json.loads(raw)
        validate('release',manifest)
        from bunaken_engine.public_release import validate_payload
        validate_payload(payload)
        if manifest['release_id'] != pointer['release_id'] or manifest['source_data_commit_sha'] != expected_head or manifest['status'] != 'published' or manifest['schema_version'] not in {'1.1','1.2'} or pointer['manifest_sha256'] != digest(files[prefix+'/manifest.json']) or manifest['files'] != [dict(path='dashboard.json.gz',sha256=digest(files[prefix+'/dashboard.json.gz']))]:
            raise StorageError('release_integrity_invalid')
        if payload.get('experimental_transfer'):
            import subprocess
            from bunaken_engine.registry import ROOT
            actual=subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip()
            dirty=subprocess.run(['git','status','--porcelain'],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip()
            if actual != payload['experimental_transfer']['code_commit'] or dirty:
                raise StorageError('release_transfer_code_mismatch')
        head = self.head()
        if all(self.read(path,head) == content for path,content in files.items()):
            return head
        if head != expected_head:
            raise StorageError('branch_conflict')
        # Verify snapshot and current revisions really belong to the declared source head.
        from datetime import datetime
        from zoneinfo import ZoneInfo
        from bunaken_engine.snapshots import make_bundle
        import gzip
        if not manifest['snapshot_ids'] and (payload['predictions'] or payload['tides'] or payload.get('environment_samples') or payload.get('experimental_transfer',{}).get('predictions')):
            raise StorageError('release_source_mismatch')
        if len(manifest['snapshot_ids']) > 1:
            raise StorageError('release_source_mismatch')
        for snapshot_id in manifest['snapshot_ids']:
            day=datetime.fromisoformat(payload['valid_start'].replace('Z','+00:00')).astimezone(ZoneInfo('Asia/Makassar')).date().isoformat()
            snapshot_prefix=f'snapshots/{day}/{snapshot_id}'
            snapshot=json.loads(self.read(snapshot_prefix+'/manifest.json',head))
            features=json.loads(gzip.decompress(self.read(snapshot_prefix+'/features.json.gz',head)))
            forecasts=json.loads(gzip.decompress(self.read(snapshot_prefix+'/forecast.json.gz',head)))
            from bunaken_engine.registry import load_geometry
            from bunaken_engine.snapshots import canonical
            if snapshot['geometry_hash'] != digest(canonical(load_geometry())):
                raise StorageError('release_geometry_mismatch')
            make_bundle(snapshot,features,forecasts)
            from bunaken_engine.public_release import public_samples, public_source_metadata
            tides, environment_samples=public_samples(snapshot['samples'])
            if payload['schema_version'] in {'1.1','1.2'} and (environment_samples!=payload['environment_samples'] or payload['sources']!=public_source_metadata(snapshot['source_status'])):
                raise StorageError('release_source_mismatch')
            if snapshot['snapshot_id'] != snapshot_id or forecasts != payload['predictions'] or tides != payload['tides'] or payload['source_generated_at'] != snapshot['created_at'] or payload['valid_start'] != snapshot['valid_start'] or payload['valid_end'] != snapshot['valid_end']:
                raise StorageError('release_source_mismatch')
            if payload.get('experimental_transfer'):
                from bunaken_engine.transfer import transfer_forecast
                if transfer_forecast(snapshot.get('model_context'),features,snapshot,payload['experimental_transfer']['code_commit']) != payload['experimental_transfer']:
                    raise StorageError('release_transfer_reproduction_mismatch')
        current=self.current_observations(head)
        if {row['id']:row for row in current} != {row['id']:row for row in payload['observations']}:
            raise StorageError('release_observations_incomplete')
        entries=[]
        for path,content in files.items():
            existing=self.read(path,head)
            if path != 'web/latest.json' and existing is not None and existing != content:
                raise StorageError('immutable_conflict')
            blob=self.request('POST','/git/blobs',dict(content=base64.b64encode(content).decode(),encoding='base64'))
            entries.append(dict(path=path,mode='100644',type='blob',sha=blob['sha']))
        parent=self.request('GET',f'/git/commits/{head}')
        tree=self.request('POST','/git/trees',dict(base_tree=parent['tree']['sha'],tree=entries))
        commit=self.request('POST','/git/commits',dict(message='publish verified web release',tree=tree['sha'],parents=[head]))
        try:
            self.request('PATCH','/git/refs/heads/data',dict(sha=commit['sha'],force=False))
        except StorageError:
            visible=self.head()
            if all(self.read(path,visible) == content for path,content in files.items()):
                return commit['sha']
            raise
        visible=self.head()
        if any(self.read(path,visible) != content for path,content in files.items()):
            raise StorageError('release_confirmation_failed')
        return commit['sha']

    def current_observations(self, head):
        from bunaken_engine.snapshots import validate
        commit=self.request('GET',f'/git/commits/{head}')
        root=self.request('GET',f"/git/trees/{commit['tree']['sha']}")
        entry=next((row for row in root['tree'] if row['path']=='observations' and row['type']=='tree'),None)
        if entry is None:return []
        tree=self.request('GET',f"/git/trees/{entry['sha']}?recursive=1")
        if tree.get('truncated'):raise StorageError('observation_tree_truncated')
        def read(path):
            result=self.request('GET',f"/contents/{quote(path,safe='/')}?ref={head}")
            if not result or result.get('encoding')!='base64':raise StorageError('release_source_mismatch')
            return json.loads(base64.b64decode(result['content']))
        output=[]
        for row in tree['tree']:
            if row['type']!='blob' or not re.fullmatch(r'[0-9a-f-]{36}/current\.json',row['path']):continue
            observation_id=row['path'].split('/')[0]
            pointer=read('observations/'+row['path'])
            revision=pointer.get('revision')
            if type(revision) is not int or revision<1:raise StorageError('release_source_mismatch')
            path=f'observations/{observation_id}/revisions/{revision:06d}.json'
            if pointer.get('id')!=observation_id or pointer.get('revision_path')!=path:raise StorageError('release_source_mismatch')
            observation=read(path);validate('observation-revision',observation)
            if observation['id']!=observation_id or observation['revision']!=revision:raise StorageError('release_source_mismatch')
            output.append(observation)
        return sorted(output,key=lambda row:row['id'])
