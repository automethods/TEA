---
doc: manuscript/calculations/clutch-springs.engdoc.md
type: calculation
status: active
authority: normative
component: chapter-9
summary: "Chapter 9 spring assembly — delivered force, actual lining pressure, release clearance and transmitted torque."
read-first: [Data/Vehicle/docs/clutch_sources.md, manuscript/calculations/clutch.engdoc.md]
roadmap: [R-3]
sdocProfile: engineering-worksheet/0.1
documentId: vehicle-clutch-chapter-9-springs
revision: 1
language: uk
numericProfile: float64
calculationEngine: mathjs-safe/0.1
---

# Розділ 9, крок третій — натискні пружини

Рівняння (9.9)—(9.15): сила, що припадає на пружину, потрібний діаметр дроту,
межа його міцності й кількість витків.

Тут дві різні перевірки, і плутати їх не можна.

**Перша — міцність дроту**: чи витримує прийнятий дріт розрахункову силу,
P_пр.р ≤ P_доп. Рівняння (9.12) дає **межу міцності**, а не те, що пружина
розвиває, і колись його вже було видано за наявну силу — помилка, яку цей
розділ виправив.

**Друга — переданий момент**, і аж тепер вона можлива. Сила, яку пружина
справді створює, рахується з жорсткості (9.16) і **деформації в зібраному
стані** (9.17). Жорсткість — це матеріал і прийнята геометрія; деформацію
автор вносить із конструкції: вільна довжина мінус довжина у зібраному стані,
або значення з паспорта пружини.

**Деформацію не можна виводити з потрібної сили.** Поділити P_пр на
жорсткість означало б повернути те саме коло: сила, порахована з неї, дорівнює
потрібній за побудовою, і перевірка знову проходила б завжди. Тому f вносять
незалежно, і документ це стереже.

## Джерела

