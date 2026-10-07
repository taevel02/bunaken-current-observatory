// Must match engine canonical JSON: sorted keys and one trailing newline.
export function canonicalTransfer(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalTransfer).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalTransfer(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function validTransfer(transfer, expectedConfig, configHash, siteIds) {
  if (canonicalTransfer(transfer.config) !== canonicalTransfer(expectedConfig) || transfer.config_sha256 !== configHash ||
      transfer.model_version !== expectedConfig.version || transfer.validation_status !== 'unvalidated') return false;
  const slots = new Set();
  for (const item of transfer.predictions) {
    const row = item.prediction, donors = item.donor_sites;
    const slot = `${row.site_id}:${row.zone_id}:${row.start_at}`;
    if (slots.has(slot) || !siteIds.includes(row.site_id) || donors.includes(row.site_id) ||
        donors.some(site => !siteIds.includes(site)) || new Set(donors).size !== item.donor_site_count ||
        item.config_sha256 !== configHash || row.model_version !== expectedConfig.version || item.validation_status !== 'unvalidated') return false;
    slots.add(slot);
    if (row.pci !== null && (row.prediction_status !== 'experimental' || row.support !== 'very_low' || row.same_site_days !== 0 ||
        row.zone_id !== null || row.reference_depth_m !== 18 || row.distinct_days < 3 || row.n_eff < 2 || row.n_eff_days < 2 ||
        row.feature_coverage.total + 1e-12 < .8 || !Number.isFinite(row.feature_coverage.total) || row.reason_codes.length ||
        item.analog_count < 3 || item.donor_site_count < expectedConfig.minimum_sites ||
        item.n_eff_sites < expectedConfig.minimum_n_eff_sites || item.max_site_share > expectedConfig.maximum_site_share + 1e-12 ||
        !transfer.model_context_sha256)) return false;
  }
  return true;
}
