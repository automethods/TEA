# tool purpose

Build a reproducible two-axle nominal wheel/axle schematic with an optional
body envelope. Domain output is independent of drawing, camera and host UX.

# parameters

All geometry uses SI metres; no dimension defaults. Front axle x=0, x forward,
y left, z up, ground z=0. Rear axle x=-wheelbaseM.

| Name | Type / unit | Meaning / range | Animatable |
| --- | --- | --- | --- |
| wheelbaseM | finite number / m | axle centre distance >0 | false |
| trackFrontM / trackRearM | finite number / m | tyre centre separation >0 | false |
| frontTyre / rearTyre | object | radiusM,widthM >0; nominal unloaded dimensions | false |
| body | optional object | lengthM,widthM,heightM,frontOverhangM,groundClearanceM all >0 | false |
| sources | array | manual declaration or exact source record/field references | false |

Body overall height is measured from ground. Body rear x=frontOverhangM-lengthM.
Body lower plane is groundClearanceM; this is a bounding box, not a shape/clearance
analysis. Unknown overhangs never imply a centred body. Partial body data remains
in host controls but supplies no body envelope.

# constraints

Hard: finite positive required dimensions; tyre width less than its axle track;
complete body dimensions; length > wheelbase+front overhang; clearance < height.
Soft: no packaging, chassis strength, suspension, tyre deflection or travel checked.
Only confirmed two-axle source adoption is supported by the host. Multi-axle and
articulated layouts require explicit axle positions in a future contract.

# commands

Host `chassisAdopt` copies only source-declared dimensions and source identity into
controls; missing dimensions remain blank. Input edits release the source assertion.
`chassisUndo` restores the preceding edit/adoption in this session. Native project
restore is the existing validated host command; it restores controls and regenerates
the same geometry. Commands use existing form change/recalculation/persistence.
No new event bus or domain mutation of SVG/camera/selection is introduced.

# queries

`buildChassis(parameters)` returns status, retained parameters/sources and immutable
by-convention JSON geometry (no hidden model state). `projectPoint(point,view)` maps
a read point into top/side/orthographic 3D coordinates. Host `chassis()` reads controls
without mutating them. Export serializes the same query result.

# animatable fields

No engineering parameter supports timeline animation in this slice. Camera yaw/pitch
are view preferences, interpolate as angles, and never enter domain geometry or its
saved parameters. View input ranges clamp camera controls; a calculation is not sampled.

# validation

Domain validates required dimensions independently of HTML min attributes. Invalid
inputs produce invalid-input/reason and no geometry. Source adoption verifies
axleCount=2; absent per-axle tyres or tracks stay missing. Tyre designation parsing
computes nominal outer diameter from width/aspect ratio/rim inches (0.0254 m/in).

# failure handling

No inferred dimensions or partially drawn invalid wheel geometry. Unknown body data
omits the body box with a limitation. Geometry edits remain in controls for correction.
Undo history is session-local and is not transferred to saved projects. Camera does
not affect undo/model state. No automatic CAD/structural assumptions are adopted.

# module placement

- core/domain: `modules/chassis-geometry/index.mjs`, SI validation and geometry.
- application/app: Automobile adoption/undo/recompute and existing project restore.
- adapters: `prototype-tools.js`, source records and tyre designation to SI parameters.
- feature/module registration: pinned manifest/browser bridge; figure registry for SVG.
- contracts: `chassis-schematic/1` JSON result and parameter contract above.
- infrastructure/persistence/cache: existing host saved form and `views.layout.chassis`;
  SVG projections are derived views, not persistence authority.

# test cases

Positive SI positions, exact JSON reproducibility, invalid/missing tracks, tyre width,
optional body bounds, source adoption, restore, undo, projection independence, SVG
redraw/export, geometry download, report references. Tests in Automobile
`scripts/prototype-tools.test.mjs` and `scripts/browser/prototype-tools.test.mjs`.
