# Multi-brand service-station project

## Instructor guide

**Supporting material for the instructor • 2026**


Online-edition note: worksheet names and cell references belong to the original teaching materials. A spreadsheet is not included in this online edition; use the named input fields and numbered sections in the application.

## 1. Purpose of the pilot

The package supports a transition from a predominantly annual technological calculation to a project linking a vehicle's technical decision, workshop workload and completion of orders over time. The main case is an existing multi-brand service station with four working positions, a mixed set of work orders and one ABS diagnostic case.

All operational data are synthetic. This makes the calculation reproducible and allows controlled changes to constraints. The package is not a statistical description of Ukrainian service stations, does not establish new standards and does not replace departmental requirements for presenting a course project.

The learning outcome is achieved when the student can explain the chain “data → operations → resources → schedule → result” and make a feasible change without hiding conflicts or unfinished work.

## 2. Before teaching starts

Open the shared calculation workbook STO_calculation_UA.xlsx in the software the group will use. Confirm that formulas recalculate and scenario switching changes the results. Review baseline, improved and manual modes. Keep an unchanged control copy for assessment.

Tell students that the baseline and improved schedules are worked examples. Assessment covers their own manual variant, calculations, diagnostic decision and oral defence. A transparent workbook is needed to study dependencies; hiding formulas is not a pilot objective.

Before issuing the assignment, determine:

- The degree of independence: completing inputs, independently calculating selected totals or fully explaining existing formulas.
- The particular changed condition for the manual variant and how to enter it through supported fields.
- Report format and length, the form of oral defence and departmental drawing requirements.
- Sources of precise technical parameters if a real vehicle or equipment is added.

If the curriculum requires two A1 sheets, retain that requirement. Suggested contents are a position/equipment plan and a time or process diagram, but the current departmental assignment determines the actual sheet contents. The pilot does not introduce its own mandatory drawing standard.

## 3. Recommended work sequence

| Stage | Student work | Instructor checkpoint |
|---|---|---|
| 1. Problem definition | Read the profile, distinguish time quantities and trace one work order | The student identifies what is synthetic and explains completion |
| 2. Workload | Check labour and position totals; analyse availability | Units and periods agree; diagnosis is not added twice |
| 3. Worked scenarios | Compare baseline and improved plans | Changed diagnostician time is distinguished from unchanged work scope |
| 4. Manual variant | Enter the specified disruption and reschedule | Resource, calendar, predecessor and parts checks pass |
| 5. ABS case | Calculate the signal, compare hypotheses and prepare a process sheet | Evidence localises the conclusion; missing signals are not converted to zero |
| 6. Project decision | Justify equipment, drawings and a recommendation | Results agree with the workbook; limitations are stated |
| 7. Oral defence | Demonstrate a change to one input | The student predicts the direction of change and explains the result |

This is a learning sequence, not a requirement for a particular number of classroom hours. Stages may be combined or divided to fit the programme. For a first run, work through one order together before students undertake the independent variant.

## 4. Fixed model assumptions

The dataset contains 38 work orders and 57 operations. Four positions B1–B4 are distinct resources. B1 and B2 are for general work, B3 for wheel service and alignment, and B4 for diagnosis. Data determine operation compatibility with positions and employees; students may not assume it arbitrarily.

The main horizon is 5–9 October 2026, Д1–Д5; Д6 and Д7 correspond to 12 and 13 October and show baseline work carried forward. Time is local, Europe/Kyiv. Each full working day consists of 08:00–12:00 and 13:00–17:00. The increment is 30 minutes. An operation requires one employee, is indivisible and cannot cross lunch or the end of a day. Intervals are half-open: one operation ending exactly when the next begins is not a conflict.

A fully available position provides 40 bay-hours per week. For the diagnostician's daily 08:00–12:00 calendar, baseline availability is 20 hours. An extra two hours each day raises it to 30 hours over the same week. For an additional absence variant, recalculate time from the changed calendar.

Available time already represents time allocated to the modelled operations. Adding an arbitrary utilisation factor reduces that budget a second time. A later real-case adaptation may specify different calendars or separately assess unmodelled work, but this must be an explicit model change.

Operation scope and duration stay unchanged between baseline and improved scenarios. Rescheduling does not alter total labour demand. If the labour total changes, check filters, deleted rows, missing orders or confusion between demand and completed work.

