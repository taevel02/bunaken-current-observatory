"""Local Git bundle backup and isolated restore verification; never copies working-tree secrets."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import time


def git(root,*args):
    return subprocess.check_output(['git','-C',str(root),*args],stderr=subprocess.PIPE).decode().strip()


def backup_restore(repository,output):
    repository=Path(repository).resolve();output=Path(output).resolve()
    if output.exists(): raise ValueError('backup_output_exists')
    refs=['refs/heads/main','refs/remotes/origin/data']
    heads={ref:git(repository,'rev-parse',ref) for ref in refs}
    output.parent.mkdir(parents=True,exist_ok=True)
    start=time.perf_counter()
    git(repository,'bundle','create',str(output),*refs)
    git(repository,'bundle','verify',str(output))
    with tempfile.TemporaryDirectory(prefix='bunaken-restore-') as directory:
        restored=Path(directory)/'restored.git'
        subprocess.run(['git','clone','--mirror',str(output),str(restored)],check=True,capture_output=True)
        git(restored,'fsck','--full','--no-reflogs')
        actual={ref:git(restored,'rev-parse',ref) for ref in refs}
        if actual != heads: raise ValueError('restored_ref_mismatch')
        data=git(restored,'ls-tree','-r','--name-only',heads[refs[1]]).splitlines()
        counts={kind:sum(path.startswith(kind+'/') for path in data) for kind in ['observations','snapshots','snapshot-receipts','seals','web','environment-inputs','validation']}
        # Commit identities and fsck cover every tracked blob, not only a sample.
        return dict(restored=True,refs=heads,files=counts,bundle_bytes=output.stat().st_size,
                    elapsed_seconds=round(time.perf_counter()-start,3),
                    includes_working_tree=False,includes_ignored_files=False)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository',type=Path,default=Path(__file__).resolve().parents[1]);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();print(json.dumps(backup_restore(args.repository,args.output),sort_keys=True))
