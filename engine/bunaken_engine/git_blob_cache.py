"""Discardable public-byte cache; Git commit/tree/blob identities remain authoritative."""
from hashlib import sha1
import os
import re
from pathlib import Path
import tempfile

MAX_BLOB_BYTES = 16 * 1024 * 1024


def blob_id(raw):
    return sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()


class BlobCache:
    def __init__(self, root):
        self.root=Path(root).resolve()/'blobs'

    def read(self, sha):
        if not re.fullmatch('[0-9a-f]{40}',sha):
            return None
        try:
            path=self.root/sha
            if path.stat().st_size > MAX_BLOB_BYTES:
                return None
            raw=path.read_bytes()
            return raw if blob_id(raw)==sha else None
        except OSError:
            return None

    def write(self, sha, raw):
        if not re.fullmatch('[0-9a-f]{40}',sha) or blob_id(raw)!=sha:
            raise ValueError('invalid_cached_blob')
        if len(raw) > MAX_BLOB_BYTES:
            return
        temporary=None
        try:
            self.root.mkdir(parents=True,exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=self.root,delete=False) as file:
                temporary=Path(file.name)
                file.write(raw)
            os.replace(temporary,self.root/sha)
        except OSError:
            pass  # Cache failure never replaces Git storage or blocks a valid read.
        finally:
            if temporary is not None:
                try:
                    temporary.unlink(missing_ok=True)
                except OSError:
                    pass
