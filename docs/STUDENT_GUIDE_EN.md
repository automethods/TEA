# Technological calculation and improvement of a multi-brand service station

## Student methodical guide

**Teaching pilot • 2026**  
Passenger cars and light commercial vehicles. Four working positions. Workload calculation, work scheduling, diagnostic decision-making and justification of an improvement.


Online-edition note: worksheet names and cell references belong to the original teaching materials. A spreadsheet is not included in this online edition; use the named input fields and numbered sections in the application.

## 1. Purpose of the project

Your task is to justify how an existing service station can complete the specified orders within the agreed deadlines. You must establish the necessary work, assess the workload on people and equipment, construct a feasible schedule and test one change to the organisation of work.

The main planning unit is the **work order**, which may contain several sequential operations. The number of working positions, total person-hours and the technical decision for a particular vehicle are considered within one model.

The project outcome is a checked proposal that you can explain to a workshop manager: what constrains completion, which change you propose, what results you expect and which assumptions make those results valid.

After completing the work, you should be able to:

- Convert a list of customer requests into operations with defined durations, sequences and resources.
- Distinguish labour demand, working-position occupancy and the time a vehicle spends at the station.
- Calculate workload and available resource time over the same period.
- Identify scheduling conflicts and assess the consequences of delayed parts or changed employee availability.
- Support a diagnostic conclusion with measurements and verify the result of the work performed.
- Relate equipment selection and planning to the actual operations.
- Distinguish source data, teaching-case data and your own assumptions.

## 2. Teaching station profile

### 2.1. Initial situation

The case concerns an existing multi-brand station for passenger cars and light commercial vehicles. The dataset contains 38 work orders and 57 operations: 12 diagnostic orders, 10 maintenance orders, 7 mechanical repairs and 9 wheel-service orders. The case does not describe a real business. Work orders, durations, deadlines, availability schedules and measurement results are **synthetic teaching data**.

| Identifier | Purpose of the working position |
|---|---|
| B1 | General maintenance and repair |
| B2 | General maintenance and repair |
| B3 | Wheel-service and wheel-alignment work |
| B4 | Diagnostic operations according to the compatibility matrix |

Permitted combinations of operation, employee and position are specified in the calculation workbook. Similar operation names do not automatically justify moving work to another position or assigning another employee.

The main horizon is five working days, 5–9 October 2026, labelled Д1–Д5. Д6 and Д7 are 12 and 13 October; these days show the unfinished baseline work carried forward. Time is local to the station, Europe/Kyiv. Each day's working intervals are **08:00–12:00 and 13:00–17:00**. The 12:00–13:00 lunch break is excluded from available time. The scheduling increment is 30 minutes. Operations in this case are indivisible and cannot cross the lunch break or the end of the working day.

For diagnostic orders other than O01, the agreed scope ends with diagnosis and a report. Completion of such an order does not mean that every identified defect has been repaired.

### 2.2. Scenarios

| Scenario | Purpose |
|---|---|
| Baseline | Assess the existing organisation of work; the diagnostician is available during the first half of the working day |
| Improved | Test an extra two hours of diagnostician availability after lunch each day; the number of positions and the order list stay unchanged |
| Manual | Independently reschedule the work under the assignment's changed condition and demonstrate that the resulting plan is feasible |

The baseline and improved schedules in the workbook are worked examples for studying the model. Your independent result consists of analysing their differences, completing the manual variant and making a technically justified decision. Copying a prepared schedule does not replace these tasks.

### 2.3. Model boundaries

Each operation is carried out by one employee. Active work time is specified to the nearest half hour. The case does not model random equipment failures, every possible rework task, movement between positions or other processes unless they are explicitly included in the data.

The specified calendar is the available time for the modelled operations. Do not apply another productivity or time-utilisation factor without explicitly changing the initial conditions: doing so could count the same time allowance twice.

An improvement conclusion applies to this dataset and its constraints. Before proposing a change at a real station, separately check actual durations, work scope, employee competence, equipment documentation and site conditions.

## 3. Time, labour demand and working positions

### 3.1. Four different quantities

| Quantity | Unit and meaning | Decision it supports |
|---|---|---|
| Standard or billed labour | Standard hours from an applicable source or accounting rules | Work estimates and payment, when these data are supplied |
| Active labour demand | Person-hours of actual or specified employee work | Employee workload |
| Position occupancy | Bay-hours during which a position is unavailable to another vehicle | Working-position capacity |
| Time to completion | Elapsed time from arrival until the last mandatory operation is finished | The promised customer deadline and the vehicle's length of stay |

