# Presets and assumptions — app 0.2.1 / presets 0.2.0

All new numerical presets are **SYN-02: synthetic teaching examples**. They make the full calculation runnable and editable; they are not recommended service times, legal category limits, equipment ratings or construction standards. M1 job hours retain the original TEA annual-program example. Other values are authored for this exercise. Class labels follow the M/N category structure in source S16; that source does not substantiate the numerical table below.

| Representative | Length m | Width m | Mass t | ABS radius m | Maintenance h | Mechanical h | Wheel h | Diagnostics h |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| M1 | 4.5 | 1.8 | 2 | 0.30 | 2.5 | 4 | 2 | 2.2 |
| M2 | 6.5 | 2.1 | 4.5 | 0.36 | 4 | 6 | 3 | 3.2 |
| M3 | 12 | 2.55 | 18 | 0.49 | 5 | 8 | 4 | 4 |
| N1 | 5.5 | 2 | 3.5 | 0.34 | 3 | 5 | 2.5 | 2.6 |
| N2 | 7.5 | 2.4 | 10 | 0.43 | 4.5 | 7 | 3.5 | 3.6 |
| N3 | 9 | 2.55 | 18 | 0.50 | 6 | 10 | 4.5 | 4.5 |

Labour is person-hours per order of that job type. A class describes a selected representative; actual vehicles vary within a class. The mass input is only a planning comparison with user-entered workshop capability, not an axle/load/hoist safety calculation.

| Workshop preset | Shifts | Planned bays | Total workers | Parking spaces | Accepted length / width / mass | Monthly count multipliers: maintenance, mechanical, wheel, diagnostic |
|---|---:|---:|---:|---:|---|---|
| Light universal | 1 | 4 | 4 | 6 | 6.5 m / 2.3 m / 3.5 t | 1 / 1 / 1 / 1 |
| Diagnostics / wheel | 1 | 3 | 3 | 4 | 6.5 m / 2.3 m / 3.5 t | 0.4 / 0.3 / 1.5 / 1.8 |
| Commercial fleet | 2 | 4 | 6 | 10 | 10 m / 2.6 m / 20 t | 1.3 / 1.1 / 0.8 / 0.8 |
| Mixed / bus / truck | 2 | 5 | 7 | 12 | 12.5 m / 2.6 m / 22 t | 1 / 1 / 0.8 / 1 |

Monthly quantities are the source monthly dataset multiplied by these factors and rounded to whole orders. Every cell remains editable. Common defaults: 250 working days, 8 hours/shift, 0.85 active bay-fund share, 0.90 individual worker-fund share, one simultaneous worker per bay. Remaining complete values are in `src/presets.js` and visible in section 2.

## Formula assumptions

- Class shares count service orders and total 100%. The same mix applies to each job type and month. The editor preserves the edited share and transfers the difference through neighbouring active classes to keep 100%. If all other shares are zero, it uses the next class. Already-valid mixtures remain unchanged when restoring vehicle characteristics. Invalid mixtures from older saved inputs are repaired with a visible notification; invalid manual values are rejected.
- Weighted job labour = sum of class share × class job hours / 100.
- Annual labour = sum of monthly order counts × weighted job labour.
- Bay labour = sum of annual job labour × editable bay-work fraction; bench labour is the remainder.
- Bay hours = bay labour / simultaneous workers per bay. Required bays = ceiling(bay hours / annual usable bay fund).
- Annual bay fund = days × shift hours × shifts × active share. Individual worker fund = days × shift hours × attendance share. Required workers = ceiling(total labour / individual fund), including bench work. Shift-by-shift staffing and skill allocation need separate scheduling.
- Indicative parking = ceiling(annual orders / annual open hours × total waiting open-hours × peak factor). This aggregate estimate is separate from the pilot's observed interval overlap peak.
- Indicative bay area = (largest selected representative length + 2 × end clearance) × (largest selected representative width + 2 × side clearance). Total area uses planned bays plus editable additional area; external parking land is excluded. The two maxima may come from different classes, deliberately conservative.
- A representative exceeding the workshop's entered length, width or mass causes a compatibility warning. A valid arithmetic result can coexist with that warning.
- ABS uses one selected vehicle's editable radius. It never averages radii over the mixed flow.

## Literature contribution

The supplied Govorushchenko 1984 passage, pp. 289–291 (ST02), informed the separation of bay/off-bay work, work places, waiting/ready vehicles and space needs. Its historical numerical coefficients were not adopted. The original TEA source register's accounts of Markov/Denton and other material remain historical source context, not a claim of a fresh full-book review.

The 38-order reference schedule remains a separate teaching exercise with its original operations/resources. Presets do not silently rescale it. A future detailed mixed-fleet scheduler would require class-specific operations, resource capabilities and workforce skills, beyond this aggregate planning scope.