A work order is complete when its last mandatory operation, including verification, is finished. Completion exactly at the promised time is on time. An unassigned or unfinished operation must not receive an artificial completion date; report that order separately as unfinished. Д1–Д7 indices count working days. Elapsed time includes nights and weekends; subtracting half-hour interval numbers does not account for them.

Waiting for parts differs from active labour. In this case, a vehicle releases its position after each operation and waits in parking. Waiting adds no bay-hours. Parking capacity and transfer time are not modelled. This explicit simplification must be reconsidered when adapting the model to a real station.

## 5. Reading the results: reference-answer contents

### 5.1. Control totals

| Indicator | Baseline | Improved | Manual reference М1 |
|---|---:|---:|---:|
| Demand across all 38 work orders, person-hours | 100 | 100 | 100 |
| Work orders completed by 9 October 17:00 | 35 | 38 | 38 |
| Work orders meeting the promised deadline | 28 | 38 | 38 |
| Late work orders over the complete plan | 10 | 0 | 0 |
| Work orders carried into the following week | 3 | 0 | 0 |
| Operations completed in the first week | 54 | 57 | 57 |
| Labour completed in the first week, person-hours | 93 | 100 | 100 |
| Mean elapsed time to completion, h | 17.92 | 5.71 | 5.74 |
| Conflicts in checked assignments | 0 | 0 | 0 |

The mean time covers all 38 work orders over the complete plan, including carryover and weekends in the baseline. The three carried-over orders O06, O11 and O12 are already included among the ten late orders; do not add these counts. The baseline plan is feasible over the extended horizon but does not complete all demand in the first week.

By competence, demand is 55 person-hours of mechanical work, 18 hours of wheel service and 27 diagnostician hours. By work-order category: maintenance — 25, mechanical repair — 28, wheel service — 18 and diagnostic orders — 29 person-hours. Those final 29 already include two mechanical-work hours from the ABS order; do not add them to the overall hundred again.

For D1, 27 hours of demand against 20 hours of baseline capacity is 135%. Actual first-week occupancy is 20 of 20 hours, or 100%. In the improved variant, 27 of 30 hours is 90%. Position B4 has 40 available hours; adding another such position does not remove the shortfall in D1 hours.

The independent monthly table contains 1 982 orders and 5 325.8 person-hours using the specified average durations. These values are not obtained by multiplying the detailed week. Annual working days and resource-utilisation factors are not specified, so they do not automatically establish annual staffing adequacy.

### 5.2. Interpretation

For diagnostic orders other than O01, the agreed scope ends with diagnosis and a report. Completion of such an order does not mean that every detected defect has been repaired.

Distinguish demand across all operations from completed work. Loading below 100% does not prove feasibility: the employee, position, equipment and part must be available at the required time, after the predecessor and before the deadline. Support a bottleneck conclusion with specific postponed operations and a checked change in that resource's availability.

Additional D1 hours may make subsequent work available earlier. They do not create parts or alter the agreed scope. Financial benefit is unspecified because costs are absent. Monthly averages and the detailed week are independent teaching data; do not automatically transfer durations or seasonality between them.

## 6. Organising independent work

Keep the baseline and improved examples in the student workbook to check that it works. The independent component must include a condition for which a prepared example is not already a complete answer.

In issued exercise М1, the improved plan is the starting point. Керування B5 = 3, B7 = 34: parts for O29-01 become ready on Wednesday at 09:00 instead of 08:00. Initial manual assignments repeat the improved example and need correction. A 3.5-hour repair cannot fit between 09:00 and 12:00; carrying part of the operation across lunch is prohibited.

One verified solution changes four starts in Сценарії H6:J62; position B2 and employee M2 stay the same:

| Operation | New start code | New interval on 7 October |
|---|---:|---|
| O18-01 | 34 | 09:00–11:00 |
| O18-02 | 38 | 11:00–11:30 |
| O29-01 | 40 | 13:00–16:30 |
| O29-02 | 47 | 16:30–17:00 |

All 38 orders retain their deadlines. This is one admissible schedule; another plan satisfying the constraints receives the same assessment. O29 finishing exactly at 17:00 is on time. If a student moves only the repair, check whether the inspection has been left before the repair.

