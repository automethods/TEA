---
doc: manuscript/calculations/clutch-diaphragm.engdoc.md
type: calculation
status: active
authority: normative
component: chapter-9
summary: "Chapter 9.3 — the diaphragm spring: release force and the profile's own stress check."
read-first: [Data/Vehicle/docs/clutch_sources.md, manuscript/calculations/clutch.engdoc.md]
roadmap: [R-3]
sdocProfile: engineering-worksheet/0.1
documentId: vehicle-clutch-chapter-9-diaphragm
revision: 1
language: uk
numericProfile: float64
calculationEngine: mathjs-safe/0.1
---

# Розділ 9.3 — тарільчаста пружина

Тарільчаста (діафрагмова) пружина — **альтернатива** пакетові циліндричних
пружин, а не додаток до нього: або одне, або друге. На легкових автомобілях
вона поширена саме через свої властивості — плавне вмикання, рівномірний тиск
на натискний диск і майже незмінне зусилля в міру спрацювання накладок.

Сама пружина — це важіль. Зовнішнім краєм Д₁ вона спирається на кожух,
діаметром Д_с тисне на натискний диск, а вижимний підшипник тисне на неї
зсередини, по Двн.

Виграш у силі — це відношення плечей `P_н/P_вик = (Д_с − Двн)/(Д₁ − Д_с)`.
Отже він РОСТЕ, коли Д_с наближається до зовнішнього краю Д₁, і падає до нуля,
коли Д_с іде до Двн. Тут було написано навпаки.

Книжки називають ще один діаметр — Д₂: внутрішній край суцільної конічної
частини, від якого всередину йдуть пелюстки. У (9.21) він не входить, зате
саме до нього подають рекомендацію Д₁/Д₂ = 1,2…1,5. Тому його відсутність не
скасовує сили вимикання: без нього не перевіряють частки, і документ це каже.

**Про перевірку на міцність.** Вона тут Є — (9.22) і (9.23), — але кожна
книжка рахує СВОЇМ виразом. Перший доданок у них однаковий, а другий
різниться знаком біля товщинного члена й множником 2; для тієї самої пружини
виходить 404 і 862 МПа при спільному допустимому 1400.

Книжки називають різні точки перерізу, у яких рахують напруження. Що саме
через це й відрізняється знак — **висновок цього проєкту**, а не твердження
джерел: вони цього не пояснюють. Множника 2 не пояснює ніщо надруковане.

Звірку обох виразів записано в `Data/Vehicle/docs/clutch_sources.md`.

## Джерела

