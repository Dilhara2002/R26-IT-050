# Frozen v2 relevance candidate — single-reviewer extension evaluation

This is a one-time, single-reviewer human relevance evaluation across 20 verified Matale/Nuwara Eliya POIs and three held-out profiles. It is not an independent dual review and is not combined with the prior Kandy development/reference result.

- Workbook SHA-256: `2bc4408f840087a152fecefb2a933ab1746177b72b599dc8f8c90a8668379a4a`
- Candidate SHA-256: `f1d6ce2c018658d3305c4772a40f959bcff4b9041e3eacff8726bdb82bf82913`
- Correct predictions: **36/60**
- Accuracy: **0.600000**
- Balanced accuracy: **0.649123**
- Macro-F1: **0.577489**
- Weighted-F1: **0.655325**

## Class distributions

- Actual: `{'0': 16, '1': 6, '2': 38}`
- Predicted: `{'0': 19, '1': 24, '2': 17}`

## Per-class metrics

| Class | Precision | Recall | F1 | Support |
|---:|---:|---:|---:|---:|
| 0 | 0.842105 | 1.000000 | 0.914286 | 16 |
| 1 | 0.125000 | 0.500000 | 0.200000 | 6 |
| 2 | 1.000000 | 0.447368 | 0.618182 | 38 |

## Confusion matrix

`[[16, 0, 0], [3, 3, 0], [0, 21, 17]]`

## Fixed-seed stratified bootstrap 95% intervals

- accuracy: [0.500000, 0.700000]
- balanced_accuracy: [0.511696, 0.786550]
- macro_f1: [0.486762, 0.671758]

## Activation gate

Overall: **FAIL**

- accuracy_at_least_0_80: **FAIL** — `{'value': 0.6, 'threshold': 0.8, 'passed': False}`
- macro_f1_at_least_0_65: **FAIL** — `{'value': 0.5774891774891775, 'threshold': 0.65, 'passed': False}`
- balanced_accuracy_at_least_0_70: **FAIL** — `{'value': 0.6491228070175439, 'threshold': 0.7, 'passed': False}`
- recall_at_least_0_50_every_represented_class: **FAIL** — `{'values': {'0': 1.0, '1': 0.5, '2': 0.4473684210526316}, 'threshold': 0.5, 'passed': False}`

## Misclassified judgement IDs

`['P08::wikidata-Q37700', 'P13::wikidata-Q97262496', 'P13::wikidata-Q65949703', 'P13::wikidata-Q5640438', 'P08::wikidata-Q23585049', 'P13::wikidata-Q37551', 'P08::wikidata-Q18915186', 'P13::wikidata-Q38350', 'P08::wikidata-Q37551', 'P13::wikidata-Q25104534', 'P06::osm-node-2714398529', 'P13::wikidata-Q23585049', 'P06::wikidata-Q37551', 'P08::wikidata-Q97262496', 'P13::wikidata-Q37700', 'P08::wikidata-Q5640438', 'P08::wikidata-Q19710937', 'P08::wikidata-Q1146327', 'P13::wikidata-Q18915186', 'P13::wikidata-Q1146327', 'P06::wikidata-Q38350', 'P13::wikidata-Q19710937', 'P08::wikidata-Q38350', 'P08::wikidata-Q25104534']`

Panel-safe sentence: The frozen v2 relevance candidate was evaluated once against 60 labels from one human reviewer covering 20 verified Matale/Nuwara Eliya POIs and three held-out profiles; the reported accuracy applies only to that bounded evaluation.
