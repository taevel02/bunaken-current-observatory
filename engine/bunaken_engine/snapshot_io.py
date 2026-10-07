"""Bounded storage encoding for immutable manifests; hashes cover stored bytes."""
import gzip
from io import BytesIO
import json

from bunaken_engine.snapshots import SnapshotError, canonical

MAX_MANIFEST_BYTES = 256 * 1024 * 1024
MAX_COMPRESSED_MANIFEST_BYTES = 8 * 1024 * 1024


def encode_manifest(manifest, *, compressed=False):
    raw = canonical(manifest)
    if len(raw) > MAX_MANIFEST_BYTES:
        raise SnapshotError('snapshot_manifest_size_exceeded')
    if compressed:
        raw = gzip.compress(raw, mtime=0)
        if len(raw) > MAX_COMPRESSED_MANIFEST_BYTES:
            raise SnapshotError('snapshot_manifest_size_exceeded')
    return raw


def decode_manifest(raw):
    if raw.startswith(b'\x1f\x8b'):
        if len(raw) > MAX_COMPRESSED_MANIFEST_BYTES:
            raise SnapshotError('snapshot_manifest_size_exceeded')
        with gzip.GzipFile(fileobj=BytesIO(raw)) as stream:
            raw = stream.read(MAX_MANIFEST_BYTES + 1)
    if len(raw) > MAX_MANIFEST_BYTES:
        raise SnapshotError('snapshot_manifest_size_exceeded')
    return json.loads(raw)


def load_manifest(path):
    return decode_manifest(path.read_bytes())


def read_stored_manifest(store, prefix, head):
    for name in ('manifest.json.gz', 'manifest.json'):
        path = prefix + '/' + name
        raw = store.read(path, head)
        if raw is not None:
            return path, decode_manifest(raw), raw
    return None, None, None
