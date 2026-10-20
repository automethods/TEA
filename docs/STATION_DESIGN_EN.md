# Workshop / fleet technological design · TEA 0.5.0

The main screen designs a production workshop. “Separate learning exercises” in the sidebar opens the earlier ABS, ADAS, waiting, scheduling and log cases. Their hours are not added to the main workshop.

## How to carry out the work

1. In section 1 choose a commercial workshop or an owned fleet, and either a new design or a check of existing resources.
2. Check the inputs in section 2. For a workshop, specify order shares, the monthly programme and labour allowances; for a fleet, specify vehicle counts, mileage, maintenance intervals and labour allowances. All initial values are already filled in.
3. Check the manufacturer's vehicle dimensions against the source. The category table defines purpose, seats and category gross mass, rather than one set of dimensions for every vehicle in that category.
4. Sections 3–4 show labour by zone, available time, bays and staffing. A new design calculates these automatically. An existing-workshop check preserves the entered resource limits.
5. Choose lifts and refine prices, geometry and layout. Coordinate inputs move a bay or its equipment. “Restore automatic layout” removes manual coordinates.
6. In section 6 check the building plan and the selected bay's equipment. Equipment numbers match the schedule and cost estimate. A mobile-column set shares one common item number.
7. Check the service rate, wages and investment in section 7. Conclusions must use the volume the business can actually deliver, rather than unlimited demand.
8. Save JSON to resume work. The A4 export contains inputs, equations, substitutions and references. The second export is two A1 sheets: the building and the equipped bay. Select the bay in section 2. Print at 100% without browser headers/footers.

## Meaning of the main assumptions

- Workshop shares are visit shares, identical for every job type and month. Editing transfers the difference to a neighbouring class, preserving a 100% total.
- Labour is calculated separately for each category. Light and heavy vehicles receive separate bay groups; within each group, the maximum envelope is used rather than the mean.
- For a fleet, major service replaces minor service. Tyre and diagnostic work are allocated from total labour without double counting. The major-service interval must be a multiple of the minor interval. Intervals are teaching assumptions, not OEM service schedules.
- The main tyre bay covers removal, fitting and balancing. Wheel alignment and ADAS remain a separate exercise, and their equipment is excluded from the main estimate.
- Bay labour is divided by the simultaneous crew size. Off-bay labour contributes to staffing. Individual available time is not multiplied by business shifts. Staffing cannot be less than one accepted crew; distributing people across shifts requires a calendar schedule.
- Toyota, Mercedes-Benz, MAN and Ford dimensions come from primary manufacturer material for the specified variants. For Isuzu, the catalogue confirms chassis mass; body dimensions are a separate assumption. Axle loads are design assumptions explicitly identified in the interface.
- MAHA technical ratings are separate from sketch symbols and budget prices. Mass/axle load is only part of the check: suitable support points, wheelbase and each wheel's load are required. Tyre sets and compressor are selection specifications, not a ready purchase order for a specific model.
- The plan is a technological sketch. Aisles are an assumed geometric estimate without swept-turn simulation. The project does not calculate structures, foundations, escape routes, fire compartments, ventilation, electrical distribution or the site plan. The MAN electric-bus teaching example does not cover high-voltage traction-system maintenance.
- Parking uses flow and waiting during opening hours; it is excluded from building area. Fleet repair visits are estimated from labour for one workshop repair; the site plan needs its own arrival log.
- Prices, wages, rates, clearances and available-time fractions are editable assumptions. Capital budget includes equipment, installation, area fit-out and contingency. Land/building purchase, parts, taxes and financing are not modelled separately. All prices must use one basis without separate VAT.
- Revenue is limited by demand and capacity. An unsuitable lift gives its group's throughput a zero value. Geometry warnings make the economic result conditional. For a fleet, the result means avoided outsourcing cost, not service sales.

## Examples

- `examples/TEA-improved.json`: new workshop for M1.
- `examples/TEA-mixed.json`: mixed M1 / N1 / N2 workshop; the second sheet shows a heavy repair bay.
- `examples/TEA-atp.json`: fleet of 100 M1 + 20 N2.
- Two ready PDFs for the mixed example: A4 report and a two-sheet A1 set.
- `TEA-mixed-building.svg`, `TEA-mixed-post.svg`: the same scaled vector diagrams without a sheet border.

## Opening older variants

Files from 0.1–0.2.1 preserve previous inputs, shares and teaching records. If no technological design exists, the 0.3.0 set with specified vehicle models is added. Earlier generic dimensions remain in the exercises; the new design uses the explicit vehicles in section 2. Saved result modules are not executed: opening a project rebuilds the calculation from current inputs.

## Release verification

Automated arithmetic checks cover a separate manual reference calculation, all categories, M1/M2 31/69, a mixed fleet, fleet maintenance without double counting, capacity limits, loss, coordinates and saving. DOM checks run the actual field/button handlers with a calculation-worker adapter. They do not test the browser's native print dialog. PDF examples were rendered and inspected; SVG scale is preserved at 100% printing.

