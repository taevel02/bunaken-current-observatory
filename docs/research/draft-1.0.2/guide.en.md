권태훈 / PADI IDC Staff Instructor (#554990)
Contributions: dives and records observations; examines the data; writes and independently publishes the research
Version 1.0.2 · Independent research report · Not peer reviewed

## What does this study do?

After a dive, the observer records: “How much did the current affect my dive today?” The record is considered together with data about sea level, ocean flow, wind and waves. If enough comparable past records become available, the study will try to estimate how strong the current may feel during a later dive window.

This is still an experiment. The current results do not show that tomorrow’s current can already be predicted well. When evidence is insufficient, the result stays blank. A blank does not mean the sea is still; it means the model did not have enough evidence to provide a number.

## PCI is not a current-speed meter

PCI does not measure how many metres the water travels per second. It is a personal scale for how strongly a diver feels the current and how much it changes moving along the route or holding position.

- 0.0: Almost no noticeable influence from current.
- 0.2: Flow is noticeable but has little effect on normal progress.
- 0.4: Drift and differences in effort by direction are clear.
- 0.6: Current clearly affects the route and holding position.
- 0.8: Responding to current has a major effect on dive progress.
- 1.0: The level of the author’s reference experience, which was very difficult.
- Above 1.0: Felt stronger than that reference experience.

One is not a maximum score. A PCI of 0.4 does not mean a 40% chance of danger. A value twice as large does not mean the water moved twice as fast. This scale compares records from the same observer; another diver’s number may not mean the same thing.

### The reference experience at Mandolin

On 19 September 2026, the author rated the whole Mandolin dive Overall 0.7 and a separate strongest moment Peak 1.0. The author recalled that even after adding air to the BCD and finning hard, ascending was difficult, so the wall was used to move upward. This describes one person’s experience. It is not a measurement of water speed or an instruction for others to copy.

Overall describes the whole dive. Peak describes one especially strong event during it. They are not interchangeable.

## What should be recorded after a dive?

Choose the date and dive Site first. Times use WITA, Bunaken local time. Selecting an entry time suggests an exit time 50 minutes later. Confirm or change it to the actual exit time. Exit time is required and must be later than entry time.

Record the overall PCI for the dive. A strong moment can be recorded separately as a Peak event, but a Peak value is not required in the new observation form. Do not invent an unknown time, direction or depth. “None” means the condition was observed to be absent; it is different from “unknown.”

The representative depth defaults to 18 m for now. This is a common model reference for comparing Sites. It does not mean every dive was at 18 m. If you enter temperature, use the value shown by your dive computer. Do not copy a modelled ocean temperature as if you measured it yourself.

Saved records and notes are written to a public GitHub repository. Excluding a record from model training does not make it private. Do not include identifying or private details in notes.

## How are the data combined?

Think of the model as putting together pieces of a puzzle. It does not turn one data source directly into a PCI score.

- FES estimates changes in sea level called tides. Sea level change is not the same thing as current speed.
- Copernicus estimates broad ocean flow and modelled temperature. These are not current speed or temperature measured by a diver at the exact dive spot.
- Open-Meteo adds information about wind, waves and swell.
- Moon phase and salinity can be shown with other information, but they are not currently used to calculate PCI.

The model looks for past dives with similar environmental conditions and considers the PCI recorded for those dives. This is called a Weighted Analog method: it gives more influence to some comparable past records. It requires enough records across different days, a same-Site example and the required environmental inputs. If an important piece is missing, it withholds the number.

## How to read the graph

Check the Site and date first. Each point summarizes a 60-minute window beginning at that time. New points are placed every 30 minutes, so neighboring windows overlap. A point is not a direct measurement at that exact instant.

A higher PCI line means the model estimates a higher perceived intensity based on comparable records. The graph does not tell you whether conditions are dangerous. Tide height, eastward/northward model-current components, wind direction and wave height describe different things and use different units. Their line heights should not be compared as though they were the same measure.

The graph must not draw a line through an unsupported gap. A break means evidence was missing or the model did not pass its conditions. Do not add invented values to make a smooth wave. A blank PCI is not evidence that there was no current.

## What the current results show

The dataset frozen for this report at 2026-10-07T00:05:28Z contains 24 dive records across nine dates. One measured temperature was corrected from 27°C to 28°C in a new revision. Measured temperature is not currently used by the PCI model, so the PCI input records did not change, but the research dataset was recalculated as a new version.

The evaluation that follows actual next-day cutoffs produced no PCI predictions for 24 test observations. This does not mean 24 predictions were wrong. There were no predictions to compare, so accuracy could not be calculated. The correction was saved after that day's first prediction window began. We did not recreate that day's result later and present it as an advance prediction.

A separate calculation using environmental data collected later returned three predictions for 24 cases, but its error was worse than simple baselines. A leave-one-day-out diagnostic returned 21 predictions. It may train on records from later dates, so neither result proves how well the model predicts tomorrow.

The table is sorted by stored observations, from most to fewest. Ties follow the Site registry order. Zero means no public observation is stored here for that Site. It does not mean the sea was still.

| Site, most observations first | Stored observations |
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

There are no saved observations yet for Mike's Point, Tengah, Johnson's Wall, Raymond's Point, Tanjung Parigi and Pangalisang. Modelled ocean velocity from another Site can be shown as environmental information, but velocity alone cannot tell us how strongly a diver would feel the current. These are different kinds of information. Estimating PCI at an unvisited Site requires separate tests that hold out an entire Site. The current dashboard labels cross-Site transfer as a separate, unvalidated experiment. It is not included in this report's frozen results, and a displayed number does not demonstrate accuracy.

The graph draws only PCI values actually calculated by the model and breaks where evidence is missing. It does not invent values to create a smooth sine-like wave. Tide and modelled-current lines may be shown separately where data are available, but they must not be mixed with PCI as though they meant the same thing.

## What remains unknown?

The model must keep being compared with actual dive experiences to learn whether its estimates are useful. At least a month of prospective observations is planned for future work. Site visits are uneven, and one person currently records PCI. We also have not checked how the broad ocean-model grid differs from small walls, slopes and gullies at the dive sites.

More records create more opportunities to check a model; they do not automatically make it accurate. Misses, empty results, and differences in Site coverage all need to be reported. Cross-Site PCI transfer must pass tests that hold out entire Sites. This study is ongoing, and its current estimates must not be used as dive-safety decisions.

### References

- [FES2022 handbook](https://www.aviso.altimetry.fr/fileadmin/documents/data/tools/hdbk_FES2022.pdf)
- [Copernicus Marine ocean physics data](https://data.marine.copernicus.eu/product/GLOBAL_ANALYSISFORECAST_PHY_001_024/services)
- [Open-Meteo Marine Weather API](https://open-meteo.com/en/docs/marine-weather-api)

## Revision supplement: what changes when we keep recording?

PCI records how much the current affected a dive, as judged after leaving the water. Overall describes the dive as a whole; Peak describes the strongest moment. The number does not measure actual current speed or determine safety.

The engine looks for historical dives with conditions similar to tomorrow's. Tide, modelled current, temperature and weather data determine similarity; the Overall PCI recorded on those dives supplies the label. A record does not receive more weight simply because its PCI was high. Similar tides can still produce different experiences at different sites.

New records can be compared with forecasts saved in advance. The comparison does not choose the forecast time that best fits the observed PCI afterward. Missing forecasts remain missing. More records can still leave bias toward frequently visited sites and differences in personal perception.

In the graphs, PCI is predicted perceived intensity, current speed is an ocean-model value in m/s, and tidal height is an FES value in metres. They are different quantities. Gaps indicate missing data or insufficient evidence. This report's results come from the data frozen at publication and do not evaluate the latest forecasts on the dashboard. Research continues; future prospective comparisons will be reported in a separate revision.
