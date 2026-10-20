---
doc: vehickle_math_models/modules/README.md
type: readme
status: active
authority: informative
component: technical-modules
summary: Shared road load, provisional battery calibration and native ICE engine-package exchange.
read-first: ["../../TECHNICAL-MODULES.md"]
roadmap: []
---

# Technical modules 0.6.0

The executable calculation foundation is now shared by Automobile, ICE and TEA.
Read [FOUNDATION.md](FOUNDATION.md), [the common contract](../../TECHNICAL-MODULES.md)
and [ownership.json](ownership.json) for the canonical source/worksheet paths,
original hashes, adapters, model variants and independent validation snapshots.

The bundle is **0.6.0**. It includes the existing seven focused modules plus
Automobile kernels, ICE kernels, service/workshop kernels and engine input exchange.
App folders contain local pinned distributions; each page runs independently.
Maps, prototypes, cycle traces and operating observations remain separately
versioned under [../data](../data/README.md).

```sh
node --test --experimental-test-isolation=none --test-concurrency=1 tests/*.test.mjs
node publish.mjs --project=/absolute/path/to/project
```

Update the producer's version first, rebuild its release, then publish reviewed
consumer updates. App `npm run modules:check` verifies its local code and arithmetic
sources offline. Modified consumers and changed same-version releases are refused.
Source data, source evidence and mathematical variants retain their identity.

Public entries are listed in package.json. `createAutomobileModels` composes
individual numerical factories without a browser. ICE and TEA entry points retain
their typed profiles; `../contracts/project-adapters.json` records units and boundary
mapping. Engine/motor/road-load SI adapters remain the normalized cross-project ports.

No physical controller, chapter, source measurement or empirical validation is
created by this migration. The historical model collection and original project
release evidence remain available; their earlier outputs are regression oracles.
