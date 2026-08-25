# Safety-Aware Tourism Backend

## Overview

This Express backend supports a Sri Lankan tourism safety-aware vehicle recommendation workflow. It combines:

- route risk classification with the deployed model selected by the reproducible v2 workflow;
- Neo4j historical safety evidence;
- vehicle suitability, category filtering, pricing, and risk-aware ranking; and
- route, location-resolution, and current weather context.

The ML model classifies a route's historical hazard/risk severity as **Low**, **Medium**, or **High**. It does **not** predict accident probability.

## Recommended Lower-Risk Route

`POST /api/safety/recommend-route` accepts `startingLocation` and
`destination`. It uses the existing location-resolution flow and requests
alternatives, step road labels, and GeoJSON geometry from OSRM. Candidates are
evaluated only when provider road labels match a supported route family in the
cached road dataset. A candidate mapped to evidence already used by another
alternative is marked insufficient for distinct comparison rather than being
given a fabricated score.

Evaluable routes reuse the deployed Gradient Boosting classifier. Ranking is
deterministic: predicted risk class, lower High-class probability, lower
Medium-class probability, duration, distance, then route ID. Neo4j may
populate classifier inputs, but graph counts are not used as a separate route
tie-break because their cross-route comparability is not assured. Coverage is
reported explicitly as full provider-label coverage, partial provider-label
coverage, or unavailable.

This research prototype recommends a lower-risk route only among alternatives
with usable, distinct evidence. It does not identify or guarantee a safest
route. When budget and passenger preferences are included, the same request
passes the winning route's private, backend-validated road context into the
shared vehicle recommendation logic. Client-supplied gradient, terrain, or
risk values are ignored. The existing vehicle endpoint remains backward
compatible and uses the same vehicle helper.

The form uses one combined `recommend-route` request for route risk and vehicle
output. `routeResult.selectedRouteMode` is `lower-risk-recommended` only when
at least two candidates have distinct evaluable evidence. Otherwise it is
`default-analyzed-route`: the normal OSRM route, its real geometry, its risk
classification, and its backend road context remain in the response. An
unavailable alternative comparison therefore does not mean that the analyzed
route or its map is unavailable.

## Requirements

- Node.js and npm
- Python **3.14.4** (the currently verified project environment)
- Neo4j
- MongoDB, when MongoDB functionality is required by the wider backend
- Ollama (optional) for the final location typo-candidate fallback

## Installation

From the `backend` directory:

```bash
npm install

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Environment Setup

Create a local environment file and add your own credentials:

```bash
cp .env.example .env
```

The supported variables are:

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port; defaults to `5001`. |
| `MONGO_URI` | Optional MongoDB connection string. |
| `NEO4J_URI` | Neo4j Bolt URI; default is `bolt://localhost:7687`. |
| `NEO4J_USERNAME` | Neo4j username; default is `neo4j`. |
| `NEO4J_PASSWORD` | Neo4j password. |
| `OPENWEATHER_API_KEY` | OpenWeather API key for trip weather context. |
| `GEOAPIFY_API_KEY` | Geoapify API key for location typo/autocomplete fallback. |
| `PYTHON_BIN` | Optional absolute Python interpreter override. |

Never commit `.env`, credentials, API keys, passwords, tokens, or connection strings. Use `.env.example` as the template, rotate any credential that has ever been exposed, and do not include secrets in logs, documentation, or screenshots.

## Python Runtime and Model Compatibility

The backend defaults to `backend/.venv/bin/python` for ML inference. Set `PYTHON_BIN` only when an explicit alternative interpreter is needed.

Python dependencies are pinned in `requirements.txt`. In particular, `scikit-learn==1.7.2` is pinned because the deployed model artifact was created with that version.

## Start the Backend

```bash
npm start
```

The default server URL is `http://localhost:5001`.

- Health endpoint: `GET /`
- Safety recommendation endpoint: `POST /api/safety/recommend-vehicle`

Example request:

```bash
curl -X POST http://localhost:5001/api/safety/recommend-vehicle \
  -H "Content-Type: application/json" \
  -d '{
    "startLocation": "Colombo",
    "endLocation": "Kandy",
    "budget": 15000,
    "passengers": 4,
    "preferredCategory": "SUV"
  }'
```

`preferredVehicle` remains supported for backward compatibility, but `preferredCategory` is the current request field.

## Architecture Summary

```text
User location input
  -> location resolution / typo correction
  -> driving route calculation
  -> route-family road dataset aggregation
  -> weather context
  -> Neo4j historical context
  -> selected v2 risk-model classification
  -> risk-aware vehicle filtering and ranking
  -> API response
```

### Location Resolution

The current lookup sequence is:

1. Nominatim direct lookup.
2. Geoapify typo/autocomplete candidates when configured.
3. Ollama candidate generation as a final fallback, followed by Nominatim geocoding verification.