In this case, one active hour of an operation performed by one person equals one person-hour. However, the work order's overall time also includes waiting between operations. Do not extend this equality to tasks with several workers or to other businesses.

In this case, the vehicle releases its position after each operation and waits in parking for the next stage or for parts. Waiting increases time to completion but adds neither person-hours nor bay-hours. Parking capacity and transfer time are not separately constrained. Check this rule before applying it to another station. Examples of current workshop-management systems also distinguish work status, waiting for parts, bay occupancy and labour time. [S05, S06]

### 3.2. Working time and elapsed time

One working day contains eight available hours, although the interval from 08:00 to 17:00 spans nine elapsed hours. Night-time hours also count towards elapsed time to completion but do not create staff or equipment availability.

Use a **day-and-time pair**, for example Д2 10:30. In this dataset, Д1 is Monday 5 October 2026; Д6 is Monday 12 October. The index counts working days, whereas elapsed time includes weekends. Finishing exactly at the promised time counts as on time. Completion means finishing all mandatory operations and checks, rather than the main repair alone. This case does not separately predict when the customer actually collects the vehicle.

An operation ending at 12:00 may occupy the final interval before lunch. An operation starting at 12:00 violates the calendar. Entering 1.5 hours of work starting at 11:00 also violates the indivisibility condition.

## 4. Preparing the data

Start by reading the workbook profile, field legend and checking section. Create your own copy. Record your surname or student identifier, assignment variant and completion date. Change only the marked input cells; formulas must remain available for inspection.

Check the following relationships:

1. Every operation belongs to an existing work order.
2. Every operation has a duration, required competence and permitted position.
3. A preceding operation finishes before the next one starts.
4. Parts-readiness time is assigned to the operation that needs the parts. Diagnosis may precede parts arrival if the work permits it.
5. The promised deadline applies to completion of the whole work order.
6. A missing or invalid measurement has not been replaced by a physical value of zero.

Keep a short assumptions register in your report: parameter, value, unit, origin and purpose. Label teaching inputs “case data” and your own changes “student assumption”. Exact production standards and limit values require an applicable source identifying the vehicle, system or equipment.

### 4.1. Using the calculation workbook

| Sheet or field | Action |
|---|---|
| Керування B5 | Select 1 — baseline, 2 — improved or 3 — manual scenario |
| Керування B6 | Select working day 1–7 for the chart view |
| Керування B7 | Keep 34 for condition М1: parts for O29-01 become ready on Wednesday at 09:00 |
| Сценарії H6:J62 | In the manual scenario, edit the start, position and employee by operation identifier |
| План and Графік | Check active assignments and simultaneous resource occupancy |
| Замовлення and Результати | Check completion, deadlines and summary indicators |
| Ресурси and Операції | Read calendars, compatibility, durations and dependencies |
| Місяці and ABS | Perform the aggregate demand analysis and technical exercise |
| Довідники | Check sources and the meaning of supporting labels |

The start code is the zero-based index of a half-hour working interval. 0 means Monday 08:00; 8 means Monday 13:00; 16 means Tuesday 08:00; 32 means Wednesday 08:00; 34 means Wednesday 09:00; 40 means Wednesday 13:00; 80 means the following Monday 08:00. Codes skip lunch, nights and weekends. For example, a start of 32 and a duration of 8 intervals means finishing on Wednesday at 12:00, rather than 13:00. Use the displayed date and time to calculate elapsed waiting, rather than subtracting codes.

The workbook recalculates the consequences of entered assignments. It does not automatically search for a new schedule. After changing B7, the manual assignments initially remain as in the improved example; the detected inconsistency is the starting point of the exercise.

## 5. Calculating workload and available time

### 5.1. Labour demand

For operations with one employee, total labour demand is:

\[
H_{\mathrm{праці}}=\sum_i \tau_i,
\]

where \(\tau_i\) is the active duration of operation \(i\), in hours, and \(H_{\mathrm{праці}}\) is person-hours over the selected period.

For an aggregate calculation by job type:

\[
H_{\mathrm{праці}}=\sum_j N_j\ell_j,
\]

where \(N_j\) is the number of jobs of type \(j\), and \(\ell_j\) is the justified average labour demand per job of that type. State the source of the average. Do not confuse the labour demand of a single operation with that of a whole work order.

Calculate workload separately by employee, required competence and job type. Diagnostic operations are included in the overall total. Do not add them a second time when preparing the summary table.

### 5.2. Working-position occupancy

For position \(r\):

\[
H_r=\sum_i b_{ir},
\]

