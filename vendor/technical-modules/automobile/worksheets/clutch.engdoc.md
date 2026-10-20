---
doc: manuscript/calculations/clutch.engdoc.md
type: calculation
status: active
authority: normative
component: chapter-9
summary: Chapter 9, stage two (9.5-9.8). Arithmetic of the lining the author actually adopted.
read-first: [Data/Vehicle/docs/clutch_sources.md, manuscript/calculations/clutch-preliminary.engdoc.md]
roadmap: [R-3]
sdocProfile: engineering-worksheet/0.1
documentId: vehicle-clutch-chapter-9
revision: 2
language: uk
numericProfile: float64
calculationEngine: mathjs-safe/0.1
---

# Розділ 9, крок другий — прийнята накладка

Рівняння (9.5)—(9.8): те, що рахують уже за розмірами, які автор ПРИЙНЯВ.

Перший крок (`clutch-preliminary.engdoc.md`) дав потрібний діаметр Д′; за ним
метод порадив рядок таблиці; автор прийняв його або взяв інший. Аж тепер
відомі Д₃ і d_в — і аж тепер має сенс рахувати дійсний радіус, площу, силу
стиснення й дійсний тиск.

## Джерела

Обидві методички ведуть цей ланцюг однаково; розходяться вони в діапазонах і в
правилі вибору рядка. Запис розбіжностей — у `Data/Vehicle/docs/clutch_sources.md`.

:::source {#source.method.course}
title: Методичні вказівки до курсового проєкту з розрахунку автомобіля
locator: с. 37—38
:::

:::source {#source.method.opanasyuk}
title: Опанасюк Є. Г. Методичні вказівки до курсового проєктування «Автомобілі»
locator: с. 28—32, рівняння (46)—(52)
:::

## Що заходить ззовні

Розрахунковий момент порахував перший крок — рівняння (9.1). Сюди він заходить
**під тим самим ідентифікатором** `value.clutch-design-torque`: одна влада над
одним числом, як і момент двигуна в першому кроці.

:::var {#value.clutch-design-torque}
name: M_p
type: quantity
canonicalUnit: N*m
value: 0
:::

## Прийняті величини

:::input {#input.clutch-friction-coefficient}
symbol: mu
valueType: float64
:::

:::input {#input.clutch-friction-surfaces}
symbol: z
valueType: float64
:::

:::input {#input.clutch-outer-diameter}
symbol: D_a
valueType: quantity
canonicalUnit: m
:::

:::input {#input.clutch-inner-diameter}
symbol: d_a
valueType: quantity
canonicalUnit: m
:::

## Дійсний середній радіус

Після того як за таблицею прийнято дійсні діаметри, середній радіус
перераховують за ними. Це навчальне наближення середнім арифметичним
радіусом: воно збігається з гіпотезою рівномірного спрацювання, але жодне
джерело такого припущення не висловлює.

:::calculation {#calc.clutch-mean-radius}
purpose: Дійсний середній радіус тертя за прийнятими діаметрами.
output:
  id: value.clutch-mean-radius
  symbol: R_c
  valueType: quantity
  canonicalUnit: m
expression: (D_a + d_a) / 4
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.5"
:::

:::calculation {#calc.clutch-lining-area}
purpose: Площа кільця однієї фрикційної накладки.
output:
  id: value.clutch-lining-area
  symbol: A_lining
  valueType: quantity
  canonicalUnit: m^2
expression: 3.141592653589793 * (D_a * D_a - d_a * d_a) / 4
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.6"
:::

## Потрібна сила стиснення

Це вимога до натискного пристрою, а не те, що він дає. Силу, яку справді
дають прийняті пружини, рахує підрозділ 9.2; доти передаваний момент не
перевіряють, бо підстановка цієї самої сили назад у формулу моменту дала б
тотожність, а не перевірку.

:::calculation {#calc.clutch-required-clamp-force}
purpose: Потрібна нормальна сила на поверхнях тертя.
output:
  id: value.clutch-required-clamp-force
  symbol: P_n
  valueType: quantity
  canonicalUnit: N
expression: M_p / (mu * R_c * z)
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.7"
:::

## Дійсний тиск на накладку

:::calculation {#calc.clutch-actual-pressure}
purpose: Дійсний тиск на фрикційну накладку.
output:
  id: value.clutch-actual-pressure
  symbol: q_actual
  valueType: quantity
  canonicalUnit: MPa
expression: P_n / A_lining
sourceRefs: [source.method.course, source.method.opanasyuk]
equationNumber: "9.8"
:::
