# XEL-General 1.0 data sources

The frozen base lexicon is derived mechanically from
[ECDICT](https://github.com/skywind3000/ECDICT) at commit
`bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`.

The import is mechanical and reproducible:

- split the ECDICT `tag` field on ASCII whitespace;
- retain rows containing any exact `zk`, `gk`, `cet4`, `cet6`, `ky`, `toefl`,
  `ielts`, or `gre` tag;
- retain rows with a Collins rank or Oxford 3000 marker;
- additionally retain frequency fallback rows ranked at most 30,000 in BNC or
  FRQ when the NFKC-normalized headword is already lowercase, which avoids
  importing the large proper-name and acronym tail solely from corpus ranks;
- preserve every retained headword, including surface forms and expressions;
- normalize both actual and ECDICT-escaped CR/LF sequences before splitting
  definitions and translations into display lines;
- normalize lookup keys with Unicode NFKC followed by case folding;
- order by normalized key and then original spelling;
- preserve ECDICT definitions, translations, phonetics, exchange relations,
  examination tags, and available frequency metadata.

This policy freezes 34,137 unique keys. TOEFL, IELTS, and GRE remain available
as deterministic browse views without changing the canonical General rank.

ECDICT content remains attributed to ECDICT and is distributed under the
license copied to `dictionary/licenses/ECDICT-LICENSE.txt`. Personal Knowledge
content displayed by this site is authored and maintained separately.
