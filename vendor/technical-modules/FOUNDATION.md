# Shared calculation foundation 0.6.0

Reusable calculation implementations and arithmetic documents are authored in
this folder. Automobile, ICE and TEA contain verified local distributions and
small compatibility adapters. The standalone pages require their own folders
only. Home remains a publication/navigation assembly; it is not a numerical owner.

| Owner | Calculation scope | Consumer |
|---|---|---|
| `road-load` | Automobile, ICE and measured-coastdown variants | Automobile, ICE |
| `engine-component`, `motor-component` | SI shaft/fuel/DC boundaries and source-map limits | Automobile, ICE kernels |
| `ice-core` | Engine cycle, geometry, gas properties, maps, battery, motor, hybrid/BEV integration, design and native arithmetic | ICE; reusable by other adapters |
| `automobile` | Vehicle mass, wheels, traction, gearing, performance, fuel/cycle energy, battery sizing, mechanical calculations and steering geometry | Automobile |
| `service-workshop` | Service programmes, labour, bays/personnel, workshop geometry, scheduling and teaching exercises | TEA; available to CEA |
| `engine-inputs` | Calculated ICE engine file, validation, original fuel interpolation and Automobile input mapping | ICE export, Automobile import |
| `battery-consumption`, `battery-motor`, `prototype-comparison`, `chassis-geometry` | Existing calibration, electrical coupling and comparison/geometry boundaries | Automobile |

`ownership.json` maps every moved source/worksheet to its producer file and
original SHA-256. Independent before-images live in `validation/origins`.
Origin regression tests use these snapshots, never an app facade that delegates
back to the adopted module. Copied upstream runtimes retain their original bytes,
notices and document-format variants.

Compatibility adapters preserve existing parameter names, units, algorithms,
equation numbering and saved input formats. Normalized cross-project engine,
motor and road-load queries use `contracts/quantities.json`; native rpm, kW,
fuel g/s and project-specific names convert once at that boundary. A local
`p`, `n` or `W` is not sufficient to identify a shared quantity. Automobile's
speed-dependent road resistance and ICE's constant-coefficient resistance stay
separate model variants. The migration adds no physical default or new controller.

Automobile factories receive an explicit dependency context. This context holds
numerical APIs, reference data and worksheet evaluation callbacks, not a form.
The host facade owns global registration and Node filesystem loading. Use the
headless session to compose individual legacy kernels:

```js
import {createAutomobileModels} from './automobile/session.mjs';
const models=createAutomobileModels();
const gearing=models.get('gearbox-ratios');
const result=gearing.electricDriveRatios({
  mode:'gear-final',gears:'3, 1',finalDriveRatio:4,axle:'rear',activeGear:1
});
// Check result.defined. These are declared reduction ratios, not gearbox design.
```

Dataset-dependent calculations need their original referenced data. Worksheet
calculations need their declared evaluator/source callbacks. These dependencies
are explicit; the library never searches another project's form, storage or disk.
ICE and service/workshop entry points retain their original typed input profiles;
their schemas, units and source conventions are listed in
`../contracts/project-adapters.json`. Document runtimes preserve their existing
formats: an adapter assembles the native/engdoc results for each book.

The source `release.json` binds the independently versioned modules and files.
App `vendor/technical-modules/pin.json` additionally binds its arithmetic
worksheet copies. `consumer-provenance.mjs` records the release in saved
engineering output. `npm run modules:check` works offline. After a reviewed
producer update, `npm run modules:publish` updates an app explicitly. Publishing
refuses modified consumer files and changed releases without a newer version.

Before adding a chapter or model: select an existing model/variant, use its
contract and source references, compare current results, then attach the app
adapter. A new calculation belongs here with a manifest, quantity bases,
applicability and focused validation. Editing a pinned app kernel or worksheet
is not a supported way to change its mathematical definition.

Physical limitations remain: Automobile's hybrid energy split is preliminary;
ICE's existing hybrid controllers keep their own assumptions; incomplete real
motor maps are still incomplete. This foundation makes those models reusable
without claiming equivalent methods or additional experimental validation.
