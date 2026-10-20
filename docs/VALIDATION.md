# TEA 0.5.0 validation — 2026-09-30

- 38 model/regression checks: all class defaults and mixed calculations; independent partition-area balance; through routes at opposite ends; obstruction of the straight driving strip; ranking by building fit, long-vehicle reversing and area; failure when no existing envelope fits; explicit row/access settings and migration.
- Two jsdom integration suites pass, including actual new access/layout controls, room SVG labels, imports/exports, mixed shares, A4/A1 and both workspaces. The station suite performs 24 recalculations. This is DOM behavior testing, not a native browser or print-dialog test.
- Launcher regression checks pass. No runtime install is required.
- Updated mixed example: M1/M3/N1/N2 = 40/20/25/15%. Six posts, four production employees; selected three through and three reverse-out posts. There are no default warnings. Comparison considers 36 candidates. The 2,653.98 m² chosen plan avoids long-vehicle reversing; the 1,727.18 m² all-reverse alternative is shown explicitly.
- Room areas plus production hall plus partition strips reconcile to the internal floor area. External wall thickness is added outside this area. Room labels stay in the lower-right of the drawn view after rotation.
- Shipped PDFs rendered with WeasyPrint: 16 A4 pages and two 841 × 594 mm A1 pages. Plan pages visually inspected, including room areas, access arrows, schedule, legend and title block. SVG model-to-paper scale is checked in tests. Native browser pagination can differ.
- Routes are centreline schematics, not swept-path or turning-radius validation. Candidate search is limited to independent 90° posts with internal aisles; no global-optimum or construction-compliance claim is made.

---

# Validation — TEA 0.4.0

Date: 29 September 2026. Node.js 24.19.0 on Linux.

- 33 core calculation / regression checks passed. They run with the bundled engine, without installing runtime packages.
- Version 0.3.2 browser storage migrates with edited inputs preserved; workspace links operate through sidebar navigation. Two jsdom integration scripts exercise real application handlers: preserved exercises and station design. They cover automatic mixture balancing, ATP/STO and new/existing modes, coordinates, reset, save/reopen, time conversion and both print routes.
- Launcher checks cover Node already on PATH, absent/old Node, custom/default/XDG nvm directories, paths with spaces and useful error messages.
- The mixed example's A4 report and two-page A1 set were rendered, visually inspected and checked for page sizes and off-page text. Main drawing: 1:100; selected heavy post: 1:25. The report has 15 A4 pages. The two A1 pages measure exactly 841 × 594 mm; CSS uses numeric dimensions. A clearance-dimension/rotation regression verifies physical SVG scale without changing model coordinates. Browser print must use 100% and disable browser headers/footers.
- Local HTTP startup and static resources were checked separately. DOM tests are not a native-browser layout or print-dialog test.

Independent checks include a 100-order × 2-hour programme (200 labour hours), ATP with major services replacing minor services (200,000 km, 10 major + 10 minor, 260 labour hours), equipment-cost reconciliation, collision diagnostics, capacity-capped revenue and loss/no-payback cases. The reported M1/M2 31%/69% case automatically provides 5 workers and 5 posts.

Added checks cover outer wall dimensions without changing labour/floor-area economics, windows avoiding gate openings, gate clearance diagnostics, routes for M1/M3/mixed fleets in row/double layouts, blocked manual routes and removal of visible release history. Existing state migration adds missing architectural fields.

Current main-engine limits and assumptions are recorded in `STATION_DESIGN_UA.md`. Previous validation notes below concern the preserved exercise workspace.

---

# Validation — TEA 0.2.1

Date: 29 September 2026. Runtime: Node.js 24.19.0 on Linux. This is a local review release; browser interaction and print-dialog behavior still require local review on the intended computer.

## Automated calculation checks

`bash run.sh --check`: **18 passed, 0 failed**.

The tests compare the new runtime with archived TEA reference results rather than merely checking that formulas return numbers. Coverage includes the three reference schedules, lunch/weekend boundaries, delayed parts, blank inputs, overlaps, ABS, the waiting exercise, ADAS, pilot records, parking, save/reopen validation, expression restrictions and both print templates.

