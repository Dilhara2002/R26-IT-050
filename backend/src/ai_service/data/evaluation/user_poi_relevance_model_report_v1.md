# Itinerary User–POI Relevance Classifier v1

## Executive verdict

The frozen deployment candidate is **Linear SVM**, selected only from grouped weak-label training validation. Training used rule-derived weak supervision; final evaluation used a separately human-reviewed, profile-held-out 60-row test set.

## Dataset and reviewer evidence

- Weak-labelled training set: 240 pairs, 12 profiles, distribution `{'0': 126, '1': 50, '2': 64}`.
- Human-reviewed held-out set: 60 pairs, 3 profiles, distribution `{'0': 34, '1': 10, '2': 16}`.
- Reviewer agreement: 53/60 (88.33%), unweighted κ 0.793510, quadratic κ 0.883178.

## Leakage controls and features

Only `['user_interests', 'verified_poi_tags']` enter the pipeline. Excluded leakage/identity fields: `['adjudication_note', 'decision_type', 'final_adjudicated_label', 'final_relevance_label', 'interest_coverage', 'judgement_id', 'overlap_set', 'place_id', 'profile_id', 'reviewer_a_label', 'reviewer_b_label', 'row_order', 'weak_label']`. Profiles are separated with 4-fold `StratifiedGroupKFold`; preprocessors are inside each sklearn pipeline.

The transparent features are fixed per-category user flags, verified-POI tag flags, per-category user/tag interactions, user-interest count, and POI-tag count. Precomputed `overlap_set` and `interest_coverage` are deliberately excluded. Interaction features are scientifically justified because the target construct is pair relevance, but their close relationship to the deterministic weak-label rule can make weak-label CV optimistic.

## Model comparison

| Model | CV Macro-F1 mean ± SD | CV balanced accuracy | Train Macro-F1 | Gap | Held-out Macro-F1 | Held-out balanced accuracy |
|---|---:|---:|---:|---:|---:|---:|
| Dummy | 0.2235 ± 0.0516 | 0.3750 | 0.2288 | 0.0054 | 0.2411 | 0.3333 |
| Decision Tree | 0.4741 ± 0.0974 | 0.5843 | 1.0000 | 0.5259 | 0.4918 | 0.4944 |
| Random Forest | 0.5297 ± 0.1627 | 0.5817 | 0.9987 | 0.4691 | 0.4918 | 0.4944 |
| Linear SVM | 0.5426 ± 0.1634 | 0.6510 | 1.0000 | 0.4574 | 0.5196 | 0.5652 |

The Decision Tree and Dummy models are baselines only. The frozen rule selects among Random Forest and Linear SVM by grouped-CV Macro-F1; candidates within 0.005 use balanced accuracy, then lower Macro-F1 variability, then model name.

## Selected-model held-out evaluation

- Accuracy: **0.6833**
- Balanced accuracy: **0.5652**
- Macro-F1: **0.5196**
- Weighted-F1: **0.6282**
- Actual distribution: `{'0': 34, '1': 10, '2': 16}`
- Predicted distribution: `{'0': 42, '1': 15, '2': 3}`
- Confusion matrix: `[[33, 1, 0], [3, 6, 1], [6, 8, 2]]`
- Misclassified judgement IDs: `['P06::wikidata-Q3119056', 'P06::wikidata-Q7876953', 'P06::osm-node-11096423467', 'P06::osm-node-11583843280', 'P06::osm-node-5063761704', 'P06::osm-node-4440038982', 'P06::osm-node-4566489017', 'P06::osm-node-5299675266', 'P08::wikidata-Q3119056', 'P08::wikidata-Q5966035', 'P08::osm-node-4157023134', 'P08::osm-node-5299675266', 'P13::wikidata-Q3119056', 'P13::wikidata-Q7876953', 'P13::osm-node-11096423467', 'P13::osm-node-11583843280', 'P13::osm-node-5063761704', 'P13::osm-node-4440038982', 'P13::osm-node-4566489017']`

This accuracy is precisely the fraction of 60 human-reviewed user-profile–POI relevance classes correctly classified for three frozen Kandy preference profiles. It is not end-to-end itinerary quality, user satisfaction, route optimality, or nationwide recommendation accuracy.

## Old PP1 distinction

The old branch predicted `binary High_Quality = Rating >= 3.9` from tags. Its reproduced test accuracy was 94.00%, with class distribution `{'0': 62, '1': 938}` and confusion matrix `[[0, 7], [2, 141]]`. It missed every negative in that split and is not the deployed relevance task.

## Overfitting and limitations

- Weak-label CV measures reproduction/generalisation of rule-derived supervision across training profiles, not agreement with independent human preferences.
- The training feature interactions are close to the weak rule’s semantic construct, so very high weak-label CV is expected and must not be presented as real-user performance.
- The final set contains only 60 judgements from three held-out profiles over the same 20-POI catalogue; confidence intervals are wide and generalisability is limited.
- POI tags are verified, but the interest ontology and Kandy-only catalogue are narrow.
- Model probability/decision outputs are classification scores, not calibrated user-satisfaction probabilities.
- The relevance classifier gates candidates only; deterministic 70/30 ranking, time feasibility, and the seeded GA remain separate stages.

## Reproducibility

```powershell
backend\.venv\Scripts\python.exe -B backend\src\ai_service\scripts\train_relevance_model.py
```

Seed: `42`. scikit-learn: `1.7.2`. Dataset hashes are recorded in the metadata and metrics JSON.
