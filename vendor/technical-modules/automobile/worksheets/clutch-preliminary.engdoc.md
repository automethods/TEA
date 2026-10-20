---
doc: manuscript/calculations/clutch-preliminary.engdoc.md
type: calculation
status: active
authority: normative
component: chapter-9
summary: Chapter 9, stage one (9.1-9.4). Sizing before any lining is adopted, so the method can recommend a table row.
read-first: [Data/Vehicle/docs/clutch_sources.md]
roadmap: [R-3]
sdocProfile: engineering-worksheet/0.1
documentId: vehicle-clutch-chapter-9-preliminary
revision: 1
language: uk
numericProfile: float64
calculationEngine: mathjs-safe/0.1
---

# Розділ 9, крок перший — розміри до вибору накладки

Тут живуть рівняння (9.1)—(9.4) — ті, що працюють ДО вибору накладки.

Розділити довелося через порядок: методика спершу рахує потрібний діаметр, а
потім за ним підбирає рядок таблиці. Поки арифметика була одним документом,
вона вимагала прийнятих діаметрів, щоб порахувати бодай щось, — і автор мусив
вибирати рядок наосліп, а що йому радить метод, дізнавався вже після вибору.
Тепер порядок правильний: спершу Д′, потім порада, потім вибір.

Максимальний момент двигуна вже порахував розділ 4. Сюди він заходить як
override за тим самим ідентифікатором — не перераховується вдруге.

## Джерела

Дві методички розходяться в числах; запис розбіжностей — у
`Data/Vehicle/docs/clutch_sources.md`. Рівняння в обох однакові, тому
формули посилаються на обидва джерела, а прийняті значення несуть провенанс
вибраного профілю.

:::source {#source.method.course}
title: Методичні вказівки до курсового проєкту з розрахунку автомобіля
locator: с. 37—38
:::

:::source {#source.method.opanasyuk}
title: Опанасюк Є. Г. Методичні вказівки до курсового проєктування «Автомобілі»
locator: с. 28—32, рівняння (46)—(52)
:::

## Що заходить ззовні

Максимальний момент двигуна порахував розділ 4. Він заходить сюди **під тим
самим ідентифікатором** `value.maximum-engine-torque` як голий `:::var`: так
у документі лишається одна влада над цим числом. Значення обов'язково
підставляє застосунок; вписане тут число — лише заглушка, і адаптер
відмовляється працювати, якщо прив'язки немає.

:::var {#value.maximum-engine-torque}
name: M_e
type: quantity
canonicalUnit: N*m
value: 0
:::

## Прийняті величини

Кожне число прийнято окремо: профіль радить діапазон, автор бере його
середину або вносить власне значення. Провенанс кожного — у рішенні розділу 9,
а не тут.

**Жодне з них не має вбудованого значення.** Раніше тут стояли нулі, і
документ без жодного введення рахувався «успішно»: нуль у знаменнику давав
нескінченні розміри й комплексний радіус, а діагностик не було зовсім.
Порожній вхід тепер дає EVAL_ERROR — тобто відмову, а не число.

:::input {#input.clutch-reserve-factor}
symbol: beta
valueType: float64
:::

:::input {#input.clutch-lining-pressure}
symbol: q_lining
valueType: quantity
canonicalUnit: MPa
:::

:::input {#input.clutch-friction-coefficient}
symbol: mu
valueType: float64
:::

:::input {#input.clutch-width-ratio}
symbol: k_w
valueType: float64
:::

:::input {#input.clutch-friction-surfaces}
symbol: z
valueType: float64
:::

## Розрахунковий момент

Момент, на який рахують зчеплення: більший за момент двигуна рівно в стільки
разів, скільки становить коефіцієнт запасу.

:::calculation {#calc.clutch-design-torque}
purpose: Розрахунковий момент зчеплення за коефіцієнтом запасу.
output:
  id: value.clutch-design-torque
  symbol: M_p
  valueType: quantity
  canonicalUnit: N*m
expression: beta * M_e
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.1"
:::

## Попередній середній радіус тертя

Рівняння (46). Радіус виходить із того, скільки моменту треба передати при
допустимому тиску на накладку.

engdoc сам зводить величини до канонічних одиниць: тиск, оголошений у МПа,
всередині вже в паскалях. Тому ручного множення на 10⁶ тут НЕМАЄ — воно
перевело б тиск удруге, і радіус вийшов би у сто разів меншим за дійсний,
лишаючись при цьому правдоподібним числом.

:::calculation {#calc.clutch-preliminary-radius}
purpose: Попередній середній радіус тертя за допустимим тиском на накладку.
output:
  id: value.clutch-preliminary-radius
  symbol: R_prelim
  valueType: quantity
  canonicalUnit: m
expression: cbrt(M_p / (2 * 3.141592653589793 * q_lining * z * k_w * mu))
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.2"
:::

:::calculation {#calc.clutch-lining-width}
purpose: Ширина фрикційної накладки.
output:
  id: value.clutch-lining-width
  symbol: b_lining
  valueType: quantity
  canonicalUnit: m
expression: k_w * R_prelim
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.3"
:::

:::calculation {#calc.clutch-preliminary-outer-diameter}
purpose: Попередній зовнішній діаметр накладки.
output:
  id: value.clutch-preliminary-outer-diameter
  symbol: D_prelim
  valueType: quantity
  canonicalUnit: m
expression: 2 * R_prelim + b_lining
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.4"
:::