where \(b_{ir}\) is the time for which operation \(i\) occupies position \(r\). Use assignments from the active scenario. Even when labour demand and position occupancy have identical numerical values, label them with different units.

### 5.3. Available time and loading factor

The available time of resource \(C_r\) equals the sum of its permitted working intervals. For a position fully available over the five specified days, this is \(5\times8=40\) bay-hours. Use each employee's own calendar.

\[
u_r=\frac{H_r}{C_r}\times100\%.
\]

Divide quantities for the same resource, scenario and period. A result above 100% means that demand exceeds available time. A result below 100% is only an aggregate check: the work may still be infeasible because of deadlines, sequence, parts availability or simultaneous demand for several resources.

The hours of one multi-skilled employee cannot be counted in full in two independent time budgets simultaneously. Their actual assignments must fit within a single calendar.

### 5.4. Monthly and weekly data

The monthly table describes aggregate demand during the teaching year. Use it to analyse the work mix and specified seasonality. Sum the months for an annual quantity. If annual labour demand is needed, state the adopted labour demand for each group and the limits of this generalisation.

The detailed Д1–Д5 work orders are intended to check operational feasibility. They are not a random representative sample. Multiplying this week's labour demand by 52 without a separate justification does not constitute an annual programme calculation. The annual table and weekly case serve different educational purposes; their totals do not have to agree after simple scaling.

## 6. Analysing and constructing the schedule

### 6.1. Checking the baseline example

Select the baseline scenario. Trace one work order from arrival to completion. Identify its operations, employees, positions, waiting periods and mandatory final check.

Use the calculation results to identify which resources constrain completion. Support the conclusion with two kinds of evidence: total workload relative to available time and specific operations in the schedule. The highest percentage in a table is not sufficient by itself.

Record the number of work orders completed within the horizon, the number completed on time, unfinished work and reasons for delay. An order that finishes on Д6 or Д7 is not completed within the first week. Its future completion time may be shown separately; do not include it among the orders finished by Friday.

### 6.2. Analysing the improved example

Select the improved scenario and repeat the checks for the same work orders. Complete the comparison:

| Indicator | Baseline | Improved | Explanation of the change |
|---|---:|---:|---|
| Labour demand of the specified operations, person-hours | | | |
| Available diagnostician time, h | | | |
| Completed work orders, count | | | |
| Work orders completed on time, count | | | |
| Unfinished work orders, count | | | |
| Detected conflicts, count | | | |

Check whether only available time changed or whether the work scope also changed. Identify at least one result that extra diagnostician hours improve and one constraint that they do not remove on their own. If an indicator remains unchanged, explain why using the data.

### 6.3. Independent manual variant

**Mandatory changed condition М1:** for operation O29-01, parts become ready on Wednesday 7 October at 09:00 instead of 08:00. Start from the improved calendar. Edit the manual plan so that every work order retains its promised deadline. Repair O29-01 takes 3.5 hours; the operation cannot cross lunch. Record the condition before editing. Move operations only within the permitted calendars, compatibility rules and parts availability. Preserve operation identifiers: deleting difficult work is not a valid way to eliminate a conflict.

After each substantial change, check that:

- An employee does not perform two operations simultaneously.
- A working position is not occupied by two vehicles simultaneously.
- The work sequence for a vehicle is respected, including prohibitions on incompatible simultaneous operations.
- Work fits within the calendar; the employee and position match the operation.
- An operation starts after vehicle arrival, completion of its predecessor and readiness of the required parts.
- Work-order completion time includes every mandatory operation, including verification of the result.

Show your own assignment or timing changes needed for rescheduling. For each, record what changed, which conflict or delay it removed and which side effect arose. Also check that moving the main operation has not left its inspection operation scheduled before the repair.

### 6.4. Additional position-removal experiment

When assigned by the instructor, perform this experiment in a separate copy of the manual plan: stop using B1, move its operations only to the permitted B2 and reschedule them. Do not delete operations or alter position requirements. Confirm that no B1 assignments remain in the manual plan.

First compare demand for general-repair positions with the weekly availability of B2 alone. If available time is insufficient, demonstrate why unfinished work or an additional resource is necessary; completing all 38 work orders by Friday is not required for this additional experiment. Explain what an extra employee can accomplish with the same number of lifts.

Draw a conclusion about a feasible plan. Do not call it “optimal” unless you have compared all admissible solutions or have a separate proof of optimality.

## 7. Technical case: an ABS complaint

### 7.1. Task

The package includes a teaching case involving an intermittent wheel-speed signal. Work with the supplied complaint, diagnostic messages, signal frequencies and electrical-circuit checks.

