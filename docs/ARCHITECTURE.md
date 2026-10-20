# Technical architecture — TEA 0.3.0

The application is a static, local-first teaching interface. `run.sh` starts a Node built-in HTTP server bound to loopback. No database, cloud API, CDN, remote fonts or runtime package installation is required. It serves ordinary files and does not accept uploaded files or write user state on the server.

## Station design added in 0.3.0

`station-data.js` holds sourced vehicle examples, explicit engineering assumptions, equipment specifications and input validation. `station.js` computes commercial / fleet programmes, separate size groups, posts, staffing, geometry, equipment positions, capacity and economics. The source state persists under `design`; legacy exercise state and profile remain compatible.

`station-view.js` renders the main workflow with all inputs in sections 1–2. `station-drawings.js` produces shared metric SVG geometry; physical millimetre dimensions and chosen scales are retained in A1 output. `station-print.js` builds the A4 report and two A1 sheets. The equipment register, drawing symbols and investment model use the same instances. Edits to bay/equipment coordinates generate geometric diagnostics without silently moving the object again.

`views.js` and `print.js` route between station design and preserved exercises. Station errors are scoped; screen and export show the same error rather than stale figures. EngDoc documents additionally carry fleet programme arithmetic, commercial labour, post funds and economic formulas; layout, rounding and feasibility remain domain JavaScript. The wrapper uses the same newer native draft 0.3 runtime pinned from the supplied workfolder.

The operating-cost model is an explicit teaching budget, not current market quotations. Output contains scope assumptions and source provenance. Layouts are technological sketches, not building or lift installation construction documents.

## Layers

| Layer | Files | Responsibility |
|---|---|---|
| Inputs and source snapshots | `data/*.json` | Fixed case, archived reference metrics, ABS signals, v1.2 additions, bibliography |
| Current project | `src/state.js`, `src/presets.js`, `src/inputs.js`, `src/app.js` | Editable state, validation, local storage, JSON download/import |
| Background calculation | `src/model-worker.js`, `src/model.js` | Recompute a consistent model; reject outdated worker replies |
| Arithmetic documents | `src/calculations.js`, `vendor/engdoc-runtime.js` | Native EngDoc input and calculation nodes, bound expressions, evaluated evidence |
| Domain rules | `src/planning.js`, `src/scheduler.js`, `src/calendar.js`, `src/exercises.js` | Resource feasibility, event ordering, teaching dates, interval overlap, categorical decisions |
| Presentation | `src/views.js`, `src/diagrams.js`, `assets/app.css` | Ukrainian method text, numbered inputs/formulas/figures, editable tables, SVG paths |
| Print views | `src/print.js`, `assets/print.css` | A4 report and A3 diagram sheet from the same evaluated model |

## EngDoc integration

The vendored source comes from the supplied `engdoc_text_workfolder` snapshot, not Automobile's older document schema. The wrapper creates `engdoc-native-draft/0.3` documents and calls `NativeDocumentSession.evaluate` with the current revision. The evaluated evidence, authored native documents and source/number/unit annotations accompany saved project JSON.

Native documents cover operation duration/end arithmetic, ABS conversion and uncertainty, hold duration, class-weighted labour, monthly/annual workload, bay/worker funds, indicative parking/area and ADAS finish times. The schedule is partitioned into ten-operation documents to stay within the native 500-value/cell limit. Each document is independently valid and evaluated; the project envelope groups the scopes.

The application uses the `float64` numeric profile. Units are explicit teaching annotations, **not dimension-checked quantity values** in this release. Source identifiers and display numbering are outside the strict native schema. Calendar conversion, interval sweeps, resource checks, counts and some aggregates are domain JavaScript; this release does not claim that every algorithm is authored in EngDoc.

EngDoc is not an end-user editor here. Imported JSON supplies inputs only; saved expressions and saved evidence are never executed as authoritative state. The application rebuilds its own documents and recalculates. Updating to another draft format requires reviewing the pinned source and rerunning validation; the application does not silently track upstream changes.

## Persistence and packaging

Project file format: `tea-project-file/2`; input state profile: `tea-project/2`. Version 1 files migrate to M1 with the original edited hours/months and other exercise inputs preserved. Browser storage is version-specific. Application versioning and student-project files are separate concerns. The unpacked Drive release carries a Git bundle and optional restore script; downloadable JSON preserves a student's inputs and reasoning.

`vendor/engdoc-runtime.js` is an ESM browser bundle generated with pinned mathjs and esbuild versions in `package-lock.json`. Source and dependency notices are included. Normal operation uses the checked-in bundle. `node_modules`, renderer tooling, temporary files and private student files are excluded from the release.

## Deliberate limits

- Aggregate planning supports six classes, editable order shares and four workshop profiles. It assumes one mix across all job types and months.
- The separate reference schedule retains eight working days, 57 fixed operations and a fixed resource set; assignment and duration editing rather than arbitrary workshop creation.
- At most 20 pilot records and 40 parking intervals.
- No automatic scheduling optimizer, multi-user synchronization or EngDoc authoring UI.
- Browser-native PDF printing; no mandatory server-side PDF service.
- The v1.1 student/instructor guides are retained as source context; the interactive application and this README describe the new workflow.

## State flow in 0.2.0

`evaluateProject` evaluates the fleet mix, then annual labour, then workshop planning. Separate modules evaluate the reference schedule and other exercises. Errors are scoped, so an invalid fleet share suppresses dependent planning results while independent exercises remain available. Profile changes are explicit state mutations with one-level undo; all input groups are permanently open, and input focus is preserved during recalculation. Rendered results and both print views share the same model.

`src/version.js` supplies application/preset versions and the visible release history. The normal server and core tests use the checked-in runtime only. jsdom is a development-only dependency for `npm run test:ui`; it runs real application handlers with a worker adapter to the real calculation model, but is not a native-browser renderer.

## Presentation and share editing in 0.2.1

`balanceVehicleMix` keeps the edited share and transfers the difference through neighbouring active classes. Direct calculation validation still rejects malformed mixes; normal UI edits maintain a 100% invariant. Invalid cached/imported shares are repaired with a notice. The editor rejects blank/out-of-range shares rather than treating them as zeros.

`format.js` supplies stable field identifiers and mandatory table number/caption arguments. Shared formula blocks keep screen and report numbering aligned; source keys are converted into numeric linked citations in visible text nodes. Bibliographic text is held in `data/sources.json`; provenance remains in the source metadata and docs. SVG marker IDs are unique within each document.


## Shared foundation — 2026-10-08

[SHARED-FOUNDATION.md](SHARED-FOUNDATION.md) supersedes earlier numerical ownership
statements. Canonical kernels/arithmetic sources belong to the shared library;
local adapters and pinned copies retain the page and document formats. Source
references, physical variants and previous input formats are preserved.