| Check | Verified result |
|---|---|
| Base dataset | 38 orders, 57 operations, 100 labour hours |
| Baseline | 35 orders complete in week 1; 28 on time; 93 assigned labour hours in week 1 |
| Improved | 38 complete in week 1; 38 on time; 100 assigned labour hours in week 1 |
| D1 demand / weekly capacity | Baseline 27 / 20 hours; improved 27 / 30 hours |
| Archived manual-reference solution | Matches archived totals and resource results; no resource violations |
| Manual starting exercise | Detects O29-01 starting before the delayed parts are ready |
| Missing duration/start/parts readiness | Unknown results or explicit diagnostics; not silently interpreted as zero |
| ABS at 140 Hz | 19.7920337176 km/h; 3 inconsistent/missing windows before, 0 after |
| ABS after correction | Maximum absolute reference-frequency deviation 0.625% |
| O01 waiting experiment | Baseline 13 bay-hours, 44 elapsed hours, 6 conflicts; improved 5, 20, 1 |
| Annual workload | 5,325.8 labour hours from the independent annual dataset |
| ADAS outsourced | 06.10.2026 17:00; 1.5 hours late |
| ADAS own work with all prerequisites | 06.10.2026 14:00 |
| ADAS not required | 06.10.2026 11:00 |
| Pilot and parking | 5 requests, 3 accepted, 2 rejected; 7.5 labour hours, 8.5 bay-hours, 3.5 waiting hours; 2 on time; parking peak 2 vehicles |
| Duplicate parking interval | Diagnostic and no confirmed peak |
| Native documents | Current draft 0.3; evaluated state; below the 500-value/cell limit |
| Import | Rejects unsupported state structure; ignores saved expressions/evidence and recalculates |

## Added planning coverage

- All 28 combinations of seven vehicle choices (six classes plus mixed) and four workshop profiles complete the main calculation.
- A 50% M1 / 50% N1 stream produces 2.75 / 4.5 / 2.25 / 2.4 job-hours and 5,922.1 annual labour hours for the original 1,982-order program. Invalid share totals are rejected.
- Two shifts double the bay fund but not the individual worker fund. Zero bay-work share moves all labour off-bay. Impossible 24-hour daily calendars are rejected.
- M3 with the light-workshop preset reports incompatibility; the mixed-workshop preset accepts the chosen representative.
- Version 0.1.0 input migration preserves edited M1 labour, monthly quantities, ABS radius and notes.
- The included mixed-workshop example (50/30/20 M1/N1/N2) has 1,888 orders, 6,248.4 labour-hours and requires 2 bays, 4 workers and an estimated 3 parking places under its stated assumptions.

## Document checks

The actual print HTML was rendered with WeasyPrint 70 and rasterized with PyMuPDF for visual inspection. The mixed-fleet sample A4 report has **18 pages**, and the A3 landscape diagram sheet has **one page**. Inspected tables, repeated headers, Cyrillic text, logo, diagrams, formula labels and page numbering. Short tables stay together; long operation/order tables continue across pages.

These are checks of the print templates, not a claim that the browser print dialog was exercised. The available cloud browser could not open the local server, and a local Chromium renderer could not start in this execution environment. The shipped sample PDFs therefore come from WeasyPrint. A browser may paginate differently.

The application code and generated view templates pass the source checks. An additional jsdom DOM integration check passed against the actual application handlers with 15 recalculations: inputs in sections 1–2, mixed shares, preset changes, preservation of edits, always-open sections, unique input numbers, all table captions, resolved numeric citations and unique document IDs, undo, JSON save/reopen and both print windows. This checks behavior but not native-browser layout, workers or print dialogs. The local HTTP launch and dependency-free package are checked separately during release packaging.

## Suggested local acceptance run

1. Run `bash run.sh`, open the printed address, choose mixed vehicles and the mixed-workshop profile. Check the six shares total 100%, edit one class labour value and inspect section 3.
2. Open `examples/TEA-mixed.json`; inspect the main results above, then edit an operation in the separate reference case and an ABS input. Verify updated results/diagnostics, save JSON and reopen it.
3. Choose another order and day, then open the diagram sheet and confirm those selections appear.
4. Save both documents as PDF, checking A4 portrait and A3 landscape at 100% with browser headers/footers disabled. Compare with the included samples; enter a short conclusion to verify its inclusion in the report.

The source datasets and archived guide texts have their own historical verification records. Their audit counts are not included in the 18-test count above. Historical source-register access dates are not presented as fresh checks of every cited book or website.

## Portable release check

The unpacked release was copied to a clean folder without `node_modules` or `.git`. Its own `bash run.sh --check` passed all 18 tests. Its own `bash run.sh` served eight required HTML/module/data/logo/example routes successfully; `.git`, `node_modules` and `user-projects` requests were denied. The optional history restoration script was checked separately with the shipped Git bundle.

## 0.2.1 regression checks

Share edits were exercised for all six categories from single-class and mixed starting points at 0%, 0.1%, 33.33% and 100%. Checks verify the entered share, total 100%, valid bounds and completed fleet calculations. Separate checks cover zero-other-share transfer, unchanged valid shares, restoring characteristics, invalid cached shares, and rejection of blank/out-of-range edits. DOM checks exercise the actual handlers, cached 0.2.0 recovery, open groups, action placement, captions/input numbering and both print views. The nvm launcher regression checks also pass.
