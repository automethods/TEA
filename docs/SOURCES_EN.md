# TEA project sources

Register 1.1 · 25 September 2026

The [02_Books folder](https://drive.google.com/drive/folders/17DpfRihWAjk_J_6N50pM6TcawEY2cV6f) contains seven supplied files. The actual scope of their review is recorded below. “Selectively checked” means reading the identified passages, rather than reviewing an entire book.

## Book register

| Code and source | Edition and review status | Use in the project |
|---|---|---|
| **B01 — [Автомобильный справочник Bosch](https://drive.google.com/file/d/1QbKd6tBnzrJB9p4u0PukX6IiVntpQ73W/view?usp=drivesdk)** | 2nd Russian edition, Moscow: «За рулем», 2004, 992 pp.; translation of the 5th English edition, 2000. The supplied OCR Markdown was read selectively: printed pp. 155–156, 522–523. | Suitability of measuring instruments, recording errors and the diagnostic sequence. Basis for the supplementary speed-bounds exercise and measurement record. |
| **B02 — [Основы эксплуатации и ремонта автомобилей и тракторов](https://drive.google.com/file/d/1ZFQyWu-vzVFouPseV80-B_BSS4JxZ9mx/view?usp=drivesdk)** | С. П. Баженов, Б. Н. Казьмин, С. В. Носов; edited by С. П. Баженов. Moscow: «Академия», 2005, 336 pp. The supplied PDF has 329 pages. Title information and pp. 93, 290 were checked against text and images. | Diagnosis before determining the work scope; post-repair checks; distinction between active labour and elapsed time including waiting. Page 290 concerns tractors; only the general time distinction was carried over. |
| **B03 — [Техническая эксплуатация автомобилей. Организация обслуживания и ремонта автомобилей](https://drive.google.com/file/d/1Kt6UUht46Ga0DTEqCaj69MtyQ_wsgsvF/view?usp=drivesdk)** | Э. Х. Рабинович. Lecture notes, ХНАДУ, 2004. The PDF has 62 pages. The title page and PDF pp. 6, 7, 8, 10, corresponding to printed pp. 5, 6, 7, 9, were visually checked. | Customer service-station orders; long repairs occupying a bay; links between required work, diagnosis and fault correction; verification of the result. |
| **B04 — [Hofmann — каталог обладнання](https://drive.google.com/file/d/1iuiVN7gq4IlCyTt7p2DhxZj3m-2YSRoL/view?usp=drivesdk)** | Snap-on Equipment, code 9402 026, 07/2010; 64 PDF pages. PDF pp. 32–35, 53–54, 64 were visually checked. | Teaching exercise in reading equipment specifications: rated capacity, dimensions, lifting engagement, drive-through clearance, power supply and configuration. Checking mass is only one compatibility criterion. |
| **B05 — [SAE JA1012 — A Guide to the Reliability-Centered Maintenance Standard](https://drive.google.com/file/d/1sP-4AdzQHZgzrmKXd52WgJTyAkWOruXI/view?usp=drivesdk)** | Supplied edition: January 2002. Selectively used when the main pilot was developed; not rechecked during the current four-book review. | Limited exercise covering function, failure, consequence, detectable indication, interval data and a justified action. The case lacks sufficient data to establish a new maintenance interval. |
| **B06 — [Лудченко — наданий DjVu](https://drive.google.com/file/d/1ns2Iy48U4FYmXf95qzQm-WkrBgitCYZ0/view?usp=drivesdk)** | Author and subject labels come from the attachment filename. The original was recovered and preserved; its contents were not decoded. Edition, year and full title were not established. | Awaiting review of the title page, contents and relevant chapters. No specific claims or page references from this file have yet been used. |
| **B07 — [VAG VAS 505 — наданий DjVu](https://drive.google.com/file/d/14hVe10hcwazKTD5XE6oCNwWZSJXN8ybr/view?usp=drivesdk)** | The label comes from the attachment filename. The original was recovered and preserved; its contents were not decoded. Edition, year and full title were not established. | Awaiting reading. The systems, hardware generation and applicability limits of the specific material must be identified before use. |

## Applicability limits

Bosch was supplied as OCR without original page images. Numerical requirements from that transcription were not carried into the new exercise. In particular, the 10% tolerance criterion mentioned in the old edition was not adopted as a universal current ABS requirement.

The supplied printed editions and catalogue are historical. They help justify the working method but do not establish current maintenance intervals, repair procedures, equipment availability, prices or suitability of a particular installation. SAE JA1012:2002 is not described as the latest edition in this project.

Station data, operation durations, error bounds of ±0.003 m and ±1 Hz, and the assumption that O01 waits on B2 were created for teaching. They are neither measurements from a real service station nor numbers taken from these books.

## How the methods became exercises

| Supplement 1.1 | Basis | Student output |
|---|---|---|
| ABS measurement assessment | B01 | Nominal speed, bounding interval, explanation of the effect of errors and a short measurement record |
| “Waiting” on bay B2 | B02, B03 | Working bay-hours, elapsed time, conflict list and a proposed organisational or scheduling change |
| Diagnosis and completion record | B01, B02, B03; equipment-specification exercise B04 | Traceable links between the complaint, evidence E1–E6, decision, operations and checks V1–V4; a list of missing information needed to confirm equipment suitability |

For current technical claims, the main package separately cites manufacturer documentation, including [HELLA on wheel-speed sensors](https://www.hella.com/techworld/us/technical/sensors-and-actuators/check-and-change-abs-and-wheel-speed-sensors/). A specific repair must follow the documentation for the relevant vehicle and system.

## Original examples

[04_Source](https://drive.google.com/drive/folders/1gIcarWb6E-EuiSf0DVrNnJZH0ZTSmI8C) contains TEA_original_examples.zip: 13 supplied attachments, 12 unique files. Original filenames and bytes were preserved; tea.pdf and TEA KP.pdf are exact duplicates, so one file was retained with both names recorded in the register. The archive includes a README, CSV/JSON manifests, sizes and SHA-256 hashes. This inventory documents file preservation, not a complete review of every document.

## Extended review of 25.09.2026

The following 12 sources belong to this round of selective reading. ST/D/EV/REL codes are separate from B01–B07 and the earlier L01–L03; this is not a claim that the collection contains 12 additional unique editions.

| Code and source | Material actually reviewed | Application to TEA |
|---|---|---|
| [ST01 — Марков, «Автосервис: Рынок, автомобиль, клиент», 1999](https://docs.google.com/document/d/1uAZAj81z8QRQiDeUUW2dgXKcIYzbguMC/edit) | §§11.1–11.4, pp.167–173; selected §§13.3–13.7, pp.189–202 | Recording requests and refusals, parts and approval readiness, equipment downtime and cycle duration. |
| [ST02 — Говорущенко, «Техническая эксплуатация автомобилей», 1984](https://drive.google.com/file/d/1se8i_YZlyLikDkGUIhYylg2Iy7dw4j0c/view) | pp.67–68; service-station calculation subsection, pp.289–291 according to OCR | Bay and off-bay work; waiting and completed vehicles; manufacturer documentation. |
| [ST03 — Коробкін, конспект лекцій «Технічна експлуатація автомобілів», 2010](https://drive.google.com/file/d/1PSE9haU7aTe7vWNnGDQNxgjp76nt2qpm/view) | pp.205–207; selected passages on pp.336, 367–370, 381 | Intermediate and acceptance checks, rework and functional links between workshop areas. |
| [D01 — Denton, Advanced Automotive Fault Diagnosis, 5-те вид., 2021](https://drive.google.com/file/d/1NmXHu7F9Zq_6XUdrqk4-dC_FsG5XWf6o/view?usp=drivesdk) | pp.8–12, 14–17, 23–25, 53–55, 109–111, 128–129, 137; printed page markers in the text | Stepwise diagnosis, revising time estimates, the meaning of DTCs, intermittent faults and confirming the result. |
| [D02 — Быков, «Компьютерная диагностика электронных систем автомобилей», 2020](https://drive.google.com/file/d/1wkes2U9EeqY06lXU5inw1OCCLbTEVQrY/view?usp=drivesdk) | Chapter 7, pp.35–40; selected description of scanner modes, pp.41–47 | Structure of the diagnostic record and distinguishing data-acquisition methods; not universal procedures. |
| [D03 — Мигаль, «Основы технической диагностики автомобилей», 2-ге доповнене вид., 2016](https://drive.google.com/file/d/1H6U7urwy93quNARN9GmJenkq3qumJsYJ/view?usp=drivesdk) | Printed pp.155–159, 310–313; selected pages read visually | Conditional algorithms and check sequences that account for probability and labour demand. |
| [EV01 — Volkswagen AG, SSP 499 «Основы электрических приводов автомобилей», 10/2011](https://drive.google.com/file/d/1aZ-YAK7Wz42HgsXlsj6gXavnm2bQkoV2/view?usp=drivesdk) | pp.2–3, 50–51, 53–54, 56–57, 60–61, 68 | Different competence and responsibility requirements depending on the specific operation. |
| [EV02 — Enge, Enge, Zoepf, Electric Vehicle Engineering, 2021](https://drive.google.com/file/d/1SSFrJn10hcB8Sre6X9ia4muwWz-6plPx/view?usp=drivesdk) | §§5.4.6, 5.4.9, 5.5.3; PDF pp.140, 143, 149–151 | Variable charging power, measurement conditions and limitations of SOC estimation. |
| [EV03 — Pistoia, ред., Electric and Hybrid Vehicles, 1-ше вид., 2010](https://drive.google.com/file/d/1wJevtCCmjtxaMG45gpxOa1nb8qWdfZ9d/view?usp=drivesdk) | Chapter 19: selected pp.500–504; chapter 20: §§1.3, 2.1.1–2.1.3, pp.518–520 | Measured and calculated BMS indicators; consistent accounting boundaries for energy, power and time. |
| [REL01 — Гольд та ін., «Основы прочности и долговечности автомобиля», 1967](https://drive.google.com/file/d/1bknQbpADbB1m3Q8sFjYuY8wXRwJX0riY/view) | Selected printed pp.74, 76, 78, 117–123, 188–191 | Describing variation in observations; distinguishing component fatigue life from maintenance intervals. |
| [REL02 — Mananathan, Automobile Wheel Alignment and Wheel Balancing, SAE, 2022](https://drive.google.com/file/d/1s5ZNkKekxl5Ng99NNeiJXMGUl0xwNCDa/view) | pp.34, 37–40, 59, 62–64, 77–78; recommendation limits on pp.19, 112 also checked | Runout, installation conditions, equipment checks and before/after alignment records. |
| [REL03 — Приходько, ред., «Автомобильный справочник», 2004 за титулом і вихідними даними OCR](https://drive.google.com/file/d/1_YZBKM1LRWLdyEIbnLSPo6vcSAVRyxrv/view) | Chapters 16–17, selected pp.681–685, 687 according to OCR | Effect of centring and tooling wear on measurement repeatability. |


Detailed supporting evidence, reading methods and limits on transfer into the exercises are recorded in the review log and TEA_literature_evidence_2026-09-25.json. For the Prykhodko handbook, the year 2004 is confirmed only by the supplied OCR, despite 2002 appearing in the filename. The two Markov DOC files are counted once because their extracted text is identical. Substantive reading does not extend to the complete text of every book.

### Files from this review

The [complete metadata catalogue — 2 736 files](https://drive.google.com/file/d/1GjtkUePa-PiUXSn8UxfrPi4mJYAiq91v/view?usp=drivesdk) and [detailed evidence, limitations and proposed exercises](https://drive.google.com/file/d/1JZV9xZcSgjo0rFYCZBL5Ob4I4zPtuBfb/view?usp=drivesdk) are stored in 03_Development.


## Additional sources used for release 1.2

| Code and source | Material actually used | Application and limitations |
|---|---|---|
| **S14 — [Hunter Engineering, Take Control of ADAS Calibrations](https://www.hunter.com/media-center/industry-insights/take-control-of-adas-calibrations/)** | Checked on 25.09.2026. The material states that an OEM may require ADAS calibration after wheel alignment for some vehicles and that the applicable requirement must be checked against the manufacturer's procedure. | Basis for a **conditional** ADAS task after alignment. It is not treated as a universal requirement for every model and does not determine the exercise durations. |
| **S15 — [Bosch Mobility Aftermarket, ESI[tronic]](https://www.boschaftermarket.com/afr/en/diagnostic/ecu-diagnosis/esitronic/)** | Checked on 25.09.2026. Describes diagnostic functions, including system calibration, and Secure Diagnostic Access for protected systems. | Basis for checking that the station has the required software/scanner function and access to the protected system before promising a completion time. It does not establish that a particular software version is suitable for a particular VIN. |

### How S14–S15 informed release 1.2

The `ADAS` sheet does not claim that calibration is required after every wheel-alignment adjustment. “Does the OEM instruction require calibration/reset?” is an editable input. The student must separately check the applicable OEM procedure, equipment/targets/scanner, any required protected access and the availability of a trained worker. The 1.0-hour procedure and 5.0-hour waiting/transfer period for outsourced work are synthetic conditions of the teaching case.
