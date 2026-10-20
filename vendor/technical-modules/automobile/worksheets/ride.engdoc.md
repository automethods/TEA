---
doc: manuscript/calculations/ride.engdoc.md
type: calculation
status: active
authority: normative
component: chapter-16
summary: Chapter 16 — the ride equations engdoc evaluates: the sprung frequency and the three severity quantities that follow from it.
read-first: [ENGINEERING_DOCUMENT_MODEL.md]
roadmap: [R-1]
sdocProfile: engineering-worksheet/0.1
documentId: vehicle-ride-chapter-16
revision: 1
language: uk
numericProfile: float64
calculationEngine: mathjs-safe/0.1
---

# Розділ 16 — плавність ходу

Другий розділ, арифметику якого рахує engdoc. Тут живуть (16.1) і (16.4).

## Що лишилося в JS і чому

**(16.2), частота непідресорених мас.** За відсутності жорсткості шин і
непідресореної маси осі застосунок приймає середину джерельного діапазону.
Оголошений вираз, формула і підстановка цієї гілки показують саме
(6,7 + 8,5) / 2 = 7,6 Гц. Значення не залежить від коефіцієнта деформації
шини. Окремий навчальний приклад із явно заданими жорсткістю і масою
застосовує ν_в = √(ΣC_ш/m_м)/(2π) і показує обидва числові аргументи.

**(16.3), резонансні швидкості.** Тут перешкода інша, ніж у розділі 11, і
плутати їх не можна. Вибір рядка ГОСТ справді не є виразом — це прийняття
табличного значення. А (16.3) — це саме арифметика: V = ν·S, порахована для
кожної довжини хвилі з діапазону 0,5…5 м, і для кожної з двох частот.

Не пускає її сюди те, що результат — ПОВТОРЮВАНИЙ: один вираз, обчислений над
переліком, дає перелік пар. Оголошений вихід engdoc — одне значення, і способу
сказати «те саме для кожного S» у нього немає. Щойно він з'явиться, (16.3)
переїде без жодної зміни в самій формулі.

## Джерела

:::source {#source.method.course}
title: Методичні вказівки до курсового проєкту з розрахунку автомобіля
locator: с. 28—30
:::

:::source {#source.project-derivation}
title: Домовленість самого проєкту
locator: не з книжки
:::

## Що заходить ззовні

Статичний прогин підвіски приймають у цьому ж розділі, і аркуш бере його під
тим самим ідентифікатором. Власного входу для нього тут немає: друга влада над
одним числом — це розбіжність, яка чекає нагоди.

:::var {#decision.ride-static-deflection}
name: f_st
type: quantity
canonicalUnit: m
value: 0
:::

## Сталі

:::input {#input.ride-gravity}
symbol: g
valueType: quantity
canonicalUnit: m/s^2
value: 9.81
sourceRefs: [source.project-derivation]
:::

Висоту нерівності джерело задає прямо: 0,05 м. Вона не вимірюється й не
приймається автором — це число з книжки, і саме тому воно вхід, а не літерал у
виразі.

:::input {#input.ride-unevenness-height}
symbol: Z_0
valueType: quantity
canonicalUnit: m
value: 0.05
sourceRefs: [source.method.course]
:::

## Частота власних коливань підресорених мас

Кузов на підвісці — це маятник, і його частота залежить лише від того, на
скільки підвіска просідає під власною вагою. Що м'якша підвіска, то повільніші
коливання й то спокійніша їзда.

:::calculation {#calc.ride-sprung-frequency}
purpose: Частота власних коливань підресорених мас.
output:
  id: value.ride-sprung-frequency
  symbol: nu_n
  valueType: quantity
  canonicalUnit: Hz
expression: sqrt(g / f_st) / (2 * 3.141592653589793)
sourceRefs: [source.method.course]
equationNumber: "16.1"
:::

## Навчальні показники інтенсивності коливань

Три величини, а не одна. Доти крок друкував усі три, а оголошував ЛИШЕ
прискорення: швидкість і різкість стояли в підстановці числами, яких документ
не називав, і на які тому не можна було ні послатися, ні перевірити.

Показники джерела використовують частоту ν_н у Гц. Вони мають розмірності
швидкості, прискорення та різкості, але не є амплітудами гармонічних похідних.
Для цих амплітуд потрібна кутова частота ω = 2πν_н. Позначення I_v, I_a, I_j
відділяють наведені навчальні індекси від похідних переміщення. Три окремі
виходи показано як три підстановки до однієї групи рівнянь (16.4).

:::calculation {#calc.ride-oscillation-velocity}
purpose: Навчальний показник швидкості коливань за джерелом.
output:
  id: value.ride-oscillation-velocity
  symbol: I_v
  valueType: quantity
  canonicalUnit: m/s
expression: Z_0 * nu_n
sourceRefs: [source.method.course]
equationNumber: "16.4"
:::

:::calculation {#calc.ride-oscillation-severity}
purpose: Навчальний показник прискорення коливань за джерелом.
output:
  id: value.ride-oscillation-severity
  symbol: I_a
  valueType: quantity
  canonicalUnit: m/s^2
expression: Z_0 * nu_n^2
sourceRefs: [source.method.course]
equationNumber: "16.4"
:::

Різкість росте як КУБ частоти. Саме тому дрібні часті нерівності відчуваються
гірше за великі й рідкі, хоч висота в них однакова, — і саме тому цю величину
варто мати окремо, а не читати з підстановки чужого кроку.

:::calculation {#calc.ride-oscillation-jerk}
purpose: Навчальний показник різкості коливань за джерелом.
output:
  id: value.ride-oscillation-jerk
  symbol: I_j
  valueType: quantity
  canonicalUnit: m/s^3
expression: Z_0 * nu_n^3
sourceRefs: [source.method.course]
equationNumber: "16.4"
:::
