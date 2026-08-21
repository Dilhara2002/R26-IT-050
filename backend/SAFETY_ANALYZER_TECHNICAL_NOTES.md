# Safety Analyzer: Technical Notes

## 1. Component Objective

The Safety Analyzer supports a Sri Lankan tourism vehicle-recommendation workflow by combining:

- route-level risk classification;
- Neo4j historical hazard evidence;
- vehicle suitability and recommendation; and
- route and current-weather context.

## 2. ML Approach

The deployed artifact is a **Gradient Boosting** classifier selected by the reproducible v2 workflow. Its target classes are **Low**, **Medium**, and **High**. It classifies historical route hazard/risk severity; it does **not** estimate accident probability.

### Dataset Features

| Type | Features |
| --- | --- |
| Numeric | `gradient`, `elevation`, `friction`, `historical_occurrence_count`, `road_data_available` |
| Categorical | `terrain`, `road_surface`, `road_width`, `hazard_type`, `season` |

`route_code` is used for grouped evaluation, not as an ML feature.

## 3. Model Selection and Recorded Evidence

Training first creates one final unseen-route holdout with `GroupShuffleSplit`, grouping records by `route_code`. That holdout is excluded from all candidate comparison and selection. The development routes are used for 5-fold `GroupKFold` comparison of all candidates; the top two by CV Macro F1 are then evaluated with repeated unseen-route `GroupShuffleSplit` stability analysis over 10 development-only splits. The final holdout is evaluated once only after the deployment architecture is selected, then that architecture is refit on all 598 rows.

The active model artifact records **598 training rows** and **22 route groups**.

Recorded repeated-stability results (`model_stability_summary.csv`):

| Model | Mean development validation Macro F1 | Validation Macro F1 SD | Mean train-validation gap | Selected |
| --- | ---: | ---: | ---: | --- |
| Gradient Boosting | 0.8408 | 0.0332 | 0.1111 | Yes |
| Random Forest | 0.8218 | 0.0357 | 0.0822 | No |

Gradient Boosting was selected because it had the highest repeated development validation Macro F1. Its shortlisted CV Macro F1 was `0.7742 ± 0.0682`; its final untouched-holdout Macro F1 was `0.8780` and accuracy was `0.8820`. These values are evaluation evidence for this dataset, not an accident-probability claim.

## 4. Active Model Artifact Path

```text
src/ai-engine/scripts/train_models_v2.py
  -> src/ai-engine/scripts/risk_model_v2.joblib
  -> src/ai-engine/scripts/predict_safety.py
  -> src/routes/safetyRoutes.js
```

`predict_safety.py` loads the v2 artifact and returns the predicted class, class probabilities, model metadata, and exact input feature values to the route endpoint.

### Confidence Interpretation

When the selected classifier supports `predict_proba()`, `confidence` is the probability assigned by that classifier to its predicted class. It is exposed as `confidenceType: "predicted_class_probability"`. It is not calibrated real-world accident/disaster probability, certainty, or model accuracy. The current workflow does not perform probability calibration.

## 4.1 Explainability Trace

The successful API response includes a compact `explanation` object. It separates:

- `risk.modelInputs`: the values supplied to the deployed classifier;
- `contextualEvidence.weather`: current enrichment context, explicitly marked as not used as an ML input;
- `contextualEvidence.neo4j`: retrieval status and the graph-derived fields that can populate named ML inputs (`historical_occurrence_count`, `hazard_type`, and `season`); and
- `vehicleRecommendation` and `safetyUpsell`: deterministic budget, passenger, category, gradient, and ranking-rule evidence.

The trace documents evidence and rules available for a request. It is not a causal explanation or proof of a safety outcome.

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

Weather is returned as current trip context. It is not a deployed ML input and is not applied as an arbitrary manual multiplier to the ML risk score. Unavailable weather remains null/unavailable rather than being represented as no rain.

## 10. Failure Handling

- If Neo4j is unavailable, the request continues and `graphRAG.status` is `"unavailable"`.
- If Python inference is unavailable, the endpoint returns HTTP `503` with `code: "ML_UNAVAILABLE"`.
- No synthetic Low/Medium/High prediction is returned when ML is unavailable.

## 11. Automated Validation

The current backend regression suite has 17 deterministic tests protecting:

1. health endpoint response;
2. required-field validation;
3. invalid budget validation;
4. invalid passenger-count validation;
5. controlled location, road-data, and ML dependency failures;
6. Neo4j and weather graceful degradation;
7. risk and vehicle explanation traces; and
8. known and unavailable gradient behavior.

## 12. Reproducibility

- `requirements.txt` pins Python dependencies.
- `scikit-learn==1.7.2` is required for deployed model compatibility.
- The backend defaults to `backend/.venv/bin/python`.
- `PYTHON_BIN` can explicitly override that interpreter.
- The latest recorded `npm audit` and `npm audit --omit=dev` checkpoint reported zero known vulnerabilities.
- The latest recorded `npm test` checkpoint passed all 17 tests.

## 13. Frontend Integration Notes

- The frontend sends `preferredCategory`; it no longer depends on legacy `preferredVehicle`.
- `ML_UNAVAILABLE` is handled as an error, not a normal risk result.
- A null vehicle recommendation does not crash the result screen.
- For physical Expo devices, `EXPO_PUBLIC_API_BASE_URL` must point to a reachable LAN or tunnel backend URL; `localhost` only addresses the device itself.

## 14. Limitations

- The model is not an accident-probability model.
- The original source, licence, collection date, publication date, and generation methodology of the three primary input datasets are not documented in this repository.
- Repository evidence does not establish whether the primary road, disaster, and vehicle datasets are observed real-world data, manually curated data, synthetic/generated data, simulated data, augmented data, or a mixture.
- The ML target `risk_level` is a deterministic transformation of the source `Severity Level` field and should be treated as an internal proxy for historical hazard/risk severity.
- The source severity labels have not been independently externally validated.
- The current training dataset contains 598 records.
- Only 135 of 598 records (22.6%) have matching road-profile data.
- 463 of 598 records (77.4%) have no matching numeric road-profile data.
- The disaster dataset contains 22 route families, but only A1, A2, A4, A5, and A16 overlap with the current road dataset.
- Verified matching produced 113 exact matches, 22 route-level matches, and 463 no-road-data records.
- Missing road-profile measurements are not fabricated. Numeric road values remain missing and unavailable categorical fields are represented as `Unknown`.
- The current road dataset has no geometry.
- Route-family aggregation is an approximation and is not equivalent to exact traversed-segment analysis.
- The current datasets do not support a claim of complete nationwide Sri Lankan road coverage.
- Model performance metrics describe performance on the current research dataset and must not be interpreted as independently validated nationwide road-safety accuracy.
- Vehicle ranking is a heuristic based on available dataset attributes.
- Location typo handling cannot guarantee every ambiguous input.
- Graph reasoning is not full LLM GraphRAG.
- Classifier confidence is not calibrated real-world accident/disaster probability or model accuracy.
- Explainability traces describe available model inputs and deterministic rules; they do not prove causal safety relationships.

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
