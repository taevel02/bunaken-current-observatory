---
version: "1.0.1"
data_cutoff: "2026-10-07T00:05:28Z"
model_version: "weighted-analog-v1.3"
dataset_sha256: "958cdbda3c831df6b756c8a19772f0139e34014a68244ca707ce823fbca2f03c"
results_sha256: "601abf0a6c1f003c01b660506b7b03679dde68e075240b5994ba7c3bf2d65d06"
audience: "technical"
locale: "en"
---
권태훈 / PADI IDC Staff Instructor (#554990)
Contributions: research conception; field diving, observation and recording; data analysis and interpretation; manuscript preparation and independent publication
Version 1.0.1 · Independent research report · Not peer reviewed

## Abstract

This report documents an initial method and corrected recalculation for linking post-dive, observer-reported Perceived Current Intensity (PCI) with tide, ocean and weather model data at Bunaken dive sites, North Sulawesi, Indonesia. PCI is not a measurement of in-situ current velocity or risk. The estimator is a Weighted Analog model with a fixed environmental feature distance and quality, provenance and Site weights. It abstains when numeric eligibility gates are not met.

The corrected public dataset contains 24 observations across nine WITA dates. The corrected context was recalculated for 24 candidates using 2,736 environmental scaler rows. The operational forward evaluation provided zero predictions for 24 test observations under the same-Site and source gates. No target PCI slots are published from this corrected context. Earlier retrospective forward and LODO metrics are diagnostics only and do not establish D+1 operational skill. Predictive performance has not been demonstrated; this report describes an ongoing study.

## Research question and scope

The question is whether historical, subjective Site-level PCI labels and environmental features available at prediction time can inform PCI observed in a subsequent dive window. This phase evaluates data provenance, feature construction, eligibility gates, release preservation and temporal validation. It does not estimate causal effects, safety, dive suitability, current velocity or general predictive skill. At least one month of prospective observation is a future study plan, not a result reported here.

The author and sole observer, Taehoon Kwon, dives, records and interprets PCI, and prepares and publishes this research. Inter-observer agreement, observer calibration and independent peer review have not been conducted.

## Study area and spatial representation

The site registry contains 19 Bunaken Sites. Coordinates identify author-confirmed representative entry points; they do not imply that boat entry is identical on every dive. The shared reference depth is 18 m for comparison. It is not the measured mean depth of each dive.

An environmental grid cell is a spatial sample from a provider model. The selection rule allows a valid sea cell within 6 km of the representative point. This is a selection bound, not evidence that all walls, caves or coastal flows in that radius are represented. Red map arrows were digitized as approximate progression axes and blue arrows as offshore axes. The conversion assumes north-up and rounds to roughly 15-degree increments. The red axis is not a measured wall normal, GPS track or orthogonal axis. The two axes are projected independently. No Zone-level predictions or geometry groups were created because Zone locations are not known.

The model grid is therefore coarser than the local flow scales divers may experience. Multiple Sites can select the same or nearby provider cell. Coordinate precision and representativeness of a local dive route are separate questions.

## Field observations and PCI definition

The observation unit is one dive. Overall PCI represents the dive-level perceived experience; Peak PCI is a separately identified event label. The scopes are not interchangeable. Unknown times, depths and Zones remain unknown rather than being imputed. Corrections are retained as public revisions. `use_for_model` describes training eligibility, not whether a saved record is public.

PCI is a dimensionless, observer-subjective scale. Anchors are 0.0 (almost no perceived influence), 0.2 (noticeable flow with little effect on usual progress), 0.4 (clear drift and effort differences by direction), 0.6 (clear effect on route and position holding), 0.8 (major effect on dive progress), 1.0 (the author’s reference event), and above 1.0 (felt stronger than that event). One is not a maximum. PCI is not m/s, probability, risk or a safety classification. Differences between observers and contexts have not been calibrated.

For 19 September 2026 at Mandolin, the author corrected the dive-level Overall label to 0.7 and the separate Peak event to 1.0. The author recalled difficulty ascending despite adding air to the BCD and finning forcefully, and moving upward while holding the wall. This is subjective event context, not a vertical-current measurement or general safety instruction. Exact time, Zone and water velocity were not established. Legacy categorical records and Peak labels are not substituted for Overall labels.

## Environmental sources and provenance

- **FES2022b ocean tide:** a harmonic atlas used to derive tide height. The model derives a rate of change and excursion over the requested window. Tide height or change is not current velocity or an in-situ current measurement. The original atlas is not included in the public bundle.
- **Copernicus Marine GLOBAL_ANALYSISFORECAST_PHY_001_024**, dataset `cmems_mod_glo_phy-cur_anfc_0.083deg_PT6H-i` and related products, version `202406`: horizontal ocean-model currents (`uo`, `vo`) and modelled temperature (`thetao`). The configured product has a 0.083-degree grid, six-hour time interval and 50 native depth levels; the retrieved depth coordinate is preserved. Modelled current is not a field velocity observation.
- **Open-Meteo ECMWF and Marine families:** wind, wave and swell features. API output interval and provider native resolution are not equivalent. Wind-direction convention is distinguished from ocean-current vector direction.

Active features are `tide_rate_m_per_hour`, `tide_excursion_m`; `current_along_m_s`, `current_cross_m_s`, `current_speed_m_s`, `horizontal_shear_10_30_m_s`; `modelled_temperature_c`, `temperature_difference_10_30_c`; `wind_along_m_s`, `wind_cross_m_s`, `wave_height_m`, `wave_period_s`, `swell_height_m`, `swell_period_s`, `wave_direction_sin/cos` and `swell_direction_sin/cos`. Wind, wave and swell are projected onto map-reference axes; direction angles are compared through periodic components. The differences between 10 m and 30 m are horizontal layer differences, not vertical velocity. Tide excursion is the range within the requested 60-minute window, not a full tidal-cycle range.

Salinity and lunar information may be collected or displayed but are not active PCI features in this calculation. Dive-computer temperature is a separate observation from modelled temperature and is not substituted for it. Recorded field checks at 28°C remain attached to the observation but are not a replacement or calibration for model-temperature features.

Retrieval records dataset/version, issue, retrieval and valid times, source status, resolution, geometry and provenance. Temporal/depth interpolation is bounded by valid points; land cells, distance, depth, quality and staleness are checked. Retrospective backfills are not represented as forecasts available at the time. Public results include only permitted derived values and attribution; files outside redistribution terms are excluded.

## Features and Weighted Analog estimator

The comparison scope is `site-18m-v2`; the engine version is `weighted-analog-v1.3`. Active groups are tide (initial weight 0.30), ocean (0.35), thermal (0.15) and weather (0.10). The configured depth weight of 0.10 is inactive in the current scaler because all reference depths are identical and have zero variance. Registration in a feature catalog is not the same as active participation in a distance. Tide-phase sine/cosine terms are disabled because their definition is not verified. Enabled features are compared within fixed groups; missing values are not imputed as zero. No training-temperature bias is applied.

Scalers use environmental distributions before the training cutoff, not PCI labels. The current calculation used 2,736 scaler rows; its corrected dataset context cutoff was 2026-10-07T00:05:28Z. An IQR-based feature distance and a fixed comparison mask determine environmental distance; a Gaussian-shaped similarity uses σ=1.0. Minimum similarity is 0.2 and at most 20 neighbors are considered. Configured coefficients for same Zone/Site, other Sites, quality, provenance, approximate time and depth modify neighbor weights. Site coefficients are 1.0 for same Zone, 0.8 for same Site with unknown Zone, 0.65 for another Zone at the same Site, 0.35 for verified similar geometry and 0.15 for another Site. Quality coefficients are 1.0/0.8/0.5 for high/normal/low; snapshot provenance is 1.0 and backfill is 0.7. Approximate time and estimated depth each use 0.8. The other-Site coefficient does not waive the overall eligibility gates. The estimator returns a weighted PCI mean and effective sample size (N_{eff}=(Σw)^2/Σw^2). These feature weights and coefficients are implementation settings, not empirically established physical contributions.

Numeric gates require at least three eligible numeric Overall labels, three distinct dates, three valid analogs, (N_{eff}≥2), at least one same-Site reference, required tide/ocean features and adequate feature coverage. Dates are grouped in WITA. A failed gate or missing source yields null with a reason code. More records do not automatically improve eligibility or accuracy. Because spatial geometry remains approximate, numeric output is labeled experimental/very_low.

The current same-Site gate means that ocean currents from another Site do not automatically fill PCI at a rarely visited Site. Cross-Site transfer requires a separately versioned model and evaluation such as leave-one-Site-out and spatial blocks, with predefined error and coverage comparisons against baselines. Current results do not establish transfer. The model gate was not weakened.

## Prediction windows and validation design

Each output summarizes a 60-minute window beginning at its start time. Output times are spaced 30 minutes apart, so adjacent windows overlap. A point is not an instantaneous observation. The forecast window can also differ from the interval of an actual dive label.

The primary design is time-ordered forward validation using only labels from earlier WITA dates. All dives, Peak events and derived rows on a date stay in the same fold. Official D+1 evaluation uses a successful snapshot actually stored by 20:00 WITA on the preceding day. Late runs, retrospective backfills and future information cannot be recast as forecasts that were available then. If evaluation provenance or feature gates fail, the model abstains. Coverage, abstention, MAE and matched baselines are reported together. No large-error threshold is configured, so no large-error rate is estimated.

LODO excludes one date and evaluates it using the remaining dates. Dates after the held-out date can enter training, so LODO is retrospective diagnosis, not D+1 or future generalization evidence. Scalers and bias are fitted only within the allowed training information for each fold.

## Corrected-data calculation and validation results

The current public data head is a431af719b869ae578b95e1392df8618cee0dfc8. This calculation replayed previously verified immutable historical environmental bundles. A fresh source-collection attempt did not return the required historical sources; no new provider collection or production validation is claimed. The analysis uses 24 public observations across nine WITA dates and 19 registered Sites. Dataset SHA-256 is 958cdbda3c831df6b756c8a19772f0139e34014a68244ca707ce823fbca2f03c. The model is weighted-analog-v1.3, comparison scope site-18m-v2. One observed temperature was corrected from 27°C to 28°C. Observed temperature is not an active PCI feature, so the 24 PCI candidate feature records did not change; the corrected context and hash did.

The correction revision was stored at 08:05 WITA on 7 October 2026, after the first target window began at 08:00. No target PCI was generated from that post-window context. The previously available target environmental snapshot preceded the temperature correction but was retrieved after the prior-day 20:00 WITA operational cutoff. It cannot be presented as an official D+1 forecast. No historical prediction was reconstructed with information unavailable at the required cutoff.

| Result | Value |
|---|---|
| Current public observations / WITA dates | {{metrics.observations}} / {{metrics.observation_days}} |
| Registered Sites | {{metrics.total_sites}} |
| Operational-cutoff forward: predictions / test observations | {{metrics.operational_forward_predicted}} / {{metrics.operational_forward_test}} |
| Operational-cutoff forward coverage / abstentions | {{metrics.operational_forward_coverage}} / {{metrics.operational_forward_abstention}} |
| Operational-cutoff forward MAE | {{metrics.operational_forward_mae}} |
| Retrospective backfill forward: predictions / test observations | {{metrics.backfill_forward_predicted}} / {{metrics.backfill_forward_test}} |
| Backfill forward MAE / global baseline / Site baseline | {{metrics.backfill_forward_mae}} / {{metrics.backfill_global_baseline_mae}} / {{metrics.backfill_site_baseline_mae}} |
| Diagnostic LODO: predictions / test observations / MAE | {{metrics.lodo_predicted}} / {{metrics.lodo_test}} / {{metrics.lodo_mae}} |
| Diagnostic LODO global / Site baseline MAE | {{metrics.lodo_global_baseline_mae}} / {{metrics.lodo_site_baseline_mae}} |

The official-condition forward evaluation provided 0 of 24 observations. Its MAE is null because there were no predictions to compare, not because 24 predictions all failed. This differs from the number of corrected-head target slots replayed: no corrected-head target PCI slots were replayed. A separate retrospective forward evaluation provided 3 of 24 observations, with MAE 0.06713, worse than its matched global baseline 0.04000 and Site baseline 0.05833. It used later backfilled environmental data. LODO provided 21 of 24 observations with MAE 0.06816; its global baseline was 0.07524 and Site baseline 0.06857. LODO can include dates later than the held-out date in training and is not D+1 operational performance.

The table lists current public observations by Site. Only the latest state for each observation ID is counted; withdrawn records are excluded. Rows are sorted by count descending, with ties in registry order.

| Site | Public observations |
|---|---|
| Lekuan Two | {{metrics.site_records_lekuan_two}} |
| Celah Celah | {{metrics.site_records_celah_celah}} |
| Alung Banua | {{metrics.site_records_alung_banua}} |
| Fukui | {{metrics.site_records_fukui}} |
| Muka Kampung | {{metrics.site_records_muka_kampung}} |
| Lekuan Three | {{metrics.site_records_lekuan_three}} |
| Mandolin | {{metrics.site_records_mandolin}} |
| Ron's Point | {{metrics.site_records_rons_point}} |
| Sachiko's Point | {{metrics.site_records_sachikos_point}} |
| Pahepa | {{metrics.site_records_pahepa}} |
| Lekuan One | {{metrics.site_records_lekuan_one}} |
| Johnson's Wall | {{metrics.site_records_johnsons_wall}} |
| Tengah | {{metrics.site_records_tengah}} |
| Raymond's Point | {{metrics.site_records_raymonds_point}} |
| Mike's Point | {{metrics.site_records_mikes_point}} |
| Tanjung Parigi | {{metrics.site_records_tanjung_parigi}} |
| Bunaken Timur One | {{metrics.site_records_bunaken_timur_one}} |
| Bunaken Timur Two | {{metrics.site_records_bunaken_timur_two}} |
| Pangalisang | {{metrics.site_records_pangalisang}} |

These counts describe current records in this public repository, not the author's lifetime dive count. Mike's Point, Tengah, Johnson's Wall, Raymond's Point, Tanjung Parigi and Pangalisang have no stored observations. The same-Site evidence gate remains in force. Current velocity from another Site can be compared as an environmental model input, but it cannot itself create a human PCI label or fill an unobserved Site's PCI. Cross-Site PCI transfer needs a separate model and must pass whole-Site holdout, spatial-block, independent-date, coverage and matched-baseline evaluation before public prediction.

The PCI graph connects only valid calculated time slots. Missing, duplicate and withheld slots break the line. Values are not synthesized to make a smooth sine-shaped curve. Environmental current or tide series may be shown separately across Sites when available, but they have different units and meanings from PCI. These data do not validate all-Site PCI curves or spatial transfer skill.

## Limitations, reproducibility and data rights

One observer and one evolving set of anchors do not permit estimation of observer drift, repeatability or between-observer scale differences. Site visitation is unbalanced; multiple Sites have no stored observations. The same-Site gate favors frequently visited Sites, and Site-specific error estimates remain unsupported. Reference geometry, shared 18 m depth and the 6 km grid bound are analytical assumptions, not field validation. There are no Zone/GPS tracks. Representativeness between the native grid and local terrain has not been measured.

Future work includes at least one month of prospective observation, consistent observer-rubric use, preservation of timestamps and source cutoffs, tracking missingness and abstention, and predefined baseline comparison. Cross-Site transfer should remain a separate experimental model until it passes leave-one-Site-out and date-separated evaluation. Sample growth alone does not guarantee skill. A displayed curve should connect only computed points and break across missing windows; a sinusoidal PCI curve must not be fabricated.

Reproduction identifiers: model `weighted-analog-v1.3`; scope `site-18m-v2`; dataset hash and source data/code commits are recorded above and in release metadata. Scaler cutoff is separately retained in the computational bundle. Immutable source snapshots and result hashes are linked to the research release. Public materials contain permitted derived results, not the original NetCDF or FES atlas. Provider attribution and license terms apply to FES, Copernicus Marine and Open-Meteo.

## References

- AVISO. *FES2022 handbook*. https://www.aviso.altimetry.fr/fileadmin/documents/data/tools/hdbk_FES2022.pdf
- AVISO. *License*. https://www.aviso.altimetry.fr/fileadmin/documents/data/License_Aviso.pdf
- Copernicus Marine. *Global Ocean Physics Analysis and Forecast*. https://data.marine.copernicus.eu/product/GLOBAL_ANALYSISFORECAST_PHY_001_024/services
- Copernicus Marine. *Service Commitments and Licence*. https://marine.copernicus.eu/user-corner/service-commitments-and-licence
- Open-Meteo. *ECMWF API*. https://open-meteo.com/en/docs/ecmwf-api
- Open-Meteo. *Marine Weather API*. https://open-meteo.com/en/docs/marine-weather-api
- Open-Meteo. *Terms*. https://open-meteo.com/en/terms
