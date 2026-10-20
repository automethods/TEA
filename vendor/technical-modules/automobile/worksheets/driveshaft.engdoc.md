---
doc: manuscript/calculations/driveshaft.engdoc.md
type: calculation
status: active
authority: normative
component: chapter-11
summary: Chapter 11 — authoritative speed, torsion and twist evaluation for standard or explicitly preliminary custom shaft sections.
read-first: [ENGINEERING_DOCUMENT_MODEL.md]
roadmap: [R-1]
sdocProfile: engineering-worksheet/0.1
documentId: vehicle-driveshaft-chapter-11
revision: 3
language: uk
numericProfile: float64
calculationEngine: mathjs-safe/0.1
---

# Розділ 11 — карданна передача

Перший розділ, арифметику якого рахує engdoc, а не рукописні JS-будівники.
Пілот R-1.

## Два етапи й вибір між ними

Аркуш рахують ДВІЧІ, і між заходами стоїть те, що виразом не є.

**Етап А** дає критичну частоту (11.2) і потрібний зовнішній діаметр (11.3) —
тобто ВИМОГУ до перерізу.

Далі JS перебирає повні перерізи наведеного ряду ГОСТ 13758-89. За відомого
розрахункового моменту автоматичний вибір приймає лише переріз, для якого
аркуш одночасно підтвердив критичну частоту, напругу кручення ≤300 МПа та
закручування ≤6°/м. Перевіряють також товстіші стінки того самого рядка.
Розрахунковий момент (11.4) для такого підбору обчислюють заздалегідь.

**Етап Б** із прийнятим перерізом дає напруги (11.5), кут закручування (11.6)
і кут на метр, за яким його перевіряють.

Якщо весь наведений ряд не проходить, застосунок може прийняти **попередню
проєктну трубу поза цим рядом**: D=120…300 мм з кроком 1 мм,
t=max(4, ceil(D/20)) мм, d=D−2t. Це явне геометричне припущення проєкту,
а не додатковий рядок ГОСТ. Кожен кандидат проходить ті самі рівняння аркуша.
Матеріал, виробнича доступність, виготовлення, шви, втома, балансування,
опори та критичні форми зібраної передачі потребують окремих перевірок.
Якщо й ця сітка вичерпана, підбір відмовлено. Ручний внутрішній діаметр
автоматично не змінюють; невиконані перевірки залишають видимими.

Розділяє їх `targetValueIds`: на етапі А engdoc рахує лише названі величини та
їхні залежності, тому (11.5) і (11.6) на ньому не рахуються ВЗАГАЛІ. Доти
аркуш рахувався цілком, і етап без прийнятого перерізу однаково брався за
напруги — даючи або сміття, або діагностику там, де ще нічого не сталося.

## Джерело тяги — одна пара величин

(11.1) і (11.4) беруть величину тієї машини, яка веде колеса: для звичайного
автомобіля це ω_д,max і M_к,max, для електричного — ω_м,max і M_м,max, а для
послідовного гібрида крива ДВЗ існує, але колеса веде електромашина.

Аркуш імпортує величину за ОДНИМ незмінним ідентифікатором, тож вибір робить
розділ 4 — там, де відомо, хто веде колеса, — і публікує результат як
`value.traction-source-maximum-torque` і
`value.traction-source-maximum-angular-speed`. Сюди заходять уже вони, і
жодного «якщо» в аркуші немає.

(11.4) живе в окремому аркуші, і їх два: з коефіцієнтом запасу зчеплення й без
нього. Це не одна формула з множником-одиницею, а дві різні формули — у
привода без зчеплення запасу немає, і друкувати «×1» означало б показувати
величину, якої в конструкції не існує.

## Джерела

