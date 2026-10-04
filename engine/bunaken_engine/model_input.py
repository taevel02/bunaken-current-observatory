"""Read public revision history and Git-confirmed environment bundles at one head."""
import gzip
import json
import re

from bunaken_engine.pipeline import verified_receipt
from bunaken_engine.model_data import checked_bundles
from bunaken_engine.snapshots import make_bundle, canonical, digest, validate
from bunaken_engine.registry import ROOT
from bunaken_engine.features import instant


def data_inputs(store, cutoff, *, root=ROOT):
    head = store.head()
    commit = store.request('GET', f'/git/commits/{head}')
    tree = store.request('GET', f"/git/trees/{commit['tree']['sha']}?recursive=1")
    if tree.get('truncated'): raise ValueError('model_input_tree_truncated')
    observations, bundles = [], []
    for entry in sorted(tree['tree'], key=lambda row: row['path']):
        path = entry['path']
        if entry['type'] != 'blob': continue
        match = re.fullmatch(r'observations/([0-9a-f-]{36})/revisions/(\d{6})\.json', path)
        if match:
            row = json.loads(store.read_observation_revision(path, head)); validate('observation-revision', row, root)
            if row['id'] != match[1] or row['revision'] != int(match[2]): raise ValueError('model_revision_identity_mismatch')
            observations.append(row)
        elif re.fullmatch(r'snapshot-receipts/[0-9a-f-]{36}\.json', path):
            receipt = verified_receipt(store, json.loads(store.read(path, head)), head, root=root)
            if not receipt['storage_verified'] or instant(receipt['persisted_at']) > instant(cutoff): continue
            manifest = json.loads(store.read(receipt['manifest_path'], receipt['storage_commit']))
            if manifest['status'] != 'succeeded': continue
            prefix = receipt['manifest_path'].removesuffix('/manifest.json')
            features = json.loads(gzip.decompress(store.read(prefix+'/features.json.gz', receipt['storage_commit'])))
            forecast = json.loads(gzip.decompress(store.read(prefix+'/forecast.json.gz', receipt['storage_commit'])))
            make_bundle(manifest, features, forecast, root=root, kind=manifest['kind'])
            origin = digest(canonical(manifest))
            configuration=None
            if manifest.get('model_context') is not None:
                configuration=manifest['model_context']['configuration']
                manifest = {key: value for key, value in manifest.items() if key not in {'model_context','model_context_sha256'}}
                manifest['schema_version']='1.1'
                forecast=[]
                manifest['artifact_hashes']['forecast.json.gz']=digest(gzip.compress(canonical(forecast),mtime=0))
            bundle=dict(manifest=manifest, features=features, forecast=forecast, origin_manifest_sha256=origin,
                        storage_evidence={key:receipt[key] for key in ('storage_verified','persisted_at','manifest_sha256','storage_commit')})
            if configuration is not None: bundle['environment_configuration']=configuration
            bundles.append(bundle)
    return head, observations, checked_bundles(bundles, root=root)


def verify_context_storage(store, context, head, *, root=ROOT):
    """Publishing cannot turn local fixtures or self-asserted receipts into field evidence."""
    from bunaken_engine.snapshots import SnapshotError
    commit=store.request('GET',f'/git/commits/{head}')
    tree=store.request('GET',f"/git/trees/{commit['tree']['sha']}?recursive=1")
    if tree.get('truncated'): raise SnapshotError('model_input_tree_truncated')
    stored_history={}
    for entry in tree['tree']:
        if entry['type'] != 'blob': continue
        match=re.fullmatch(r'observations/([0-9a-f-]{36})/revisions/(\d{6})\.json',entry['path'])
        if not match: continue
        row=json.loads(store.read_observation_revision(entry['path'],head))
        validate('observation-revision',row,root)
        if row['id'] != match[1] or row['revision'] != int(match[2]):
            raise SnapshotError('model_revision_identity_mismatch')
        if instant(row['updated_at']) <= instant(context['cutoff']):
            stored_history[(row['id'],row['revision'])]=row
    supplied_history={(row['id'],row['revision']):row for row in context['observations']}
    if supplied_history != stored_history:
        raise SnapshotError('model_observation_history_incomplete')
    for observation in context['observations']:
        path=f"observations/{observation['id']}/revisions/{observation['revision']:06d}.json"
        raw=store.read_observation_revision(path,head)
        if raw is None or json.loads(raw) != observation:
            raise SnapshotError('model_observation_storage_unverified')
    for bundle in context['training_bundles']:
        path=f"snapshot-receipts/{bundle['manifest']['run_id']}.json"
        raw=store.read(path,head)
        if raw is None: raise SnapshotError('model_environment_storage_unverified')
        receipt=verified_receipt(store,json.loads(raw),head,root=root)
        origin=bundle.get('origin_manifest_sha256') or digest(canonical(bundle['manifest']))
        if not receipt['storage_verified'] or receipt['manifest_sha256'] != origin:
            raise SnapshotError('model_environment_storage_unverified')
        if instant(receipt['persisted_at']) > instant(context['cutoff']):
            raise SnapshotError('model_environment_stored_after_cutoff')
        original=json.loads(store.read(receipt['manifest_path'],receipt['storage_commit']))
        prefix=receipt['manifest_path'].removesuffix('/manifest.json')
        features=json.loads(gzip.decompress(store.read(prefix+'/features.json.gz',receipt['storage_commit'])))
        forecast=json.loads(gzip.decompress(store.read(prefix+'/forecast.json.gz',receipt['storage_commit'])))
        if original.get('model_context') is not None:
            if bundle.get('environment_configuration') != original['model_context']['configuration']:
                raise SnapshotError('model_environment_projection_mismatch')
            original={key:value for key,value in original.items() if key not in {'model_context','model_context_sha256'}}
            original['schema_version']='1.1';forecast=[]
            original['artifact_hashes']['forecast.json.gz']=digest(gzip.compress(canonical(forecast),mtime=0))
        if original != bundle['manifest'] or features != bundle['features'] or forecast != bundle['forecast']:
            raise SnapshotError('model_environment_projection_mismatch')
        if bundle.get('storage_evidence') and any(bundle['storage_evidence'][key] != receipt[key] for key in
            ('storage_verified','persisted_at','manifest_sha256','storage_commit')):
            raise SnapshotError('model_storage_evidence_mismatch')