## Drawings 0.3.2

The PDF template specifies A1 numerically as 841 × 594 mm, without outer page margins. The border is inset 20 mm on the left and 5 mm at the top, right and bottom, following Appendix D of DSTU 9243.4:2023. The 185 × 55 mm title block is adapted from form H.1 (Appendix H); it is a teaching form without automatic checking signatures, registration numbers or additional original-document tracking boxes. The mark НП is explained as an educational project.

Building and bay drawings are oriented automatically within the drawing field; a scale is selected from a list to fit without cropping. Rotation changes presentation only, not source coordinates. Labels remain horizontal. Numbers 001–003 identify support rooms in the new room schedule; circled numbers identify equipment. The bay shows vehicle dimension chains and clearances from bay boundaries; these do not replace manufacturer installation dimensions.

The A4 report reduces both diagrams and groups them with characteristics; use A1 to read dimensions. For a physical printer, select A1, 100% scale and no browser headers/footers. Verify the saved PDF's page dimensions rather than relying only on an “A1” heading. The supplied 0.3.1 review PDF actually contained A4 pages; the ready 0.3.2 examples were checked as two A1 pages.

## Building plan 0.4.0

External dimensions now include wall thickness, while internal dimensions remain the basis for area and coordinates. Partitions separate reception, storage/component work, welfare and utility rooms. Windows are omitted near gates/exterior doors; the openings schedule shows actual counts.

Each bay receives a schematic route from ВР1; the selected bay also receives a route to ВР2. Row and paired arrangements use a shared side aisle and transverse aisles. Centre-line segments are checked against other bay rectangles. An unsuitable manual route is flagged. Gate/door swing arcs are not vehicle trajectories. Turning radius, body swept envelope and simultaneous two-way movement are not checked.

Connection symbols repeat in the detailed bay and legend. Water/air: DSTU B A.2.4-8:2009, Table 7, 14а/б; sockets: DSTU B A.2.4-19:2008, Table 3, 10.2/10.3. Architectural representation: DSTU 9243.7:2023. All three sources are in the bibliography. В/П/Е on the combined dash-dot route are defined project symbols for separate above-floor services; sizes, flows, pressure, electrical protection and installation levels are not established by this sketch.

The release history is no longer shown in user sections. The current version remains in the header; full history is in files and the Git bundle. Variants from 0.3.2 receive only missing wall/opening parameters; all other entered data is retained.

## Calculated layout 0.5.0

Basis: [36] = VNTU laboratory work 7, defining the two bay types and the suitability of drive-through bays for large vehicles; [37] = section 6.4 of VNTU methodological guidance, covering separate and paired rows. These teaching sources are not current building regulations. Their old regulatory values have not been copied. Independent bays are retained for a mixed repair programme; a production line needs separate coordination of operations and takt time.

Bay counts, staffing and labour are determined first and are not reduced to obtain a compact plan. Automatic mode tests 1–12 bays per row, without exceeding total bay count, separate or paired dead-end rows, and three rules: all dead-end; drive-through from the specified vehicle length; all drive-through. The side aisle is shared and every bay has independent access; a drive-through bay gets a second transverse aisle. Its equipment is placed beside the vehicle, and the equipment width is included in its envelope. Queues and parking outside the building are excluded from the target area.

Candidates are compared lexicographically: 1) fit of the external envelope and height into the specified existing building, where applicable; 2) dead-end bay count for vehicles at or above the length threshold; 3) internal area; 4) perimeter when areas are equal. The editable 8 m threshold, 9 m minimum bay-group width, aisle-width rule L + 2 m and clearances are project assumptions. The objective does not mean maximum profit. The comparison table shows the extra area needed to avoid reversing; the changed area feeds the fit-out budget. If no alternative fits, a warning is issued rather than confirmation of suitability.

Two movement types remain: dead-end = forwards to the stopping point, then reverse into the aisle; drive-through = forwards through the opposite end. Both centre-line routes are checked against other bay rectangles, room boundaries and the clear drive-through lane around fixed equipment. Turning radius, manoeuvring envelope, simultaneous movement and traffic safety are not modelled. All bays are 90° to the transverse aisle; angled bays, external access routes and alternative support-room positions are not searched. Manual coordinates are applied after comparison and may worsen the result.

Rooms 001–004 are bounded by exterior walls, a full-thickness front partition and half the side partitions at room boundaries. Area equations use clear dimensions; door recesses are excluded. Hall 005 occupies the entire area up to the front partition, including aisles. Clear room areas plus partition strips equal internal building area. Room drawings show underlined areas to 0.1 m²; the lower-right sheet position is preserved when the view rotates. The schedule and area labels follow clause 5.3.2 of DSTU 9243.7:2023; fire-hazard categories remain undefined.

Migration from 0.4.0 adds missing fields. Existing manual coordinates select a manual grid; other projects receive automatic selection. Previous bays-per-row and row-type values remain in JSON and are accessible in manual mode. Equipment coordinates are retained; after changing bay type, check warnings or restore automatic layout.
