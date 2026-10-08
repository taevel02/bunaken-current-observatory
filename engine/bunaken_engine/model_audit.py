"""Read-only retrospective factor and neighbor diagnostics, never model selection."""
import copy
from collections import defaultdict
from statistics import median

from bunaken_engine.analog import comparison_features, environmental_distance, neighbors, predict, site_weight
from bunaken_engine.features import finite
from bunaken_engine.model_data import prepare_model, latest_revisions, replay_root
from bunaken_engine.registry import ROOT, resolve_geometry, usable_geometry
from bunaken_engine.snapshots import canonical, digest, validate
from bunaken_engine.validation import metrics, evaluate


def variants(features, config):
    effective = comparison_features(features, config)
    result = [('current', effective, config)]
    for excluded in effective['groups']:
        changed = copy.deepcopy(effective)
        total = sum(group['weight'] for name,group in changed['groups'].items() if name != excluded)
        for name, group in changed['groups'].items():
            group['weight'] = 0 if name == excluded else group['weight']/total
        result.append((f'without_{excluded}',changed,config))
    equal = copy.deepcopy(effective)
    for group in equal['groups'].values(): group['weight'] = 1/len(equal['groups'])
    result.append(('equal_groups',equal,config))
    for sigma in (.5,2.0): result.append((f'sigma_{sigma}',effective,{**config,'sigma':sigma}))
    for count in (5,10): result.append((f'neighbors_{count}',effective,{**config,'maximum_neighbors':count}))
    return result


def influence(target, candidates, scaler, features, config):
    effective = comparison_features(features,config)
    selected, _, mask = neighbors(target,candidates,scaler,effective,config)
    total = sum(row['weight'] for row in selected)
    group_total = sum(effective['groups'][group]['weight'] for group in mask)
    rows=[]
    for row in selected:
        candidate = row['candidate']
        terms = {group: environmental_distance(target['values'],candidate['values'],{group:units},scaler,effective)**2 *
                 effective['groups'][group]['weight']/group_total for group,units in mask.items()}
        if abs(sum(terms.values()) - row['distance']**2) > 1e-9:
            raise ValueError('audit_distance_decomposition_mismatch')
        rows.append(dict(id=candidate['id'],day=candidate['day'],site_id=candidate['site_id'],
                         actual_pci=candidate['pci'],environment_distance=row['distance'],distance_squared_by_group=terms,
                         similarity=row['similarity'],site_multiplier=site_weight(target,candidate,config),
                         quality_weight=candidate['quality_weight'],provenance_weight=candidate['provenance_weight'],
                         weight=row['weight'],normalized_weight=row['weight']/total,
                         pci_contribution=row['weight']/total*candidate['pci']))
    return rows


def candidate_diagnostics(candidates, scaler, features, config, *, root=ROOT):
    """Whole-day holdout with as-of-cutoff inputs; future days allowed: diagnostic only."""
    experiments=[]; details=[]
    for name, variant_features, variant_config in variants(features,config):
        rows=[]
        for observation in candidates:
            if not finite(observation.get('pci')): continue
            pool=[row for row in candidates if row['day'] != observation['day'] and finite(row.get('pci'))]
            geometry=resolve_geometry(observation['site_id'],observation['zone_id'],root)
            target=dict(site_id=observation['site_id'],zone_id=observation['zone_id'],start_at=observation['start_at'],
                        values=observation['values'],geometry_verified=usable_geometry(geometry),
                        reference_geometry=geometry['status']=='reference_geometry',sources_ready=True)
            prediction=predict(target,pool,scaler,config=variant_config,feature_config=variant_features,diagnostic=True,root=root)
            same_site=[row['pci'] for row in pool if row['site_id']==observation['site_id']]
            rows.append(dict(id=observation['id'],day=observation['day'],site_id=observation['site_id'],actual=observation['pci'],
                             pci=prediction['pci'],reason_codes=prediction['reason_codes'],
                             global_baseline=median([row['pci'] for row in pool]) if pool else None,
                             site_baseline=median(same_site) if same_site else None))
            if name=='current':
                neighbors_report=influence(target,pool,scaler,variant_features,variant_config)
                by_site=defaultdict(float); by_day=defaultdict(float)
                for row in neighbors_report:
                    by_site[row['site_id']]+=row['normalized_weight'];by_day[row['day']]+=row['normalized_weight']
                details.append(dict(**rows[-1],n_eff=prediction['n_eff'],n_eff_days=prediction['n_eff_days'],
                                    max_observation_share=max((row['normalized_weight'] for row in neighbors_report),default=None),
                                    site_shares=dict(by_site),day_shares=dict(by_day),neighbors=neighbors_report))
        current=experiments[0]['rows'] if experiments else rows
        common_ids={row['id'] for row in current if row['pci'] is not None} & {row['id'] for row in rows if row['pci'] is not None}
        common=[row for row in rows if row['id'] in common_ids]
        experiments.append(dict(name=name,group_weights={g:d['weight'] for g,d in variant_features['groups'].items()},
                                sigma=variant_config['sigma'],maximum_neighbors=variant_config['maximum_neighbors'],
                                metrics=metrics(rows,config['large_error_threshold']),
                                common_with_current_metrics=metrics(common,config['large_error_threshold']),
                                current_on_common_metrics=metrics([row for row in current if row['id'] in common_ids],config['large_error_threshold']),rows=rows))
    return experiments,details


def audit(context, *, root=ROOT, current_observations=None, source_data_commit=None):
    validate('model-context',context,root)
    with replay_root(context,root) as replay:
        candidates,scaler,excluded=prepare_model(context['observations'],context['training_bundles'],context['observer'],context['rubric'],context['cutoff'],root=replay)
        experiments,details=candidate_diagnostics(candidates,scaler,context['configuration']['features'],context['configuration']['model'],root=replay)
        current=latest_revisions(current_observations if current_observations is not None else context['observations'],root=replay)
        # This does not assert remote confirmation; strict operational verification is a separate CLI.
        forward=evaluate(current_observations if current_observations is not None else context['observations'],
                         context['training_bundles'],context['observer'],context['rubric'],
                         mode='forward',operational=False,root=replay)
        used={(row['id'],row['revision']) for row in candidates}
        pending=[dict(id=row['id'],revision=row['revision'],start_at=row['start_at'],reason='not_in_frozen_eligible_candidates')
                 for row in current if (row['id'],row['revision']) not in used]
        return dict(schema_version='1.0',kind='retrospective_factor_diagnostic',operational_forecast=False,
                    model_version=context['configuration']['model']['version'],input_context_sha256=digest(canonical(context)),
                    source_data_commit=source_data_commit,cutoff=context['cutoff'],
                    observations_at_cutoff=len(latest_revisions(context['observations'],cutoff=context['cutoff'],root=replay)),
                    eligible_candidates=len(candidates),distinct_days=len({row['day'] for row in candidates}),
                    current_observations=len(current),pending_observations=pending,excluded=excluded,
                    scaler_rows=scaler['row_count'],experiments=experiments,influence=details,
                    retrospective_forward=forward,storage_confirmation_checked=False,
                    selection=None,promotion=False,
                    limitations=['future_days_and_as_of_scaler_allowed_in_diagnostic',
                                 'not_d1_performance','not_causal_feature_importance',
                                 'mandatory_source_and_numeric_gates_retained',
                                 'ablation_zeroes_distance_weight_not_source_requirement',
                                 'overall_labels_only','no_model_configuration_changed'])
