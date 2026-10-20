---
doc: manuscript/calculations/final-drive-secondary.engdoc.md
type: calculation
status: active
authority: normative
component: chapter-12
summary: Preliminary cylindrical second-stage sizing and static bending/contact checks for a double final drive.
read-first: [ENGINEERING_DOCUMENT_MODEL.md, Data/Vehicle/docs/gearbox_sources.md]
roadmap: [R-1]
sdocProfile: engineering-worksheet/0.1
documentId: vehicle-final-drive-secondary-chapter-12
revision: 1
language: uk
numericProfile: float64
calculationEngine: mathjs-safe/0.1
---

# Розділ 12 — циліндрична ступінь подвійної головної передачі

Аркуш перевіряє один кандидат нормального модуля для вже прийнятих цілих
чисел зубів. Адаптер перебирає модулі першого переважного ряду та приймає
перший, для якого виконуються обидві перевірки міцності. Якщо ряд до 16 мм
недостатній, він перевіряє окремо позначену проєктну сітку 17…64 мм із кроком
1 мм; це попередні власні розміри проєкту, а не стандартний ряд виробника. Геометрію, сили,
напруги та коефіцієнти запасу для кожного кандидата обчислює лише цей аркуш.

Момент M₃ надходить після конічної ступені. Він уже містить розрахункове
навантаження та запас, прийняті для M₁; повторного множника запасу тут немає.
Момент веденого колеса визначено без зменшення на втрати.

## Джерела та межі методу