The workflow is: clarify the complaint → check data applicability → list possible causes → choose a measurement → interpret it → justify the work → verify the result. A stored fault code suggests a system to check; by itself, it does not establish which component must be replaced. [S01]

Do not use general teaching values as technical limits for a specific vehicle. In this case, the geometry, number of signal periods and measurement results are supplied for a calculation exercise.

For the calculation, use r = 0.30 m and z = 48 complete periods per revolution. The teaching threshold for flagging inconsistency is an absolute deviation above 5%. This is an exercise criterion, not a manufacturer tolerance. The model assumes straight-line rolling without braking or wheelspin and equal effective wheel radii. The reference frequency is the median of three channels independently judged serviceable: FL, RL and RR.

Complete three successive stages on the ABS sheet. First calculate the pre-work data and write down three hypotheses. Then use evidence E1–E6 to select an action. Only after making your own decision should you assess the repeat recording and V1–V4. This is a teaching sequence; the data are not password protected. Analyse the prepared recordings; no practical test on a real vehicle is needed for this exercise.

### 7.2. Signal calculation

For the supplied teaching model, calculate speed from signal frequency:

\[
v=3{,}6\,\frac{2\pi r f}{z},
\]

where \(v\) is in km/h; \(r\) is the specified effective rolling radius, m; \(f\) is frequency, Hz; and \(z\) is the number of signal periods per revolution.

Check the units. Compare the result with the reference value defined in the case material. Mark a missing or invalid signal as missing data; it does not prove zero wheel speed. Numerical deviation alone does not yet locate the cause.

For each of the 12 windows, determine the reference frequency, FR speed, deviation and status. Also calculate speed at 140 Hz and the fraction of windows with missing data or a discrepancy above the specified threshold:

\[
\delta=100\frac{f_{FR}-f_{ref}}{f_{ref}}\%,
\]

\[
q=\frac{N_{пропусків}+N_{розбіжностей}}{N_{усіх}}.
\]

Explain why the fraction of inconsistent recording windows does not estimate the probability of annual sensor failure. For the repeat recording, determine the maximum absolute deviation and check V1–V4.

### 7.3. Evidence-based decision

Prepare a table of possible cause, expected indication, supplied evidence and conclusion. Consider at least three different causes consistent with the complaint. For electronic-sensor checks, use the applicable procedure and appropriate measurement type; do not treat a resistance test of an active sensor as a universal check. [S01]

In the process sheet, identify the operation, tool or technical information, required resource, duration, result to record and criterion for proceeding to the next step. Prepare the sheet for the established work. Do not include component replacement unsupported by the data.

Describe post-work verification: restoration of a correct signal, absence of the fault under repeat-check conditions, checking diagnostic-message status under the applicable procedure and documenting the result. Specific driving conditions, electrical limits, tightening torques and initialisation procedures come from documentation for the selected vehicle; do not invent them in the teaching exercise. [S01]

Link the technical decision to the work order: which operation is needed, what must be ready before it starts, where it is carried out and when the vehicle can be declared complete after the verification operation.

## 8. Equipment, layout and a maintenance decision

### 8.1. Equipment selection

Justify three key equipment items for your proposal. For each, demonstrate the connection to specific operations and check at least its intended use, compatibility with the case vehicles, required capacity or measurement capability, space, power supply and necessary accessories.

A catalogue may supply dimensions and capabilities for a specific model. State its date and the equipment designation. A historical catalogue does not confirm current availability, price or installation conditions. If precise data are missing, formulate an equipment requirement rather than inventing a specification.

### 8.2. Inputs for compatibility checks

Use two hypothetical vehicles in this exercise. А: mass 1 700 kg, length 4.50 m, width 1.80 m, height 1.55 m, wheelbase 2.65 m, track 1.55 m, 16-inch rims. Б: mass 3 300 kg, length 5.55 m, width 2.05 m, height 2.50 m, wheelbase 3.50 m, track 1.75 m, 16-inch rims. These are teaching parameters; lifting points and mass distribution are deliberately not supplied.

| Equipment example | Source specifications | Further information required |
|---|---|---|
| Nussbaum SMART LIFT 2.40 SL UNI | 4 000 kg; width 3 350 mm; height 2 890 mm [S09] | Lifting points, mass distribution, arm reach, height with the vehicle and foundation |
| Nussbaum COMBI LIFT 4.40 S AMS | 4 500 kg; platforms 4 800 mm; overall dimensions 6 100 × 3 200 mm [S10] | Approach conditions, wheelbase and track; wheel removal requires a compatible axle jack |
| Hofmann geoliner 609 with AC200 | Track 122–244 cm; wheelbase 201–457 cm; rims 12–24 inches [S11] | Compatibility with the specific lift, optical clearances, equipment configuration and vehicle wheelbases |