Candidates must meet similarity checks and be geocoded before use. This approach does not guarantee resolution of every typo or ambiguous place name; uncertain matches can be rejected rather than silently routed to an unsafe or unrelated location.

### Road Data Behavior

`processed_roads.csv` currently has no latitude, longitude, or route-geometry fields, so exact traversed-segment matching is not possible. The backend identifies the best route family and aggregates its matched segments into one representative road profile:

| Field | Aggregation |
| --- | --- |
| Maximum gradient | Maximum |
| Average elevation | Arithmetic mean |
| Surface friction index | Arithmetic mean |
| Terrain type | Deterministic mode |
| Road surface condition | Deterministic mode |
| Typical road width | Deterministic mode |

The response exposes the aggregation type and number of segments used. Route-family aggregation is an approximation, not a replacement for geometry-based road matching.

### Runtime Data Access

`processed_roads.csv` and `processed_vehicles.csv` are static prototype datasets. They are parsed lazily once per backend process and then reused for later requests. Only successful parses are cached; a failed read is retried on the next request. Restart the backend after intentionally changing either file.

Live geocoding, routing, weather, and Neo4j retrieval are not cached by this layer. Weather remains live enrichment context. Python inference still starts one bounded subprocess per prediction request; the artifact is loaded once within that subprocess. A persistent Python inference service is intentionally out of scope for this local research-prototype architecture.

### Vehicle Recommendation

Vehicle candidates are filtered by:

- budget;
- passenger capacity;
- requested category (`preferredCategory`); and
- road-gradient suitability.

Remaining candidates are ranked according to the predicted risk level. The current transparent heuristic uses only fields available in the vehicle dataset: gradeability margin, maximum torque, engine capacity, and estimated hire price.

This ranking is not proof that a particular vehicle is objectively safer. The dataset does not provide safety attributes such as ABS, airbags, 4WD, or traction control, so the backend does not claim to evaluate them.

### Model-based Trip-cost Estimate

Vehicle responses calculate one user-facing trip-cost estimate from the selected model's dataset pricing fields: `BaseHireCharge + (DistanceKM × RentalPricePerKM)`. The structured `pricing` object exposes the model rate, base charge, route distance, currency, total, formula, source status, and verification state. The frontend presents the result as `Estimated Trip Cost`; it does not present or add a separate fuel-cost estimate.

The repository does not document a rental provider or verification date for these model-level rates. The API therefore reports `status: "dataset-baseline"`, `isLiveMarketRate: false`, and `requiresAdminVerification: true`. A future admin rate-management feature can replace these inputs with sourced and dated rates without changing the quote formula or frontend contract. Until then, this is a research-dataset estimate rather than an exact current Sri Lankan market fare.

### Neo4j and ML Graceful Degradation

- If Neo4j is unavailable, the request continues with `graphRAG.status: "unavailable"` and the ML/vehicle result can still be returned.
- If Python ML inference cannot start, crashes, returns invalid output, or reports failure, the endpoint returns HTTP `503` with `code: "ML_UNAVAILABLE"`.
- The backend does not fabricate a Low/Medium/High risk level when ML is unavailable.

### Weather Context

Weather is returned as current trip context. It is not used as an arbitrary manual multiplier on the ML risk score or as a deployed ML input. If weather is unavailable, the API returns unavailable/null context rather than implying that no rain was detected.

### Explainability Trace

Successful safety responses include an `explanation` object that separates:

- the predicted class, model name, and exact feature values supplied to the deployed classifier;
- classifier confidence, defined as the probability assigned by the classifier to its predicted class;
- contextual weather, route-family road aggregation, and Neo4j retrieval status; and
- deterministic vehicle filtering, risk-aware ranking, and stronger road-capability upsell rules.

Classifier confidence is **not calibrated real-world accident or disaster probability**, certainty, or model accuracy. The trace describes available model inputs and deterministic recommendation rules; it does not establish causal proof.

Neo4j retrieval can populate the named ML inputs `historical_occurrence_count`, `hazard_type`, and `season` when graph data is available. Its user-facing historical reasoning is retrieval context and does not independently generate or override the classifier prediction.

## Automated Tests

Run the regression suite before committing changes:

```bash
npm test
```

The suite covers:

- health endpoint contract;
- controlled input, location, road-data, and ML failure responses;
- Neo4j and weather graceful degradation;
- deterministic explanation metadata and recommendation-rule traces; and
- known and unavailable road-gradient behavior.

## Legacy / Research Artifacts

The following files are retained for historical research reproducibility and are not part of the active recommendation request path:

