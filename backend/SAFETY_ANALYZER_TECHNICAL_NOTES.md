# Safety Analyzer: Technical Notes

## 1. Component Objective

The Safety Analyzer supports a Sri Lankan tourism vehicle-recommendation workflow by combining:

- route-level risk classification;
- Neo4j historical hazard evidence;
- vehicle suitability and recommendation; and
- route and current-weather context.

## 2. ML Approach

The deployed artifact is a **Random Forest** classifier. Its target classes are **Low**, **Medium**, and **High**. It classifies historical route hazard/risk severity; it does **not** estimate accident probability.

### Dataset Features

| Type | Features |
| --- | --- |
| Numeric | `gradient`, `elevation`, `friction`, `historical_occurrence_count`, `road_data_available` |
| Categorical | `terrain`, `road_surface`, `road_width`, `hazard_type`, `season` |

`route_code` is used for grouped evaluation, not as an ML feature.

## 3. Model Selection and Recorded Evidence

Training uses an unseen-route holdout (`GroupShuffleSplit`) and 5-fold `GroupKFold`, grouping records by `route_code` so a route is not shared across evaluation groups. A separate repeated unseen-route stability comparison evaluates Random Forest and Gradient Boosting over 10 grouped splits.

The active model artifact records **598 training rows** and **22 route groups**.

Recorded repeated-stability results (`model_stability_summary.csv`):

| Model | Mean test Macro F1 | Test Macro F1 SD | Mean train-test gap | Selected |
| --- | ---: | ---: | ---: | --- |
| Random Forest | 0.8406 | 0.0524 | 0.0602 | Yes |
| Gradient Boosting | 0.8341 | 0.0568 | 0.1121 | No |

Random Forest was selected because the recorded repeated unseen-route comparison gave it the higher mean test Macro F1 and lower generalization gap. The single recorded GroupKFold comparison also contains these Random Forest values: CV Macro F1 `0.7723 ± 0.0649`, untouched-test Macro F1 `0.8614`, and untouched-test accuracy `0.8758`. These values are evaluation evidence for this dataset, not an accident-probability claim.

## 4. Active Model Artifact Path

```text
src/ai-engine/scripts/train_models_v2.py
  -> src/ai-engine/scripts/risk_model_v2.joblib
  -> src/ai-engine/scripts/predict_safety.py
  -> src/routes/safetyRoutes.js
```

`predict_safety.py` loads the v2 artifact and returns the predicted class, class probabilities, and model metadata to the route endpoint.

## 5. Knowledge Graph Evidence

Neo4j stores route and historical hazard context. It supports the ML input and user-facing historical evidence, but does not replace the ML classifier.

Current graph reasoning is deterministic/template-based after Neo4j retrieval. It is not full LLM-based GraphRAG reasoning.

## 6. Location Handling

The current fallback chain is:

```text
Nominatim direct lookup
  -> Geoapify typo/autocomplete candidates
  -> Ollama candidate generation
  -> Nominatim verification
```

Candidates are checked for similarity and geocoded before acceptance. Uncertain or unsafe matches can be rejected; this does not guarantee correction of every ambiguous or misspelled location.

## 7. Road Matching and Aggregation

`processed_roads.csv` does not currently contain latitude, longitude, or route geometry. Exact traversed-segment matching is therefore not possible. The backend identifies a matched route family and aggregates its matching segments as follows:

| Road field | Aggregation rule |
| --- | --- |
| Max Gradient | Maximum |
| Average Elevation | Arithmetic mean |
| Surface Friction Index | Arithmetic mean |
| Terrain Type | Deterministic mode |
| Road Surface Condition | Deterministic mode |
| Typical Road Width | Deterministic mode |

The API exposes the aggregation type and aggregated segment count. This is a route-family approximation.

## 8. Vehicle Recommendation

Vehicles are filtered by budget, passenger capacity, requested category, and gradient/gradeability suitability. Remaining vehicles are ranked using the predicted risk level.

The current risk-aware ranking is a transparent heuristic using available dataset fields:

- gradeability margin;
- maximum torque;
- engine capacity; and
- estimated hire price.

This does not establish empirically proven crash safety. The dataset does not provide ABS, airbags, 4WD, traction control, or equivalent safety attributes.

## 9. Weather

Weather is returned as current trip context. It is not currently applied as an arbitrary manual multiplier to the ML risk score.

## 10. Failure Handling

- If Neo4j is unavailable, the request continues and `graphRAG.status` is `"unavailable"`.
- If Python inference is unavailable, the endpoint returns HTTP `503` with `code: "ML_UNAVAILABLE"`.
- No synthetic Low/Medium/High prediction is returned when ML is unavailable.

## 11. Automated Validation

The current backend regression suite has eight tests protecting:

1. health endpoint response;
2. required-field validation;
3. invalid budget validation;
4. invalid passenger-count validation;
5. success response or controlled ML-outage contract;
6. vehicle-category filtering;
7. route-family aggregation; and
8. Neo4j graceful degradation.

## 12. Reproducibility

- `requirements.txt` pins Python dependencies.
- `scikit-learn==1.7.2` is required for deployed model compatibility.
- The backend defaults to `backend/.venv/bin/python`.
- `PYTHON_BIN` can explicitly override that interpreter.
- The latest recorded `npm audit` and `npm audit --omit=dev` checkpoint reported zero known vulnerabilities.
- The latest recorded `npm test` checkpoint passed all eight tests.

## 13. Frontend Integration Notes

- The frontend sends `preferredCategory`; it no longer depends on legacy `preferredVehicle`.
- `ML_UNAVAILABLE` is handled as an error, not a normal risk result.
- A null vehicle recommendation does not crash the result screen.
- For physical Expo devices, `EXPO_PUBLIC_API_BASE_URL` must point to a reachable LAN or tunnel backend URL; `localhost` only addresses the device itself.

## 14. Limitations

- The model is not an accident-probability model.
- The current road dataset has no geometry.
- Route-family aggregation is an approximation.
- Vehicle ranking is a heuristic based on available dataset attributes.
- Location typo handling cannot guarantee every ambiguous input.
- Graph reasoning is not full LLM GraphRAG.

## What this component can claim

- It classifies current route inputs into Low, Medium, or High historical hazard/risk severity classes.
- It provides Neo4j historical hazard evidence when available.
- It filters and ranks vehicles using budget, capacity, category, road-gradient suitability, and transparent available-attribute heuristics.
- It degrades safely when Neo4j or ML inference is unavailable.

## What this component should NOT claim

- “90% chance of accident” or any equivalent accident-probability interpretation.
- Exact GPS traversed-segment analysis.
- Empirically proven vehicle crash safety.
- Full LLM GraphRAG.