For each vehicle, mark the selected parameters as “confirmed” or “insufficient data”. Mass below rated lifting capacity does not establish complete compatibility. These brands have not been declared a verified compatible equipment set. Diagnostic equipment and technical information must support the required system and function of the specific vehicle; access to the software alone does not guarantee this. [S07]

### 8.3. Drawings

Prepare a layout showing the four positions with selected equipment, movement routes and a vehicle waiting place if your work organisation requires one. Identify dimensions obtained from sources and those used as sketch assumptions.

A second useful drawing is a resource timetable or technological-process diagram showing diagnostic decision points. It must agree with the calculation workbook and process sheet.

**If the current departmental assignment requires two A1 sheets, that requirement remains in force.** Agree with the instructor how to arrange these materials on those sheets. This pilot does not alter official departmental requirements for format, scale, title blocks or the scope of the drawing component.

### 8.4. One maintenance decision

Assess the manager's proposal: replace all ABS sensors at 100 000 km, or perform one short signal recording each year. Does the case provide evidence for either policy? Complete five fields: system function; failure and consequence; detectable indication; data needed to determine an interval; and the action currently justified. The dataset contains no sensor-life statistics, minimum interval between detectable deterioration and functional failure P–F, or evidence that an annual short test will detect an intermittent contact.

This is a teaching application of selected concepts from the supplied 2002 edition of SAE JA1012. Condition-based maintenance requires a justified indication and sufficient time to respond. The exercise is neither a complete RCM analysis nor a new maintenance schedule. [S08]

## 9. Submission requirements

| Deliverable | Minimum contents |
|---|---|
| Calculation workbook | Completed inputs, manual scenario, visible formulas, checking results and scenario comparison |
| Technical report | Initial situation, assumptions, checked calculations, limitations, your own plan changes and final recommendation |
| Technical case and process sheet | Signal calculation, evidence table, justified work, resources and verification of the result |
| Drawings | Position and equipment layout; timetable or process diagram; format according to departmental requirements |
| Short oral defence | Demonstration of one model change and explanation of its consequences |

A suggested report structure is: profile and objective; data and assumptions; workload and resources; scenario comparison; manual variant; technical case; equipment and layout; recommendation and limitations; sources. The instructor determines the required length. Do not duplicate the entire workbook in prose: include the tables and examples that support your conclusion.

In the recommendation, identify the action, change in an indicator, required resource and applicability conditions. If labour, equipment or service costs are absent from the data, do not claim a precise financial effect. You may identify the data needed for a later economic comparison.

## 10. Assessment: 100 points

| Criterion | Points | Evidence of complete work |
|---|---:|---|
| Data, units and assumptions | 10 | Parameter origins are clear; synthetic data and sources are distinguished; units are consistent |
| Workload and available time | 20 | Correct resource totals; calendars respected; no double counting; annual and weekly analyses distinguished |
| Feasibility of the manual schedule | 25 | Compatibility, calendars, sequence and parts readiness respected; changes justified; unfinished work reported honestly |
| Diagnostic case | 20 | Correct calculation, interpretation of missing data, comparison of causes, evidence-based decision and verification |
| Equipment and drawings | 10 | Selection follows from operations; specification sources identified; drawings agree with the calculation |
| Comparison and recommendation | 10 | A causal link is shown between the resource change and the result; the conclusion has applicability limits |
| Oral defence and reproducibility | 5 | The student explains a formula, locates primary data and demonstrates the consequences of a change |
| **Total** | **100** | |

Before submission, check that your result can be reproduced from the file, report and workbook figures agree, all unjustified conflicts are resolved and final checks are included in completion time. If the changed assignment cannot be completed within the stated conditions, identify the specific reason and the minimum necessary change in conditions instead of hiding unfinished work.

## 11. Questions for the oral defence

1. Why does extending diagnostician availability not change the labour demand of already specified operations?
2. Does loading below 100% prove that a plan is feasible? Give an example from the case.
3. Which resources does a vehicle occupy while waiting for parts under your adopted work organisation?
4. Why might completion of the last repair operation differ from completion of the whole work order?
5. Which specific evidence distinguishes the established cause of the ABS complaint from alternatives?
6. What happens to the result if a selected position or employee is temporarily removed?
7. Why can the detailed teaching week not be scaled to a year unconditionally?
8. What additional factual data are needed before applying your recommendation at a real station?

