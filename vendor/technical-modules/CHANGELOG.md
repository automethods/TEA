---
doc: vehickle_math_models/modules/CHANGELOG.md
type: changelog
status: active
authority: informative
component: technical-modules
summary: Independently versioned shared module and contract changes.
read-first: ["README.md"]
roadmap: []
---

# Module changes

## 0.1.0 — 2026-10-07

- Add the public SI quantity registry, module manifest and consumption observation contracts.
- Add a headless road-load pilot with separate Automobile, ICE and coastdown variants.
- Record original files, locators, hashes and source-backed model IDs.
- Validate the SI consumption export and compare the pilot with existing implementations across 324 cases.
- Establish staged consumer adoption; current app kernels and visuals remain in their existing projects.

## 0.2.0 — 2026-10-07

- Add battery-consumption 0.1.0: bounded effective terminal-energy prediction and
  fit, numerical scaling, rank refusal and physical coefficient limits.
- Road-load 0.1.1 is adopted by Automobile v0.4.37 cycle integration and offline
  calibration wheel reconstruction through a pinned distribution. Numerical
  variants retain the original results; source snapshots stay independent.
- Add calibration feature exchange schema and canonical SI quantities; retain
  source hashes, observation links, exclusions and whole-test partitions.


## 0.3.0 — 2026-10-07

- Add engine-component 0.1.0 wrapping unchanged ICE native component packages:
  integrity/identity checks, SI crankshaft ports, source fuel interpolation,
  explicit masks/envelopes and private evaluation snapshots.
- Preserve package evidence and origin dependency hashes. Compare all seven
  local EPA engines with ICE and reject altered or inconsistent packages.
- Add canonical shaft power, fuel thermal power, efficiency, LHV and density
  quantities. Automobile v0.4.38 pins the wrapper and uses the package's own
  fuel basis in its existing map input and by-gear cycle calculation.


## 0.4.0 — 2026-10-07

- Add motor-component 0.1.0 with native loss interpolation, signed SI shaft/DC
  ports, motor-only versus combined inverter boundaries, continuous/peak limits
  and source-map regeneration capped at the DC input budget.
- Preserve profile, package identity/hash, evidence, masks and source envelopes;
  compare both boundaries with the unchanged ICE implementation.
- Automobile v0.4.39 imports motor JSON, retains source-cell and module provenance,
  counts standby power and uses continuous demand in cycle and battery range.
- Export both component modules from the bundle. Add the data catalog contract;
  shared data release 0.1.0 preserves 37 local assets and all source references.
- Correct TEA's role to service/workshop calculations; no TEA files are changed.


## 0.5.0 — 2026-10-07

- Add battery–motor feedback, source-context prototype comparison and chassis geometry.
- Preserve source references and optional terminal-voltage envelope checks.

## 0.6.0 — 2026-10-08

- Establish canonical ownership for implemented Automobile, ICE and TEA numerical
  kernels and arithmetic documents; all three applications consume local pins.
- Share native map/engine/motor kernels between ICE and component adapters;
  retain separate physical variants and independent pre-adoption source snapshots.
- Add offline publication/check gates, ownership inventory, source hashes,
  headless Automobile composition and declared legacy profile/unit mappings.
- Add vehicle-engine-inputs/1 with original calculated curves, fuel properties,
  source revisions, evidence and checksum; ICE exports and Automobile imports it.
- Synchronize package version/exports and documentation. No new chapter or physical
  model; data releases and older saved input formats remain unchanged.
