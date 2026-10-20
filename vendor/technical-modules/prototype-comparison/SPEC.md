# Source observation comparison contract

`comparePrototypes(records, ids, {metric,context})` reads up to the host-selected
prototype records and returns separate rows for every source observation. Context
keys contain metric/unit/procedure/subclass/phase/mode/meterPoint/ratingBasis/market.
No averaging, scalar midpoint, unit inference, missing-zero or 0–60 to 0–100
conversion is allowed. Whole original observations are cloned into result rows.
Matching keys do not erase wheel/temperature/test-condition differences.

Unknown IDs are invalid-input; absent metrics are missing-data with missing IDs.
`compareProperty` accepts only the declared unit mapping. Missing numeric values
stay null. Host data withdraws simulation/dry/invalid curb masses before this module;
source records, massPairStatus and limitations accompany property rows. Mass basis
still requires source review and is never harmonised by numerical conversion.

Host controls persist selected IDs/metric/property. JSON views snapshot sources and
compared values. Registered SVGs redraw from frozen query results; UI selectors,
persistence and report citations are host responsibilities. Camera/geometry state
has no role in this module. No calculation coefficients are fitted or auto-applied.