An additional experiment stops use of B1 in a copy of the manual scenario. All mechanical work requires B1 or B2, totalling 55 bay-hours. B2 alone provides only 40 weekly hours: completion within this horizon is already impossible under the aggregate constraint. Require proof of a shortfall of at least 15 bay-hours and an honest unfinished balance, rather than a feasible weekly plan for all 38 orders. An extra employee does not increase B2 availability. This exercise does not delete the resource from the register; it leaves it without assigned operations, checked by counting B1 entries in the manual position column.

For the oral defence, it is sufficient to ask the student to demonstrate one meaningful change. Before recalculating, ask them to predict the result's direction. A mismatch between prediction and calculation is a reason to check understanding of the dependency, rather than demand a memorised answer.

## 7. ABS case: assessment method

The technical case contains an active wheel-speed sensor and synthetic measurements. The teaching frequency-to-speed conversion parameters do not characterise all ABS sensors. They must be explicitly shown beside the data.

Check three levels of response:

1. **Calculation.** Formula \(v=3{,}6\cdot2\pi r f/z\) uses the correct units; the reference follows the case conditions; missing signals remain invalid observations.
2. **Localisation.** The student compares sensor, encoder and connection-circuit faults against the supplied evidence. The conclusion must rely on additional checks, not just the largest frequency deviation.
3. **Work and verification.** The process sheet includes the action supported by the established cause and repeated checks of the signal and diagnostic state under the specified conditions.

The reference cause in this teaching case is an intermittent connection fault on the vehicle-wiring side, confirmed by the supplied localisation evidence. Do not accept automatic sensor replacement as the only answer when the student ignores this evidence. The E6 action is replacing the defective vehicle-side connector half or repair pigtail using the permitted kit, restoring routing and retention, and performing the specified verification. The case grants M2 the competence for the documented repair of this low-voltage connection; D1 diagnoses and verifies the system.

A stored diagnostic code does not uniquely identify a defective component. Do not accept resistance measurement as a universal active-sensor test. These principles are supported by the HELLA technical source used; numerical tolerances for a particular vehicle must come from its documentation. [S01]

If a student proposes an additional check, assess whether it distinguishes plausible causes, can be performed with available equipment and is needed given the existing evidence. A larger number of tests is not automatically a better result.

A limited analysis of function and failure consequences may be linked to the RCM approach. Do not describe it as a complete RCM study or require a new service interval without suitable data. Identify the downloaded SAE JA1012 edition by year; the pilot materials do not claim that it is the current edition. [S08]

### 7.1. Numerical answer key

For r = 0.30 m and z = 48: circumference 1.884956 m; conversion coefficient 0.1413717 km/h per Hz; at 140 Hz — 19.7920 km/h. The reference channel is the median of FL, RL and RR. The 5% threshold is only an exercise criterion.

| Window | Reference frequency, Hz | FR speed before work, km/h | Deviation before work, % |
|---|---:|---:|---:|
| 1 | 100 | 14.2785 | 1.0000 |
| 2 | 120 | 16.9646 | 0 |
| 3 | 140 | 19.7920 | 0 |
| 4 | 140 | No data | Not calculated |
| 5 | 140 | 9.8960 | −50.0000 |
| 6 | 150 | 21.2058 | 0 |
| 7 | 160 | 22.6195 | 0 |
| 8 | 160 | No data | Not calculated |
| 9 | 180 | 25.4469 | 0 |
| 10 | 200 | 28.2743 | 0 |
| 11 | 220 | 31.2431 | 0.4545 |
| 12 | 200 | 28.2743 | 0 |

Three of twelve windows are inconsistent: two missing signals and one numerical deviation, totalling 25%. This is the fraction of recording windows, not an estimate of annual failure probability. According to E2–E5, the 70 Hz value in window 5 results from lost recognisable periods; the calculated 9.8960 km/h does not prove actual wheel deceleration.

After the work, no windows are inconsistent; the maximum absolute deviation is 0.625% in window 7. Evidence E2–E4 localises the vehicle-connector fault; E5 confirms a consistent signal with the same sensor and encoder through a serviceable test connection. E6 specifies the permitted repair. V2–V4 confirm the required checks; a short recording does not demonstrate fault-free operation under every condition.

### 7.2. Link to work order O01