:::source {#source.method.course}
title: Методичні вказівки до курсового проєкту з розрахунку автомобіля
locator: с. 38—39
:::

:::source {#source.method.opanasyuk}
title: Опанасюк Є. Г. Методичні вказівки до курсового проєктування «Автомобілі»
locator: с. 30—31, рівняння (47)—(50)
:::

Одне рівняння тут не з книжки, і воно позначене окремим джерелом: (9.12) —
обернене (9.11). Джерела ведуть розрахунок лише в один бік, тож зворотний
напрям — побудова цього проєкту, а не метод джерела.

:::source {#source.project-derivation}
title: Побудова цього проєкту — співвідношення, якого джерела не друкують
kind: project-input
:::

## Що заходить ззовні

Потрібну силу стиснення порахував другий крок; вона заходить сюди під своїм
іменем.

:::var {#value.clutch-required-clamp-force}
name: P_n
type: quantity
canonicalUnit: N
value: 0
:::

Дійсний середній радіус — теж із другого кроку: без нього немає моменту.

:::var {#value.clutch-mean-radius}
name: R_c
type: quantity
canonicalUnit: m
value: 0
:::

:::var {#value.clutch-lining-area}
name: A_lining
type: quantity
canonicalUnit: m^2
value: 0
:::

## Прийняті величини

:::input {#input.clutch-spring-count}
symbol: z_spring
valueType: float64
:::

:::input {#input.clutch-spring-mean-diameter}
symbol: D_spring
valueType: quantity
canonicalUnit: m
:::

:::input {#input.clutch-spring-wire-diameter}
symbol: d_wire
valueType: quantity
canonicalUnit: m
:::

:::input {#input.clutch-spring-release-factor}
symbol: c_release
valueType: float64
:::

:::input {#input.clutch-spring-uneven-factor}
symbol: k_uneven
valueType: float64
:::

:::input {#input.clutch-spring-allowable-shear}
symbol: tau_allow
valueType: quantity
canonicalUnit: MPa
:::

:::input {#input.clutch-spring-travel}
symbol: travel
valueType: quantity
canonicalUnit: m
:::

:::input {#input.clutch-spring-shear-modulus}
symbol: shear_modulus
valueType: quantity
canonicalUnit: MPa
:::

:::input {#input.clutch-spring-dead-coils}
symbol: dead_coils
valueType: float64
:::

:::input {#input.clutch-spring-adopted-coils}
symbol: n_adopted
valueType: float64
:::

:::input {#input.clutch-spring-installed-deflection}
symbol: f_installed
valueType: quantity
canonicalUnit: m
:::

:::input {#input.clutch-spring-installed-length}
symbol: L_installed
valueType: quantity
canonicalUnit: m
:::

:::input {#input.clutch-friction-coefficient}
symbol: mu
valueType: float64
:::

:::input {#input.clutch-friction-surfaces}
symbol: z
valueType: float64
:::

## Сила однієї пружини

Силу стиснення ділять між пружинами. Опанасюк додає сюди ще й протидію
відтяжних та відтискних пружин — 5…8 % від P_н; курсова методичка ділить саму
P_н. Множник `c_release` несе цю розбіжність: 1,00 в одній книжці й
1,05…1,08 у другій.

:::calculation {#calc.clutch-spring-force}
purpose: Сила, що припадає на одну натискну пружину.
output:
  id: value.clutch-spring-force
  symbol: P_spring
  valueType: quantity
  canonicalUnit: N
expression: c_release * P_n / z_spring
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.9"
:::

## Розрахункова сила пружини

Пружину рахують на міцність не за робочою силою, а за тією, що виникає при
вимиканні зчеплення: додаткова деформація збільшує зусилля. Множник 1,2 — з
джерела; `k` = 1,1…1,2 враховує розкид довжин і жорсткостей самих пружин.

:::calculation {#calc.clutch-spring-design-force}
purpose: Розрахункова сила пружини при вимиканні зчеплення.
output:
  id: value.clutch-spring-design-force
  symbol: P_design
  valueType: quantity
  canonicalUnit: N
expression: 1.2 * k_uneven * P_spring
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.10"
:::

## Потрібний діаметр дроту

:::calculation {#calc.clutch-spring-wire-required}
purpose: Потрібний діаметр дроту пружини за допустимим напруженням кручення.
output:
  id: value.clutch-spring-wire-required
  symbol: d_required
  valueType: quantity
  canonicalUnit: m
expression: cbrt(8 * P_design * D_spring / (3.141592653589793 * tau_allow))
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.11"
:::

## Межа міцності прийнятого дроту

Далі — те, чого джерела не друкують, і це сказано прямо: рівняння (9.11)
**обернено**. Книжка веде його в один бік — від потрібної сили до діаметра
дроту; тут із прийнятого дроту виводять силу, за якої його напруження сягає
допустимого.

Це **межа**, а не наявна сила. Скільки пружина справді тисне у зібраному
зчепленні, залежить від її жорсткості й деформації в робочому стані, і цього
рівняння про них не знає. Порівнювати з ним можна одне: чи не перевищує
розрахункова сила (9.10) цю межу.

:::calculation {#calc.clutch-spring-allowable-force}
purpose: Гранична сила, за якої напруження прийнятого дроту сягає допустимого.
output:
  id: value.clutch-spring-allowable-force
  symbol: P_allow
  valueType: quantity
  canonicalUnit: N
expression: 3.141592653589793 * d_wire * d_wire * d_wire * tau_allow / (8 * D_spring)
sourceRefs: [source.project-derivation]
equationNumber: "9.12"
:::

## Приріст сили при вимиканні

:::calculation {#calc.clutch-spring-force-increment}
purpose: Приріст сили пружності при вимиканні зчеплення.
output:
  id: value.clutch-spring-force-increment
  symbol: dP_spring
  valueType: quantity
  canonicalUnit: N
expression: P_design - P_spring
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.13"
:::

## Кількість витків

Робоча кількість витків виходить із жорсткості: приріст сили ΔP має настати
саме на додатковій деформації Δf, яку дає вимикання зчеплення — 3 мм для
однодискового й 4 мм для дводискового.

:::calculation {#calc.clutch-spring-working-coils}
purpose: Робоча кількість витків натискної пружини.
output:
  id: value.clutch-spring-working-coils
  symbol: n_working
  valueType: float64
expression: travel * d_wire^4 * shear_modulus / (8 * dP_spring * D_spring^3)
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.14"
:::

:::calculation {#calc.clutch-spring-total-coils}
purpose: Повна кількість витків натискної пружини.
output:
  id: value.clutch-spring-total-coils
  symbol: n_total
  valueType: float64
expression: n_working + dead_coils
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.15"
:::

## Жорсткість прийнятої пружини

Далі — сила, яку пружина справді створює. Вона не має нічого спільного з тим,
скільки від неї вимагають: жорсткість задають матеріал і прийнята геометрія —
дріт, середній діаметр і **прийнята** кількість робочих витків.

Прийнята, а не порахована: (9.14) дає число з дробом. Крок округлення — пів
витка — це **угода цього проєкту**: джерела ряду витків не подають, і
видавати цю дискретизацію за їхню вимогу не можна. Саме округлення — рішення
автора, і воно ж робить наступний крок незалежним.

:::calculation {#calc.clutch-spring-rate}
purpose: Жорсткість прийнятої натискної пружини.
output:
  id: value.clutch-spring-rate
  symbol: C_spring
  valueType: quantity
  canonicalUnit: N/m
expression: shear_modulus * d_wire^4 / (8 * D_spring^3 * n_adopted)
sourceRefs: [source.project-derivation]
equationNumber: "9.16"
:::

## Сила, яку створює пружина

Деформація в зібраному стані — конструктивна величина: вільна довжина мінус
довжина у зібраному зчепленні, або значення з паспорта пружини. Її вносять
**незалежно** від потрібної сили; вивести її діленням потрібної сили на
жорсткість означало б повернути коло.

:::calculation {#calc.clutch-spring-developed-force}
purpose: Сила, яку створює одна пружина при робочій деформації.
output:
  id: value.clutch-spring-developed-force
  symbol: P_developed
  valueType: quantity
  canonicalUnit: N
expression: C_spring * f_installed
sourceRefs: [source.project-derivation]
equationNumber: "9.17"
:::

## Найбільша сила пружини

Дріт перевіряють не за розрахунковою силою (9.10), а за тією, що виникає в
роботі. Найбільша вона при вимиканні: до деформації в зібраному стані
додається хід вимикання Δf.

Це важливо, і саме тут перевірка міцності ледь не лишилася порожньою: поки
порівнювали лише (9.10) з (9.12), більша деформація давала більший момент і
проходила перевірку, хоча дріт при вимиканні вже був би перевантажений.

:::calculation {#calc.clutch-spring-maximum-force}
purpose: Найбільша сила пружини — при вимиканні зчеплення.
output:
  id: value.clutch-spring-maximum-force
  symbol: P_maximum
  valueType: quantity
  canonicalUnit: N
expression: C_spring * (f_installed + travel)
sourceRefs: [source.project-derivation]
equationNumber: "9.18"
:::

## Наявна сила стиснення

Множник відтяжних пружин тут іде у зворотний бік: він забирав частину сили в
(9.9), тому й повертає її тут.

:::calculation {#calc.clutch-spring-net-clamp-force}
purpose: Наявна сила стиснення на поверхнях тертя.
output:
  id: value.clutch-spring-net-clamp-force
  symbol: P_net
  valueType: quantity
  canonicalUnit: N
expression: z_spring * P_developed / c_release
sourceRefs: [source.project-derivation]
equationNumber: "9.19"
:::

## Момент, який передає зчеплення

:::calculation {#calc.clutch-transmissible-torque}
purpose: Момент, який зчеплення передає наявною силою пружин.
output:
  id: value.clutch-transmissible-torque
  symbol: M_capacity
  valueType: quantity
  canonicalUnit: N*m
expression: mu * P_net * R_c * z
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.20"
:::

## Тиск від наявної сили пружин

Підставляючи наявну силу (9.19) у співвідношення (9.8), маємо фактичний
тиск складання. Його порівнюють із прийнятою межею накладки окремо від тиску
за потрібною силою: більший запас моменту може перевантажити накладку.

:::calculation {#calc.clutch-developed-pressure}
purpose: Фактичний тиск накладки від наявної сили прийнятого пакета пружин за (9.8).
output:
  id: value.clutch-developed-pressure
  symbol: q_developed
  valueType: quantity
  canonicalUnit: MPa
expression: P_net / A_lining
sourceRefs: [source.project-derivation]
:::

## Запас до змикання витків

Для попередньої геометричної перевірки повну кількість прийнятих витків
округлюють вгору до цілого й множать на діаметр дроту. Це консервативна
угода проєкту для оцінки суцільної довжини, не паспорт пружини. При
вимиканні довжина складання додатково зменшується на хід вимикання.

:::calculation {#calc.clutch-spring-solid-length}
purpose: Попередня суцільна довжина пружини з прийнятими робочими витками.
output:
  id: value.clutch-spring-solid-length
  symbol: L_solid
  valueType: quantity
  canonicalUnit: m
expression: ceil(n_adopted + dead_coils) * d_wire
sourceRefs: [source.project-derivation]
:::

:::calculation {#calc.clutch-spring-release-clearance}
purpose: Запас довжини до змикання витків при вимиканні зчеплення.
output:
  id: value.clutch-spring-release-clearance
  symbol: s_release
  valueType: quantity
  canonicalUnit: m
expression: L_installed - travel - L_solid
sourceRefs: [source.project-derivation]
:::