:::source {#source.method.course}
title: Методичні вказівки до курсового проєкту з розрахунку автомобіля
locator: с. 40
:::

:::source {#source.method.opanasyuk}
title: Опанасюк Є. Г. Методичні вказівки до курсового проєктування «Автомобілі»
locator: с. 32, рівняння (51) і (52)
:::

Запис виразу напруження з чотирма сталими не друкує жодна книжка: це спосіб
цього проєкту тримати два різні рівняння одним виразом. Тому в нього своє
джерело — власна побудова, — а книжку, чиї сталі підставлено, називає рішення
про метод.

:::source {#source.project-derivation}
title: Побудова цього проєкту — співвідношення, якого джерела не друкують
kind: project-input
:::

## Що заходить ззовні

Потрібну силу стиснення порахував підрозділ 9.1: саме її тарільчаста пружина
й має створити.

:::var {#value.clutch-required-clamp-force}
name: P_n
type: quantity
canonicalUnit: N
value: 0
:::

## Прийняті величини

Спершу ті три діаметри, які читає (9.21): у нього входять тільки вони, і
без решти воно рахується повністю. Внутрішній діаметр суцільної частини Д₂ до
(9.21) не входить — його місце в рекомендації Д₁/Д₂ і в перевірці міцності
(9.22)—(9.23), — тому він і йде далі, разом із рештою величин цієї перевірки.

:::input {#input.clutch-diaphragm-outer}
symbol: D_outer
valueType: quantity
canonicalUnit: m
:::

:::input {#input.clutch-diaphragm-contact}
symbol: D_contact
valueType: quantity
canonicalUnit: m
:::

:::input {#input.clutch-diaphragm-inner}
symbol: D_inner
valueType: quantity
canonicalUnit: m
:::

Далі — величини, потрібні лише перевірці на міцність: внутрішній діаметр
суцільної частини, товщина, висота, властивості матеріалу й чотири сталі
вибраного профілю. Без них (9.21) рахується, а (9.22)—(9.23) — ні.

:::input {#input.clutch-diaphragm-disc-inner}
symbol: D_disc
valueType: quantity
canonicalUnit: m
:::

:::input {#input.clutch-diaphragm-thickness}
symbol: t_spring
valueType: quantity
canonicalUnit: m
:::

:::input {#input.clutch-diaphragm-height}
symbol: h_spring
valueType: quantity
canonicalUnit: m
:::

:::input {#input.clutch-diaphragm-young-modulus}
symbol: E_material
valueType: quantity
canonicalUnit: MPa
:::

:::input {#input.clutch-diaphragm-poisson}
symbol: mu_material
valueType: float64
:::

:::input {#input.clutch-diaphragm-alpha-factor}
symbol: c_alpha
valueType: float64
:::

:::input {#input.clutch-diaphragm-bending-coefficient}
symbol: c_bending
valueType: float64
:::

:::input {#input.clutch-diaphragm-thickness-coefficient}
symbol: c_thickness
valueType: float64
:::

:::input {#input.clutch-diaphragm-modulus-coefficient}
symbol: c_modulus
valueType: float64
:::

## Сила вимикання

Із рівноваги важеля: зусилля на вижимному підшипнику відноситься до сили
стиснення так само, як плече (Д₁ − Д_с) до плеча (Д_с − Двн). Обидві книжки
друкують це рівняння однаково, лише в різних позначеннях — курсова через
відстані b, c, e, Опанасюк через діаметри.

:::calculation {#calc.clutch-diaphragm-release-force}
purpose: Сила, потрібна для вимикання зчеплення з тарільчастою пружиною.
output:
  id: value.clutch-diaphragm-release-force
  symbol: P_release
  valueType: quantity
  canonicalUnit: N
expression: P_n * (D_outer - D_contact) / (D_contact - D_inner)
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.21"
:::

## Логарифмічне середнє діаметрів

Обидві книжки означують його однаково.

:::calculation {#calc.clutch-diaphragm-log-mean}
purpose: Логарифмічне середнє зовнішнього й внутрішнього діаметрів суцільної частини.
output:
  id: value.clutch-diaphragm-log-mean
  symbol: D_log
  valueType: quantity
  canonicalUnit: m
expression: (D_outer - D_disc) / log(D_outer / D_disc)
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.22"
:::

## Напруження в пружині

Один вираз, а числа в ньому — з вибраного профілю. Для курсової методички
c_α = 1, c_зг = 0,5, c_т = −0,5, c_E = 1; для Опанасюка c_α = 2, c_зг = 0,5,
c_т = +1, c_E = 0,5. Кожен набір відтворює надруковане рівняння своєї книжки
точно, і жоден не позичає чужих сталих.

**Сам цей запис із чотирма сталими не друкує жодна книжка** — це параметризація
цього проєкту, спосіб тримати два різні рівняння одним виразом. Тому крок
посилається на власну побудову, а не на обидві книжки одразу: інакше вийшло б,
що обидві друкують і 404, і 862 МПа. Книжку, чиї сталі підставлено, називає
рішення про метод.

:::calculation {#calc.clutch-diaphragm-stress}
purpose: Напруження в пелюстках тарільчастої пружини.
output:
  id: value.clutch-diaphragm-stress
  symbol: sigma_spring
  valueType: quantity
  canonicalUnit: MPa
expression: 2 * P_release * D_disc / (t_spring^2 * (D_inner + D_disc)) + (c_bending * (D_log - D_disc) * (c_alpha * h_spring / (D_outer - D_disc))^2 + c_thickness * t_spring * (c_alpha * h_spring / (D_outer - D_disc))) / D_disc * c_modulus * E_material / (1 - mu_material^2)
sourceRefs: [source.project-derivation]
equationNumber: "9.23"
:::