:::source {#source.method.course}
title: Методичні вказівки до курсового проєкту з розрахунку автомобіля
locator: Розділи розрахунку зубчастих передач коробки та головної передачі
:::

:::source {#source.book.vakhlamov}
title: Вахламов В. К. Автомобили. Основы конструкции
locator: Розрахунок зубчастих передач
:::

:::source {#source.project-derivation}
title: Домовленість самого проєкту
locator: Попередня геометрія циліндричної ступені та зовнішнє зачеплення
:::

Кореневі напруги отримано оберненням формули попереднього модуля розділу 10.
Контактну напругу оцінено формулою Герца для зовнішнього зачеплення: кривини
додаються, а навантаження розподілено по ширині вінця b. Попередньо прийнято
β = 25°, α = 20°, b = 10mₙ, E = 210 ГПа, [σF] = 225 МПа та
[σH] = 1000 МПа. Це явні припущення проєкту, а не вимоги виробника.

Результат є статичною попередньою перевіркою. Матеріал, термообробку, ресурс,
точність, профіль зуба та розподіл навантаження по ширині потрібно прийняти
окремо для повної перевірки за ISO 6336.

## Вхід одного кандидата

Значення без вбудованого числа обов'язково передає адаптер. Результати
попередньої спроби або нульові заглушки не можуть підмінити відсутній вхід.
Довжини оголошено в мм, моменти в Н·м, напруги в МПа, кути в градусах.
engdoc виконує узгодження одиниць; додаткове множення моменту на 1000 або
напруги на 10⁶ у виразах спричинило б подвійне перетворення.

:::input {#input.final-drive-secondary-candidate-module}
symbol: m_candidate
valueType: quantity
canonicalUnit: mm
:::

:::input {#input.final-drive-secondary-torque}
symbol: M_3
valueType: quantity
canonicalUnit: N*m
:::

:::input {#input.final-drive-secondary-driving-teeth}
symbol: Z_3
valueType: float64
:::

:::input {#input.final-drive-secondary-driven-teeth}
symbol: Z_4
valueType: float64
:::

:::input {#input.final-drive-secondary-helix-angle}
symbol: beta
valueType: quantity
canonicalUnit: deg
:::

:::input {#input.final-drive-secondary-face-width-modules}
symbol: k_b
valueType: float64
:::

:::input {#input.final-drive-secondary-driving-form-factor}
symbol: y_3
valueType: float64
:::

:::input {#input.final-drive-secondary-driven-form-factor}
symbol: y_4
valueType: float64
:::

:::input {#input.final-drive-secondary-allowable-bending}
symbol: sigma_F_allow
valueType: quantity
canonicalUnit: MPa
:::

:::input {#input.final-drive-secondary-allowable-contact}
symbol: sigma_H_allow
valueType: quantity
canonicalUnit: MPa
:::

:::input {#input.final-drive-secondary-pressure-angle}
symbol: alpha
valueType: quantity
canonicalUnit: deg
value: 20
sourceRef: source.project-derivation
:::

:::input {#input.final-drive-secondary-elastic-modulus}
symbol: E
valueType: quantity
canonicalUnit: MPa
value: 210000
sourceRef: source.project-derivation
:::

:::input {#input.final-drive-secondary-hertz-coefficient}
symbol: k_H
valueType: float64
value: 0.418
sourceRef: source.method.course
:::

## Модуль, ширина та момент веденого колеса

Вихід (12.6) називає перевірюваний модуль. Саме це число стає прийнятим
модулем після успішного перебору; умова вибору не є другою формулою модуля.

:::calculation {#calc.final-drive-secondary-module}
purpose: Перевірюваний нормальний модуль циліндричної ступені.
output:
  id: value.final-drive-secondary-module
  symbol: m_n
  valueType: quantity
  canonicalUnit: mm
expression: m_candidate
sourceRefs: [source.project-derivation]
equationNumber: "12.6"
:::

:::calculation {#calc.final-drive-secondary-face-width}
purpose: Ширина вінця циліндричної ступені.
output:
  id: value.final-drive-secondary-face-width
  symbol: b
  valueType: quantity
  canonicalUnit: mm
expression: k_b * m_n
sourceRefs: [source.project-derivation]
:::

:::calculation {#calc.final-drive-secondary-driven-torque}
purpose: Розрахунковий момент веденого циліндричного колеса.
output:
  id: value.final-drive-secondary-driven-torque
  symbol: M_4
  valueType: quantity
  canonicalUnit: N*m
expression: M_3 * Z_4 / Z_3
sourceRefs: [source.project-derivation]
:::

## Потрібний модуль за згином кожного зуба

Це вимоги для поточної ширини b. Після переходу до наступного кандидата
ширина змінюється разом із модулем, тому вимоги обчислюються знову.

:::calculation {#calc.final-drive-secondary-driving-required-module}
purpose: Потрібний модуль за згином ведучої циліндричної шестерні.
output:
  id: value.final-drive-secondary-driving-required-module
  symbol: m_req3
  valueType: quantity
  canonicalUnit: mm
expression: sqrt(2 * M_3 * cos(beta) / (3.141592653589793 * Z_3 * y_3 * b * sigma_F_allow))
sourceRefs: [source.method.course, source.book.vakhlamov]
:::

:::calculation {#calc.final-drive-secondary-driven-required-module}
purpose: Потрібний модуль за згином веденого циліндричного колеса.
output:
  id: value.final-drive-secondary-driven-required-module
  symbol: m_req4
  valueType: quantity
  canonicalUnit: mm
expression: sqrt(2 * M_4 * cos(beta) / (3.141592653589793 * Z_4 * y_4 * b * sigma_F_allow))
sourceRefs: [source.method.course, source.book.vakhlamov]
:::

:::calculation {#calc.final-drive-secondary-required-module}
purpose: Найбільший потрібний модуль за згином циліндричної пари.
output:
  id: value.final-drive-secondary-required-module
  symbol: m_req
  valueType: quantity
  canonicalUnit: mm
expression: max(m_req3, m_req4)
sourceRefs: [source.project-derivation]
:::

## Ділильні радіуси та колова сила

:::calculation {#calc.final-drive-secondary-driving-radius}
purpose: Ділильний радіус ведучої циліндричної шестерні.
output:
  id: value.final-drive-secondary-driving-radius
  symbol: r_3
  valueType: quantity
  canonicalUnit: mm
expression: m_n * Z_3 / (2 * cos(beta))
sourceRefs: [source.method.course, source.book.vakhlamov]
:::

:::calculation {#calc.final-drive-secondary-driven-radius}
purpose: Ділильний радіус веденого циліндричного колеса.
output:
  id: value.final-drive-secondary-driven-radius
  symbol: r_4
  valueType: quantity
  canonicalUnit: mm
expression: m_n * Z_4 / (2 * cos(beta))
sourceRefs: [source.method.course, source.book.vakhlamov]
:::

:::calculation {#calc.final-drive-secondary-tangential-force}
purpose: Колова сила в циліндричному зачепленні.
output:
  id: value.final-drive-secondary-tangential-force
  symbol: F_t
  valueType: quantity
  canonicalUnit: N
expression: M_3 / r_3
sourceRefs: [source.method.course, source.book.vakhlamov]
:::

## Контактна міцність зовнішнього зачеплення

Публічний вираз розгорнуто до входів і модуля (12.6), щоб його можна було
відтворити з трьох нумерованих рівнянь розділу. Проміжні радіуси, сила і
ширина мають власні виходи вище та доступні для пояснення результату.

:::calculation {#calc.final-drive-secondary-contact}
purpose: Контактна напруга циліндричної ступені.
output:
  id: value.final-drive-secondary-contact
  symbol: sigma_H
  valueType: quantity
  canonicalUnit: MPa
expression: k_H * cos(beta) * sqrt((M_3 / (m_n * Z_3 / (2 * cos(beta)))) * E / (k_b * m_n * sin(alpha) * cos(alpha)) * (1 / (m_n * Z_3 / (2 * cos(beta))) + 1 / (m_n * Z_4 / (2 * cos(beta)))))
sourceRefs: [source.method.course, source.book.vakhlamov, source.project-derivation]
equationNumber: "12.7"
:::

## Згин ведучого і веденого зубів

:::calculation {#calc.final-drive-secondary-driving-bending}
purpose: Напруга згину ведучої циліндричної шестерні.
output:
  id: value.final-drive-secondary-driving-bending
  symbol: sigma_F3
  valueType: quantity
  canonicalUnit: MPa
expression: 2 * M_3 * cos(beta) / (3.141592653589793 * Z_3 * y_3 * b * m_n^2)
sourceRefs: [source.method.course, source.book.vakhlamov, source.project-derivation]
:::

:::calculation {#calc.final-drive-secondary-driven-bending}
purpose: Напруга згину веденого циліндричного колеса.
output:
  id: value.final-drive-secondary-driven-bending
  symbol: sigma_F4
  valueType: quantity
  canonicalUnit: MPa
expression: 2 * M_4 * cos(beta) / (3.141592653589793 * Z_4 * y_4 * b * m_n^2)
sourceRefs: [source.method.course, source.book.vakhlamov, source.project-derivation]
:::

:::calculation {#calc.final-drive-secondary-bending}
purpose: Найбільша напруга згину циліндричної ступені.
output:
  id: value.final-drive-secondary-bending
  symbol: sigma_F
  valueType: quantity
  canonicalUnit: MPa
expression: max(2 * M_3 * cos(beta) / (3.141592653589793 * Z_3 * y_3 * k_b * m_n * m_n^2), 2 * (M_3 * Z_4 / Z_3) * cos(beta) / (3.141592653589793 * Z_4 * y_4 * k_b * m_n * m_n^2))
sourceRefs: [source.project-derivation]
equationNumber: "12.8"
:::

## Коефіцієнти запасу

:::calculation {#calc.final-drive-secondary-driving-bending-safety-factor}
purpose: Коефіцієнт запасу за згином ведучої циліндричної шестерні.
output:
  id: value.final-drive-secondary-driving-bending-safety-factor
  symbol: S_F3
  valueType: float64
expression: sigma_F_allow / sigma_F3
sourceRefs: [source.project-derivation]
:::

:::calculation {#calc.final-drive-secondary-driven-bending-safety-factor}
purpose: Коефіцієнт запасу за згином веденого циліндричного колеса.
output:
  id: value.final-drive-secondary-driven-bending-safety-factor
  symbol: S_F4
  valueType: float64
expression: sigma_F_allow / sigma_F4
sourceRefs: [source.project-derivation]
:::

:::calculation {#calc.final-drive-secondary-bending-safety-factor}
purpose: Коефіцієнт запасу за згином циліндричної ступені.
output:
  id: value.final-drive-secondary-bending-safety-factor
  symbol: S_F
  valueType: float64
expression: sigma_F_allow / sigma_F
sourceRefs: [source.project-derivation]
:::

:::calculation {#calc.final-drive-secondary-contact-safety-factor}
purpose: Коефіцієнт запасу за контактом циліндричної ступені.
output:
  id: value.final-drive-secondary-contact-safety-factor
  symbol: S_H
  valueType: float64
expression: sigma_H_allow / sigma_H
sourceRefs: [source.project-derivation]
:::
