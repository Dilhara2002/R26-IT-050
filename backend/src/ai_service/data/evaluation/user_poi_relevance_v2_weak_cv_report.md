# Version-2 weak-supervision grouped-CV comparison

> These are weak-supervision validation results, not human relevance accuracy.

All tuning and selection used only 680 weak-labelled rows from 17 training profiles. The 120-row evaluation grid and reviewer workbooks were not loaded.

| Model | Train acc. | Train Macro-F1 | CV acc. | CV balanced acc. | CV Macro-F1 | CV weighted-F1 | Macro-F1 gap |
|---|---:|---:|---:|---:|---:|---:|---:|
| Dummy | 0.5382 | 0.2333 | 0.5508 ± 0.1390 | 0.3667 ± 0.0667 | 0.2336 ± 0.0362 | 0.4010 ± 0.1700 | -0.0003 |
| Decision Tree | 1.0000 | 1.0000 | 1.0000 ± 0.0000 | 1.0000 ± 0.0000 | 0.9333 ± 0.1333 | 1.0000 ± 0.0000 | 0.0667 |
| Random Forest | 1.0000 | 1.0000 | 1.0000 ± 0.0000 | 1.0000 ± 0.0000 | 0.9333 ± 0.1333 | 1.0000 ± 0.0000 | 0.0667 |
| Linear SVM | 1.0000 | 1.0000 | 1.0000 ± 0.0000 | 1.0000 ± 0.0000 | 0.9333 ± 0.1333 | 1.0000 ± 0.0000 | 0.0667 |

Selected candidate: **Linear SVM**.

Decision Tree and Dummy are baselines only. Random Forest and Linear SVM were both eligible. Selection used grouped-CV Macro-F1; candidates within 0.01 used balanced accuracy, smaller training-validation Macro-F1 gap, lower fold variability, then simpler model.

## Dummy

Parameters: `{}`

OOF confusion matrix: `[[366, 0, 0], [186, 0, 0], [128, 0, 0]]`

Per-class out-of-fold precision / recall / F1:

- Class 0: 0.5382 / 1.0000 / 0.6998 (support 366)
- Class 1: 0.0000 / 0.0000 / 0.0000 (support 186)
- Class 2: 0.0000 / 0.0000 / 0.0000 (support 128)

## Decision Tree

Parameters: `{"classifier__class_weight": null, "classifier__max_depth": 2, "classifier__min_samples_leaf": 5}`

OOF confusion matrix: `[[366, 0, 0], [0, 186, 0], [0, 0, 128]]`

Per-class out-of-fold precision / recall / F1:

- Class 0: 1.0000 / 1.0000 / 1.0000 (support 366)
- Class 1: 1.0000 / 1.0000 / 1.0000 (support 186)
- Class 2: 1.0000 / 1.0000 / 1.0000 (support 128)

## Random Forest

Parameters: `{"classifier__class_weight": null, "classifier__max_depth": 6, "classifier__max_features": 0.75, "classifier__min_samples_leaf": 3, "classifier__n_estimators": 100}`

OOF confusion matrix: `[[366, 0, 0], [0, 186, 0], [0, 0, 128]]`

Per-class out-of-fold precision / recall / F1:

- Class 0: 1.0000 / 1.0000 / 1.0000 (support 366)
- Class 1: 1.0000 / 1.0000 / 1.0000 (support 186)
- Class 2: 1.0000 / 1.0000 / 1.0000 (support 128)

## Linear SVM

Parameters: `{"classifier__C": 0.1, "classifier__class_weight": null}`

OOF confusion matrix: `[[366, 0, 0], [0, 186, 0], [0, 0, 128]]`

Per-class out-of-fold precision / recall / F1:

- Class 0: 1.0000 / 1.0000 / 1.0000 (support 366)
- Class 1: 1.0000 / 1.0000 / 1.0000 (support 186)
- Class 2: 1.0000 / 1.0000 / 1.0000 (support 128)