| File | Status | Notes |
| --- | --- | --- |
| `src/ai-engine/scripts/train_model.py` | Legacy training script | Older Random Forest regressor experiment that creates `safety_model.joblib`. |
| `src/ai-engine/scripts/safety_model.joblib` | Legacy model artifact | Not loaded by the current production inference path. |
| `src/test-llm.js` | Manual debug tooling | Optional standalone check for Ollama location candidates; it is not an automated test. |

The active ML path is `src/routes/safetyRoutes.js` -> `src/ai-engine/scripts/predict_safety.py` -> `src/ai-engine/scripts/risk_model_v2.joblib`. `src/ai-engine/scripts/train_models_v2.py` is the active research-training script for the v2 artifact.


## Dataset Provenance and Validity Limitations

The Safety Analyzer currently relies on three primary local input datasets:

- `src/ai-engine/data/Road Dataset.csv`
- `src/ai-engine/data/Disaster Dataset.csv`
- `src/ai-engine/data/vehicles.csv`

Derived artifacts include:

- `processed_roads.csv`
- `processed_disasters.csv`
- `processed_vehicles.csv`
- `risk_training_dataset.csv`
- `dataset_cleaning_report.csv`

The processed datasets and training dataset are generated or transformed by project scripts. However, the original authoritative source, publication URL, collection date, licence, geographic/temporal collection methodology, and data-generation methodology for the three primary input datasets are not currently documented in this repository.

Therefore, this project does not claim that the three source CSV files constitute independently verified, official, complete, or authoritative Sri Lankan road-safety ground truth.

Repository history confirms when the datasets were added to this project, but Git history does not establish who originally collected the data or how the underlying measurements were produced.

Earlier repository versions contained disaster records with advisory-authority fields such as `NBRO`, `DMC`, and `RDA/NBRO`. These values are treated only as dataset attributes and must not be interpreted as proof that the dataset was published, validated, or officially supplied by those organizations.

### Risk Label Definition

The ML target `risk_level` is derived deterministically from the `Severity Level` field in `Disaster Dataset.csv`.

The deployed model uses the classes:

- `Low`
- `Medium`
- `High`

`severity_level` is retained only as metadata and is not included as an ML input feature, preventing direct target leakage.

Because no authoritative external validation source for the severity labels is documented, `risk_level` should be interpreted as an internal proxy for historical hazard/risk severity rather than independently validated accident probability or objective road-safety ground truth.

### Road-Profile Coverage

The generated ML training dataset contains **598 records**.

Road-profile coverage is:

- **135 records (22.6%)** with available road-profile data.
- **463 records (77.4%)** without matching numeric road-profile data.

The disaster dataset contains 22 route families, while the current road dataset overlaps with only five:

- `A1`
- `A2`
- `A4`
- `A5`
- `A16`

The verified matching results are:

- 113 exact matches;
- 22 route-level matches; and
- 463 records with no road-data coverage.

The 463 uncovered rows are caused by source dataset coverage mismatch rather than a route-code join failure.

### Missing Road-Data Handling

When no road dataset coverage exists, the builder does not fabricate road measurements.

Instead:

- `gradient`, `elevation`, and `friction` remain missing;
- unavailable categorical road fields are represented as `Unknown`;
- `road_data_available` is set to `0`;
- `match_type` records the matching condition.

The ML preprocessing pipeline handles missing numeric values using median imputation and categorical values using most-frequent imputation.

`road_data_available` is included as an ML feature so the model can distinguish records with road evidence from records where road-profile information is unavailable.

Predictions for routes without road-profile coverage should therefore be interpreted primarily as historical hazard/risk classification with limited road-profile evidence.

### Research Validity Scope

The current implementation is a research prototype.

The following limitations must be considered when interpreting results:

- original dataset provenance is undocumented;
- authenticity and generation methodology of the three primary input datasets are not independently established;
- source severity labels have not been independently externally validated;
- 77.4% of training records lack matching numeric road-profile data;
- current road-profile matching is route-family based rather than geometry-based;
- the dataset does not represent complete Sri Lankan road coverage;
- reported ML metrics describe performance on the current research dataset rather than independently validated nationwide real-world road-safety accuracy.

Future work should prioritize authoritative dataset sourcing, source citations and licences, independently validated risk labels, broader road-profile coverage, and geometry-based road-segment matching.

## Important Limitations

- The model classifies historical hazard/risk severity rather than accident probability.
- Current road data has no geometry, so route-family aggregation is an approximation.
- Risk-aware vehicle ranking is a heuristic based only on available vehicle dataset attributes.
- Location typo resolution cannot guarantee a correct result for every ambiguous input.
- Weather is context only; it is not a validated live-score adjustment.

## Reproducibility Notes

- Python package versions are pinned in `requirements.txt`.
- ML inference uses `backend/.venv/bin/python` by default, unless `PYTHON_BIN` is set.
- Run `npm test` successfully before committing changes.