:::source {#source.method.course}
title: Методичні вказівки до курсового проєкту з розрахунку автомобіля
locator: с. 41—43
:::

:::source {#source.project-derivation}
title: Домовленість самого проєкту
locator: не з книжки
:::

## Що заходить ззовні

Жодну з цих величин аркуш не оголошує СВОЄЮ: усі вже є в документі. Вони
заходять голими `:::var` під власними канонічними ідентифікаторами — двома
значеннями попередніх кроків, трьома рішеннями розділу й прийнятим перерізом.

Оголосити їх входами аркуша було б зручніше й неправильно: документ дістав би
другу владу над тим самим числом, а рішення лишилися б без жодного споживача.

Одиниці тут ті самі, що в документі — КОЖНА, а не більшість. Діаметри в
документі міліметрові, довжина вала метрова, і аркуш пише саме так. Перерахунок
на шві означав би, що канонічний ідентифікатор тихо змінює одиницю, а це
непомітно: число 900 виглядає цілком розумно там, де стоїть 0,9.

Змішані одиниці у виразі — не проблема: engdoc зводить їх сам. Коефіцієнт
биття мм/с, діаметри в мм, довжина в м — і (11.3) сходиться, бо кожна величина
несе свою одиницю, а не покладається на домовленість між файлами.

:::var {#value.traction-source-maximum-angular-speed}
name: omega_src
type: quantity
canonicalUnit: s^-1
value: 0
:::

:::var {#value.gearbox-lowest-ratio}
name: u_min
type: float64
value: 0
:::

:::var {#value.driveshaft-design-torque}
name: M_p
type: quantity
canonicalUnit: N*m
value: 0
:::

:::var {#decision.driveshaft-speed-margin}
name: k_omega
type: float64
value: 0
:::

:::var {#decision.driveshaft-reserve}
name: K_res
type: float64
value: 0
:::

:::var {#decision.driveshaft-length}
name: L_v
type: quantity
canonicalUnit: m
value: 0
:::

:::var {#decision.driveshaft-inner-diameter}
name: d_in
type: quantity
canonicalUnit: mm
value: 0
:::

:::var {#value.driveshaft-outer-diameter}
name: D_out
type: quantity
canonicalUnit: mm
value: 0
:::

## Сталі

Кожна з них — оголошений вхід, а не число всередині виразу. Модель вимагає,
щоб КОЖНА залежність розрахунку розв'язувалася в оголошену величину, і сталі з
цього не виняток: число, яке живе лише у виразі, читач не може ні побачити, ні
перевірити.

Коефіцієнт биття записаний рівно так, як його друкує джерело: 1,13·10⁷. Але він
НЕ безрозмірний — вираз ω_кр = C·√(D²+d²)/L² сходиться лише тоді, коли в
коефіцієнта одиниця мм/с. engdoc відмовляється рахувати формулу, у якій
одиниці не сходяться, і саме це змусило назвати одиницю вголос замість того,
щоб ховати її в голому числі.

:::input {#input.driveshaft-whirl-coefficient}
symbol: C_w
valueType: quantity
canonicalUnit: mm/s
value: 11300000
sourceRefs: [source.method.course]
:::

Нуль для зрізання від'ємного підкореневого виразу. Від'ємний він тоді, коли
критичну частоту перевищує будь-яка стінка з таблиці: тоді розміру за частотою
немає, і потрібний діаметр дорівнює нулю, а не є помилкою.

:::input {#input.driveshaft-zero-area}
symbol: A_zero
valueType: quantity
canonicalUnit: mm^2
value: 0
sourceRefs: [source.project-derivation]
:::

Модуль зсуву — 80 ГПа, загальновживане значення для конструкційних сталей.
Джерело друкує 85 ГПа; кут обернено пропорційний G, тому різниця не губиться в
округленнях. Це рішення проєкту, не джерела.

:::input {#input.driveshaft-shear-modulus}
symbol: G_s
valueType: quantity
canonicalUnit: Pa
value: 80000000000
sourceRefs: [source.project-derivation]
:::

Радіани в градуси. Множник несе одиницю «градус», бо сам кут M·L/(G·J_p)
безрозмірний, і engdoc не перетворює безрозмірне на градуси мовчки.

:::input {#input.driveshaft-degrees-per-radian}
symbol: k_deg
valueType: quantity
canonicalUnit: deg
value: 57.29577951308232
sourceRefs: [source.project-derivation]
:::

## Етап А — частота обертання карданного вала

Вал крутиться швидше за джерело тяги рівно настільки, наскільки коробка
знижує обертання на верхній передачі. Множник (1,1…1,2) — запас на те, що
двигун може перекрутити номінал.

У текстовій розшифровці джерела позначення ω_дmax і ω_max переставлені
місцями; тут вони як у друку: ω_дmax — джерело, ω_max — вал.

:::calculation {#calc.driveshaft-speed}
purpose: Найбільша частота обертання карданного вала.
output:
  id: value.driveshaft-speed
  symbol: omega_max
  valueType: quantity
  canonicalUnit: s^-1
expression: k_omega * omega_src / u_min
sourceRefs: [source.method.course]
equationNumber: "11.1"
:::

## Етап А — критична частота обертання

Вал не повинен працювати поблизу частоти власних згинних коливань: на ній він
починає бити. Тому критичну частоту беруть із запасом над робочою.

:::calculation {#calc.driveshaft-critical-speed}
purpose: Критична частота обертання вала.
output:
  id: value.driveshaft-critical-speed
  symbol: omega_kr
  valueType: quantity
  canonicalUnit: s^-1
expression: K_res * omega_max
sourceRefs: [source.method.course]
equationNumber: "11.2"
:::

## Етап А — потрібний зовнішній діаметр

Надрукований вираз розв'язано щодо D. Умова придатності — ω_кр(D) ≥ ω_кр,
тобто D² ≥ (ω_кр·L²/C_w)² − d². Права частина буває від'ємною, і це не
помилка: вона означає, що нерівність виконується за БУДЬ-ЯКОГО D — труба з
таким внутрішнім діаметром уже жорсткіша, ніж треба. Тому нуль зрізає її, а не
корінь із від'ємного.

Це значення — ВИМОГА, а не розмір. Розмір дає наступний крок, вибором рядка з
ряду ГОСТ 13758-89.

:::calculation {#calc.driveshaft-required-outer-diameter}
purpose: Потрібний зовнішній діаметр за критичною частотою.
output:
  id: value.driveshaft-required-outer-diameter
  symbol: D_{\mathrm{потр}}
  valueType: quantity
  canonicalUnit: mm
expression: sqrt(max(A_zero, (omega_kr * L_v^2 / C_w)^2 - d_in^2))
sourceRefs: [source.method.course]
equationNumber: "11.3"
:::

## Етап Б — напруги кручення

Перевірка міцності ПРИЙНЯТОГО перерізу: до вибору рядка цього числа не існує.

:::calculation {#calc.driveshaft-torsion}
purpose: Напруги кручення в карданному валу.
output:
  id: value.driveshaft-torsion
  symbol: tau
  valueType: quantity
  canonicalUnit: MPa
expression: 16 * M_p * D_out / (3.141592653589793 * (D_out^4 - d_in^4))
sourceRefs: [source.method.course]
equationNumber: "11.5"
:::

## Етап Б — кут закручування

Полярний момент інерції кільця: J_p = π(D⁴−d⁴)/32.

:::calculation {#calc.driveshaft-twist}
purpose: Кут закручування вала.
output:
  id: value.driveshaft-twist
  symbol: phi
  valueType: quantity
  canonicalUnit: deg
expression: k_deg * M_p * L_v / (G_s * 3.141592653589793 * (D_out^4 - d_in^4) / 32)
sourceRefs: [source.method.course]
equationNumber: "11.6"
:::

Межа — 6° на кожен метр довжини, тому перевіряють саме кут на метр, а не кут
усього вала. Він теж рахується ТУТ і має власний вихід: сховати φ/L у JS
означало б, що число, за яким документ виносить вирок, ніде не оголошене.

:::calculation {#calc.driveshaft-twist-per-metre}
purpose: Кут закручування на метр довжини вала.
output:
  id: value.driveshaft-twist-per-metre
  symbol: phi_L
  valueType: quantity
  canonicalUnit: deg/m
expression: phi / L_v
sourceRefs: [source.method.course]
equationNumber: "11.6"
:::
