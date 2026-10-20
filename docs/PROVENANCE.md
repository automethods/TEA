# Provenance — interactive release 0.2.1

Reviewed and assembled on 29 September 2026 from the user-supplied Drive sources.

| Source | Role in this release |
|---|---|
| [Automobile](https://hybridtrustmail.github.io/Automobile/) and its Drive `new` folder, v0.4.33 | Visual and instructional reference; original logo, college/department links, numbered formulas and teaching flow. The older Automobile EngDoc format is not used. |
| [TEA workbook v1.2](https://drive.google.com/file/d/1brdPv4UTiupGnBs02a-neB7cMP249BpS/view) | Current teaching scope; ADAS, pilot records and explicit parking intervals transcribed into `data/extras-v1.2.json`. |
| [TEA source archive v1.1](https://drive.google.com/file/d/1d4BtqFarIPhTLBqGPGP6_o0vb-TUKrsw/view) | Case data, ABS trace, archived expected metrics, original student/instructor guide text. The historical absolute build paths and artifact-library build dependency are not part of normal app execution. |
| [Current EngDoc workfolder](https://drive.google.com/drive/folders/1GpedVjvVZAxPJbnqTtlulVp_M-j94FgX) | Native draft 0.3 source snapshot. Individual Drive IDs and source SHA-256 hashes are in `vendor/engdoc/SOURCE_MANIFEST.json`. |
| [Literature collection](https://drive.google.com/drive/folders/1yIi7QHnPf4u811PtHiwFgq578rQcLMTQ) and TEA source register | Methodological context. This release also checked the provided Govorushchenko 1984 passage on service-station calculation, pp. 289–291. No historical coefficients were added as modern numerical requirements. |

`docs/SOURCES_UA.md` is the source register supplied with the existing TEA materials. Its descriptions of prior reviews and its 25 September access dates are retained as source history; they do not claim a new full review of every book in this implementation. `data/sources.json` is the shared bibliography used by both the interface and the report. Stale local attachment paths were removed.

The original logo comes from the user's Automobile assets. Original teaching content and EngDoc source retain their existing ownership; this package does not grant new redistribution rights to user-supplied material. Bundled third-party dependency notices are in `vendor/licenses`.

App version 0.2.1 and teaching-material version 1.2 are intentionally separate. Source data is local and fixed, so calculation results do not depend on later edits to Drive or websites.

Version 0.2.0 adds S16 (official M/N category labels), ST02 (the reviewed service-station passage) and SYN-02 (explicitly authored teaching presets). The reviewed passage informed separation of bay/off-bay labour, waiting/ready vehicles and space; it supplies none of the new numerical defaults. See `PRESETS.md` for the representative table and assumptions.

Version 0.2.1 checked the official Article 4 M/N category definitions against EUR-Lex and the DSTU 8302:2015 formatting guidance published by KPI. The category table distinguishes maximum vehicle mass from payload. Book titles/edition data were corrected using the supplied source register and Govorushchenko title/imprint OCR. Existing source access dates remain historical; bibliography formatting is not a new full review of every cited website.
