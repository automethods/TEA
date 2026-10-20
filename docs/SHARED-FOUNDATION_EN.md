# Shared foundation — TEA 0.5.1

Service/workshop calculations, annual planning, scheduling, exercises and
workshop geometry are now owned by
`My_books/vehickle_math_models/modules/service-workshop`. TEA's source paths
delegate to its pinned local distribution. Forms, editable state, worker
orchestration, views, drawings and printing remain in TEA.

The native arithmetic runtime keeps its reviewed document format and bytes.
Teaching profiles, source identifiers, labour assumptions and calculation
results remain the same. Workshop staffing is not a driver roster; no thermal
model has been added.

Use `npm run modules:check` offline. `npm run modules:publish` is the explicit
reviewed producer update and refuses modified consumer files. Server startup
checks pins; `run.sh` still serves TEA independently of sibling folders.
Saved engineering JSON includes the shared release provenance alongside the
native documents and source annotations. Existing project inputs remain readable.

Other projects can import the headless service/workshop functions using the
existing `tea-project/2` state profile and referenced case data. Their meanings
and units are documented in `vehickle_math_models/contracts/project-adapters.json`.
New numerical work belongs in the shared library before adding its page adapter.
