# Safety-Aware Tourism Backend

## Overview

This Express backend supports a Sri Lankan tourism safety-aware vehicle recommendation workflow. It combines:

- route risk classification with a deployed Random Forest model;
- Neo4j historical safety evidence;
- vehicle suitability, category filtering, pricing, and risk-aware ranking; and
- route, location-resolution, and current weather context.

The ML model classifies a route's historical hazard/risk severity as **Low**, **Medium**, or **High**. It does **not** predict accident probability.

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
  -> Random Forest risk classification
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

### Vehicle Recommendation

Vehicle candidates are filtered by:

- budget;
- passenger capacity;
- requested category (`preferredCategory`); and
- road-gradient suitability.

Remaining candidates are ranked according to the predicted risk level. The current transparent heuristic uses only fields available in the vehicle dataset: gradeability margin, maximum torque, engine capacity, and estimated hire price.

This ranking is not proof that a particular vehicle is objectively safer. The dataset does not provide safety attributes such as ABS, airbags, 4WD, or traction control, so the backend does not claim to evaluate them.

### Neo4j and ML Graceful Degradation

- If Neo4j is unavailable, the request continues with `graphRAG.status: "unavailable"` and the ML/vehicle result can still be returned.
- If Python ML inference cannot start, crashes, returns invalid output, or reports failure, the endpoint returns HTTP `503` with `code: "ML_UNAVAILABLE"`.
- The backend does not fabricate a Low/Medium/High risk level when ML is unavailable.

### Weather Context

Weather is returned as current trip context. It is not used as an arbitrary manual multiplier on the ML risk score.

## Automated Tests

Run the regression suite before committing changes:

```bash
npm test
```

The suite covers:

- health endpoint contract;
- required-field validation;
- invalid budget validation;
- invalid passenger-count validation;
- successful response or controlled ML outage contract;
- vehicle category filtering;
- route-family aggregation; and
- Neo4j graceful-degradation contract.

## Legacy / Research Artifacts

The following files are retained for historical research reproducibility and are not part of the active recommendation request path:

| File | Status | Notes |
| --- | --- | --- |
| `src/ai-engine/scripts/train_model.py` | Legacy training script | Older Random Forest regressor experiment that creates `safety_model.joblib`. |
| `src/ai-engine/scripts/safety_model.joblib` | Legacy model artifact | Not loaded by the current production inference path. |
| `src/test-llm.js` | Manual debug tooling | Optional standalone check for Ollama location candidates; it is not an automated test. |

The active ML path is `src/routes/safetyRoutes.js` -> `src/ai-engine/scripts/predict_safety.py` -> `src/ai-engine/scripts/risk_model_v2.joblib`. `src/ai-engine/scripts/train_models_v2.py` is the active research-training script for the v2 artifact.

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
