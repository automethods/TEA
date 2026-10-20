---
doc: manuscript/calculations/battery-sizing.engdoc.md
type: calculation
status: active
authority: normative
component: battery
summary: Battery mass, trip energy and range equations evaluated by engdoc.
read-first: [ENGINEERING_DOCUMENT_MODEL.md]
roadmap: [R-20]
sdocProfile: engineering-worksheet/0.1
documentId: vehicle-battery-sizing
revision: 1
language: uk
numericProfile: float64
calculationEngine: mathjs-safe/0.1
---

# Маса батареї та запас ходу

Доступна місткість E_u відповідає показаним BMS 0–100% SOC. Повна
місткість — окрема паспортна властивість, яка не замінює E_u.
Питома енергія rho_u має ту саму доступну основу та стосується всього
пакета, включно з корпусом і охолодженням. M_b — маса автомобіля без
батареї та корисного навантаження. Чисельний інтегратор повторює вибраний
профіль до SOC_min; c_b — середня витрата хімічної енергії на цьому пробігу.

:::source {#source.project-input}
title: Interactive project input
kind: project-record
verificationStatus: user-supplied
:::

:::source {#source.project-derivation}
title: Побудова цього проєкту — співвідношення, якого джерела не друкують
kind: project-input
:::

:::input {#input.battery-usable-energy}
symbol: E_u
valueType: quantity
canonicalUnit: kWh
sourceRef: source.project-input
:::

:::input {#input.battery-specific-energy}
symbol: rho_u
valueType: quantity
canonicalUnit: Wh/kg
sourceRef: source.project-input
:::

:::input {#input.battery-base-mass}
symbol: M_b
valueType: quantity
canonicalUnit: kg
sourceRef: source.project-input
:::

:::input {#input.battery-soc-initial}
symbol: s_0
valueType: float64
sourceRef: source.project-input
:::

:::input {#input.battery-soc-min}
symbol: s_min
valueType: float64
sourceRef: source.project-input
:::

:::input {#input.battery-gross-mass-limit}
symbol: M_lim
valueType: quantity
canonicalUnit: kg
sourceRef: source.project-input
:::

:::input {#input.battery-range-consumption}
symbol: c_b
valueType: quantity
canonicalUnit: kWh/km
sourceRef: source.project-derivation
:::

:::calculation {#calc.battery-pack-mass}
purpose: Маса батарейного пакета за доступною питомою енергією.
output:
  id: value.battery-pack-mass
  symbol: M_bat
  valueType: quantity
  canonicalUnit: kg
expression: E_u / rho_u
sourceRefs: [source.project-derivation]
equationNumber: "3.9"
:::

:::calculation {#calc.curb-mass}
purpose: Власна маса автомобіля з вибраною батареєю.
output:
  id: value.curb-mass
  symbol: M_0
  valueType: quantity
  canonicalUnit: kg
expression: M_b + E_u / rho_u
sourceRefs: [source.project-derivation]
equationNumber: "3.3"
:::

:::calculation {#calc.battery-payload-capacity}
purpose: Допустиме корисне навантаження після встановлення батареї.
output:
  id: value.battery-payload-capacity
  symbol: Q_lim
  valueType: quantity
  canonicalUnit: kg
expression: M_lim - M_b - E_u / rho_u
sourceRefs: [source.project-derivation]
equationNumber: "3.10"
:::

:::calculation {#calc.battery-trip-energy}
purpose: Доступна енергія від початкового SOC до резерву.
output:
  id: value.battery-trip-energy
  symbol: E_trip
  valueType: quantity
  canonicalUnit: kWh
expression: E_u * (s_0 - s_min)
sourceRefs: [source.project-derivation]
equationNumber: "8.8"
:::

:::calculation {#calc.battery-range}
purpose: Запас ходу за повторенням вибраного профілю до резерву SOC.
output:
  id: value.battery-range
  symbol: L_bat
  valueType: quantity
  canonicalUnit: km
expression: E_trip / c_b
sourceRefs: [source.project-derivation]
equationNumber: "8.9"
:::
