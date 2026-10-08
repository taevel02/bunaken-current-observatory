"""Read-only frozen Git adapter for offline evidence and recovery checks, never executes data."""
import re
import subprocess
from pathlib import Path

from bunaken_engine.git_store import StorageError
from bunaken_engine.snapshots import allowed_data_path


class LocalGitReadStore:
    def __init__(self,repository,head):
        self.repository=Path(repository).resolve();self._head=head;self.cache={}
        self._sha(head)
    def _sha(self,sha):
        if not re.fullmatch('[0-9a-f]{40}',sha): raise StorageError('invalid_git_identity')
    def _git(self,*args):
        return subprocess.check_output(['git','-C',str(self.repository),*args],stderr=subprocess.PIPE)
    def head(self):return self._head
    def _read(self,path,ref):
        self._sha(ref);key=(path,ref)
        if key not in self.cache:
            result=subprocess.run(['git','-C',str(self.repository),'show',ref+':'+path],capture_output=True)
            self.cache[key]=result.stdout if result.returncode==0 else None
        return self.cache[key]
    def read(self,path,ref):
        if not allowed_data_path(path):raise StorageError('path_forbidden')
        return self._read(path,ref)
    def read_observation_revision(self,path,ref):
        if not re.fullmatch(r'observations/[0-9a-f-]{36}/revisions/\d{6}\.json',path):raise StorageError('path_forbidden')
        return self._read(path,ref)
    def commit_time(self,sha):
        self._sha(sha);return self._git('show','-s','--format=%cI',sha).decode().strip()
    def path_commit_time(self,path,head):
        if not allowed_data_path(path):raise StorageError('path_forbidden')
        self._sha(head);return self._git('log','-1','--format=%cI',head,'--',path).decode().strip()
    def request(self,method,path,body=None):
        if method!='GET':raise StorageError('read_only_store')
        match=re.fullmatch(r'/git/commits/([a-f0-9]{40})',path)
        if match:
            sha=match[1]
            return dict(tree=dict(sha=self._git('rev-parse',sha+'^{tree}').decode().strip()),committer=dict(date=self.commit_time(sha)))
        match=re.fullmatch(r'/git/trees/([a-f0-9]{40})\?recursive=1',path)
        if match:
            items=[]
            for item in self._git('ls-tree','-r','-z',match[1]).split(b'\0'):
                if not item:continue
                meta,name=item.split(b'\t',1);mode,kind,sha=meta.decode().split()
                items.append(dict(type=kind,path=name.decode(),sha=sha,mode=mode))
            return dict(tree=items,truncated=False)
        raise StorageError('unsupported_read_operation')
