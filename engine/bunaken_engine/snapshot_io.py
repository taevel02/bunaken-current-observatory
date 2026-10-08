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


def decode_manifest(raw, *, input_reader=None):
    if raw.startswith(b'\x1f\x8b'):
        if len(raw) > MAX_COMPRESSED_MANIFEST_BYTES:
            raise SnapshotError('snapshot_manifest_size_exceeded')
        with gzip.GzipFile(fileobj=BytesIO(raw)) as stream:
            raw = stream.read(MAX_MANIFEST_BYTES + 1)
    if len(raw) > MAX_MANIFEST_BYTES:
        raise SnapshotError('snapshot_manifest_size_exceeded')
    document = json.loads(raw)
    from bunaken_engine.environment_references import ENCODING, expand
    if isinstance(document,dict) and document.get("encoding") == ENCODING:
        return expand(document,input_reader)
    return document


def load_manifest(path):
    def read_input(relative):
        # Inputs share the output root with snapshots/<date>/<run>/manifest.
        for parent in path.parents:
            candidate = parent / relative
            if candidate.is_file():
                return candidate.read_bytes()
        return None
    return decode_manifest(path.read_bytes(), input_reader=read_input)


def read_stored_manifest(store, prefix, head):
    for name in ('manifest.json.gz', 'manifest.json'):
        path = prefix + '/' + name
        raw = store.read(path, head)
        if raw is not None:
            return path, decode_manifest(raw,input_reader=lambda relative: store.read(relative,head)), raw
    return None, None, None