Arrival — 5 October 08:00; promised completion — 7 October 12:00. Diagnosis D1/B4: 5 October 08:00–10:00. Instead of being ready on 6 October at 08:00, the part is ready at 13:00; this is a five-hour elapsed delay. Repair M2/B2: 6 October 13:00–15:00. Final verification D1/B4: 8 October 11:00–12:00 in the baseline plan, or 7 October 11:00–12:00 in the improved plan.

O01 active labour and position occupancy have the same numerical value: five hours each, 2 + 2 + 1. Elapsed time to completion falls from 76 to 52 hours. Corresponding elapsed waiting between active operations is 71 and 47 hours. This is parking time, not labour or lift occupancy.

### 7.3. Interval decision

Neither replacing every sensor at 100 000 km nor a universal annual short check is supported by this case. No lifetime distribution, detectable precursor with a known P–F interval or evidence of annual-interval sufficiency is supplied. The confirmed defect already disrupts the signal; the currently justified action is to repair it and verify the result. Further analysis needs mileage history, causes, triggering conditions and recurrence records. [S08]

## 8. Assessment rubric — 100 points

| Criterion | Point allocation | What to assess |
|---|---|---|
| Data and assumptions — 10 | 4 origin; 3 units; 3 limits | Inputs are reproducible, assumptions explicit and synthetic values not described as standards |
| Calculation — 20 | 8 labour demand; 6 resource time; 6 interpretation | Correct totals and calendars, no double counting, demand distinguished from completed work |
| Manual plan — 25 | 10 resources; 8 timing dependencies; 7 independent changes | No unjustified conflicts; parts, predecessors and deadlines respected; changes explained |
| Diagnosis — 20 | 6 calculation; 8 evidence; 6 process sheet and verification | Correct signal interpretation, cause localisation, justified action and confirmation |
| Equipment and drawings — 10 | 5 selection; 5 consistency | Equipment supports the operations; drawings match the data and departmental requirements |
| Recommendation — 10 | 5 comparison; 5 conclusion | Effect linked to changed conditions; limitations and data needs identified |
| Oral defence — 5 | 3 explanation; 2 demonstration | The student locates a value's source, explains a formula and the consequences of a change |
| **Total** | **100** | |

Award partial credit for completed components. An identified and honestly explained resource shortfall is not equivalent to a hidden conflict in a plan claimed to be feasible. An infeasible variant may receive full marks for a correct proof if that is what the issued assignment requires.

Repeated use of one incorrect input should not automatically trigger repeated deductions for the same cause. Assess arithmetic error, failure to detect inconsistency and incorrect engineering interpretation separately.

## 9. Common errors and useful feedback

| Error | A question that helps correct it |
|---|---|
| Diagnosis added to total labour a second time | Which source rows already contain these person-hours? |
| Parts-waiting time recorded as labour | What is the employee doing during this interval, and which resource is actually unavailable? |
| Nine hours from 08:00–17:00 treated as available working time | Which intervals does the calendar permit? |
| A new position claimed to solve a shortage of a competent employee | Who exactly will perform the delayed operation, and when? |
| Loading below 100% presented as proof of feasibility | Are all required resources simultaneously available before the promised deadline? |
| A diagnostic code equated with a component defect | Which evidence rules out wiring or encoder faults? |
| Missing signal converted to zero speed | Is this a physical measurement of zero or the absence of a usable measurement? |
| An unfinished order described as on time | Where is the completion time of its last mandatory operation? |
| The week multiplied by 52 unconditionally | Why does this deliberately constructed week represent every season? |
| One found schedule claimed to be optimal | Which admissible alternatives were checked, and how was the best result proven? |

## 10. Adapting to real station data

For adaptation, retain the work-order/operation/resource/time structure while replacing the inputs with anonymised records. Required information includes arrival and completion times, active labour, position occupancy, competence, waiting and promised-deadline rules. Customer personal data are unnecessary for the calculation.

Establish what each field in the management system means: billed hours, work-order opening and time on a lift may describe different events. Agree whether preparation, movement, consultation and inspection are covered. Annual demand requires suitable observations or an explicit forecast.

After the pilot, record ambiguous fields, conflicts students failed to detect and difficulties explaining the results. Clarify these points before expanding the variant bank.
