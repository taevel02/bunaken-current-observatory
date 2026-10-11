"""Process-local cache of fully checked immutable bundle bytes, never storage proof."""
from collections import OrderedDict
from functools import lru_cache

MAX_BYTES = 128 * 1024 * 1024
_bundles = OrderedDict()
_size = 0


@lru_cache(maxsize=128)
def content_identity(fingerprint):
    from bunaken_engine.snapshots import digest
    # Relative names and contents, not temporary replay directory names.
    return digest(b''.join(name.encode()+b'\0'+path.read_bytes()+b'\0'
                           for name,path,_,_ in fingerprint))


def get(key):
    if key not in _bundles:
        return None
    _bundles.move_to_end(key)
    return dict(_bundles[key])


def put(key, files):
    global _size
    size=sum(len(raw) for raw in files.values())
    if size > MAX_BYTES:
        return
    if key in _bundles:
        _size -= sum(len(raw) for raw in _bundles.pop(key).values())
    while _bundles and _size+size > MAX_BYTES:
        _, previous=_bundles.popitem(last=False)
        _size -= sum(len(raw) for raw in previous.values())
    _bundles[key]=dict(files)
    _size += size
