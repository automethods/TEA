---
doc: manuscript/calculations/driveshaft-torque-direct.engdoc.md
type: calculation
status: active
authority: normative
component: chapter-11
summary: Chapter 11 (11.4) for a drive with no clutch: the source torque reaches the shaft directly.
read-first: [manuscript/calculations/driveshaft.engdoc.md]
roadmap: [R-1]
sdocProfile: engineering-worksheet/0.1
documentId: vehicle-driveshaft-torque-direct
revision: 1
language: uk
numericProfile: float64
calculationEngine: mathjs-safe/0.1
---

# Розрахунковий момент на карданному валу — без зчеплення

Рівняння (11.4) має дві форми, і це не одна формула з множником, який іноді
дорівнює одиниці. Форма залежить від того, чи стоїть між джерелом тяги й валом
зчеплення, а це властивість КОНСТРУКЦІЇ. Тому форм два аркуші, і проєкт
рахує той, який описує його привод.

У привода без зчеплення пробуксовувати нема чому: момент джерела доходить
до вала цілим. Тому в цій формулі НЕМАЄ коефіцієнта запасу — не одиниця
замість нього, а його відсутність.

Написати «×1» означало б показати читачеві величину, якої в конструкції не
існує, і змусити документ оголосити залежність від рішення розділу 9 там, де
розділу 9 немає взагалі.

## Джерела

:::source {#source.method.course}
title: Методичні вказівки до курсового проєкту з розрахунку автомобіля
locator: с. 41—43
:::

## Що заходить ззовні

:::var {#value.traction-source-maximum-torque}
name: M_src
type: quantity
canonicalUnit: N*m
value: 0
:::

:::var {#value.gearbox-highest-ratio}
name: u_1
type: float64
value: 0
:::


## Розрахунковий момент

:::calculation {#calc.driveshaft-design-torque}
purpose: Розрахунковий момент на карданному валу.
output:
  id: value.driveshaft-design-torque
  symbol: M_p
  valueType: quantity
  canonicalUnit: N*m
expression: M_src * u_1
sourceRefs: [source.method.course]
equationNumber: "11.4"
:::
