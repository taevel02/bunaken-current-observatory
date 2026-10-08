"""Storage-only environment references; expansion reproduces the original manifest."""
import re

from bunaken_engine.snapshots import canonical, digest, SnapshotError

ENCODING = 'snapshot-environment-references-v1'
PATH = re.compile(r'environment-inputs/([0-9a-f]{64})\.json\.gz')


def pack(manifest):
    from bunaken_engine.snapshot_io import encode_manifest
    context = manifest.get('model_context')
    if context is None:
        raise SnapshotError('reference_model_context_required')
    # Bundles are already licence/schema/replay checked by make_bundle.
    if len(context['training_bundles']) > 10000:
        raise SnapshotError('environment_reference_count_exceeded')
    references, files = [], {}
    for bundle in context['training_bundles']:
        raw = encode_manifest(bundle, compressed=True)
        sha = digest(raw)
        path = f'environment-inputs/{sha}.json.gz'
        references.append(dict(path=path, sha256=sha))
        files[path] = raw
    compact = {**manifest, 'model_context': {**context, 'training_bundles': []}}
    envelope = dict(encoding=ENCODING, manifest=compact, training_bundle_references=references,
                    expanded_manifest_sha256=digest(canonical(manifest)))
    return envelope, files


def expand(document, reader):
    from bunaken_engine.snapshot_io import decode_manifest
    if set(document) != {'encoding','manifest','training_bundle_references','expanded_manifest_sha256'}:
        raise SnapshotError('invalid_environment_reference_envelope')
    manifest = document['manifest']
    refs = document['training_bundle_references']
    if (not isinstance(manifest,dict) or not isinstance(manifest.get('model_context'),dict) or
        manifest['model_context'].get('training_bundles') != [] or not isinstance(refs,list) or len(refs)>10000 or
        not isinstance(document['expanded_manifest_sha256'],str) or
        not re.fullmatch('[0-9a-f]{64}',document['expanded_manifest_sha256'])):
        raise SnapshotError('invalid_environment_reference_envelope')
    bundles, seen = [], set()
    for ref in refs:
        if not isinstance(ref,dict) or set(ref) != {'path','sha256'} or not isinstance(ref['path'],str):
            raise SnapshotError('invalid_environment_reference')
        match = PATH.fullmatch(ref['path'])
        if not match or match[1] != ref['sha256'] or ref['path'] in seen:
            raise SnapshotError('invalid_environment_reference')
        seen.add(ref['path'])
        if reader is None:
            raise SnapshotError('environment_reference_reader_required')
        raw = reader(ref['path'])
        if raw is None or digest(raw) != ref['sha256']:
            raise SnapshotError('environment_reference_hash_mismatch')
        bundle = decode_manifest(raw)  # No recursive reference envelopes accepted.
        if not isinstance(bundle,dict) or not isinstance(bundle.get('manifest'),dict) or bundle['manifest'].get('model_context') is not None:
            raise SnapshotError('nested_model_context_forbidden')
        bundles.append(bundle)
    expanded = {**manifest,'model_context':{**manifest['model_context'],'training_bundles':bundles}}
    if digest(canonical(expanded)) != document['expanded_manifest_sha256']:
        raise SnapshotError('environment_expansion_hash_mismatch')
    return expanded
