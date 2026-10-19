# IT22555458 developer source index

This is a source-code navigation index, not a thesis or research audit. Paths and symbols were checked against the working tree. Ownership labels describe **functional component boundaries**, not independently verified personal authorship. Shared and teammate algorithms must not be claimed as solely IT22555458 work. No training, holdout reevaluation or graph imports were performed for this index.

## Entry points and execution flow

1. `frontend/package.json` points Expo to `expo/AppEntry`, which loads `frontend/App.js`. `MainFlow.openModule("ishan")` displays `frontend/src/screens/TripInputScreen.js`.
2. `MainFlow.handleSubmit` → `frontend/src/api/safetyApi.js:getLowerRiskRoute` → POST `/api/safety/recommend-route`.
3. `backend/src/app.js` → `backend/src/routes/itinerarySafety.routes.js` → `recommendRouteSafety` in `backend/src/controllers/itinerarySafety.controller.js`.
4. `backend/src/services/safetyAnalysis.service.js:analyzeNamedSafetyRoute` / `analyzeSafetyLeg` → `routeService.js:getRouteAlternatives` (OSRM/geocoding) → road-family matching → `graphManager.getMLRiskContext` → `runRiskPrediction`.
5. Risk inference launches `backend/src/ai-engine/scripts/predict_safety.py` as a **Python subprocess**. Its `predict_risk` loads the existing v2 pipeline. It is not an HTTP call to Flask's itinerary optimizer.
6. `graphManager.getSafetyReasoning` adds actual historical records when available. Weather comes from `weatherService.js`. Graph evidence, road coverage and model inference remain distinct.
7. `getWholeTripVehicleRecommendation` delegates to `recommendVehicle`: capacity, category, gradient and budget checks; risk-dependent ordering; base charge plus distance × per-km rate. `vehiclePricing.service.js` optionally overlays admin-sourced rates.
8. Controller JSON → safety result screen → `VehicleCard` / map → `TripReviewScreen`. Prediction confidence is not model accuracy or accident probability.
9. Shared itinerary path: `frontend/screens/HomeScreen.js` → `frontend/services/api.js` → `/api/itinerary/optimize` → `optimizeItinerary` → `generateItineraryFromAI` → Flask `backend/src/ai_service/app.py:optimize_itinerary` → Sasanka's `model.py`/`road_routing.py` → optional MongoDB `Itinerary.planningSnapshot`.
10. `frontend/screens/ResultScreen.js` → `buildItineraryVehiclePayload` → `/api/safety/recommend-itinerary` → `recommendItinerarySafety`. It includes return exactly once, processes legs with bounded concurrency and withholds definitive whole-trip quotations for incomplete evidence.
11. Authentication: traveller `/api/auth/register|login` or admin `/api/admin/login` → server session → HttpOnly browser cookie → `/api/auth/session` before protected navigation. Logout revokes the current opaque session. Navigation snapshots are not authentication evidence.

## Component boundaries and evaluation

- **MY COMPONENT:** route-risk orchestration, saved risk inference, historical safety graph retrieval, route/road matching, vehicle suitability/pricing and weather/output semantics.
- **SHARED INTEGRATION:** Express shell, auth/navigation, itinerary-to-safety payload/controller, itinerary persistence, shared map/evidence UI and startup configuration.
- **TEAMMATE DEPENDENCY:** itinerary optimization/relevance, hotel/activity/package algorithms and landmark recognition. The Python itinerary model is not the Gradient Boosting risk model.
- Risk output is a learned Low/Medium/High label from road/hazard/context features. It is not a calibrated prediction that a road will be safe on a future date.
- Neo4j supplies matched historical hazards and context; record retrieval is not independent real-world validation.
- Vehicle selection is deterministic filtering/ranking with dataset/admin rate estimates, not another trained vehicle ML model.
- Existing evaluation artifacts report Gradient Boosting holdout accuracy 88.20% and Macro-F1 0.8780; development/holdout evaluation is distinct from the deployed model refit on all available training rows. Those metrics were not recalculated here.
- Import/training/legacy scripts are indexed for explanation only; their presence does not establish they are safe or needed to run during a demonstration.

## Source inventory

Each row gives the exact path, purpose, relevant identifiers, inputs/outputs, connections and functional ownership.

| Path | Purpose | Important functions/classes/identifiers | Inputs → outputs | Connects to | Ownership |
|---|---|---|---|---|---|
| backend/src/services/safetyAnalysis.service.js | Current route/leg orchestration and whole-trip vehicle rules. | analyzeSafetyLeg, analyzeNamedSafetyRoute, getRoadDataByRouteLabels, buildMlInput, runRiskPrediction, recommendVehicle, getWholeTripVehicleRecommendation, compareRoutes | Route endpoints + preferences → evaluated leg, evidence, route choice, vehicle quote. | backend/src/ai-engine/knowledge-graph/graphManager.js; backend/src/services/routeService.js; backend/src/services/weatherService.js; backend/src/services/vehiclePricing.service.js | MY COMPONENT |
| backend/src/controllers/itinerarySafety.controller.js | Validates named/itinerary requests; aggregates legs and withholds incomplete quotes. | recommendRouteSafety, recommendItinerarySafety, validateRequest, settleWithConcurrency | Named route or ordered stops → safety/vehicle JSON. | backend/src/services/safetyAnalysis.service.js | SHARED INTEGRATION |
| backend/src/routes/itinerarySafety.routes.js | Mounts current named-route and itinerary safety endpoints. | router.post; recommendRouteSafety; recommendItinerarySafety | POST /recommend-route and /recommend-itinerary → controller. | backend/src/controllers/itinerarySafety.controller.js | SHARED INTEGRATION |
| backend/src/routes/safetyRoutes.js | Older single-route endpoint with its own vehicle filtering and compatibility helpers. | router.post, getRoadData, runRiskPrediction, buildMLInput, calculateHirePrice, buildVehiclePriceQuote, calculateVehicleSuitability, compareVehiclesByRisk | POST /recommend-vehicle → single-route recommendation. | backend/src/services/routeService.js; backend/src/services/weatherService.js; backend/src/ai-engine/knowledge-graph/graphManager.js; backend/src/services/vehiclePricing.service.js | MY COMPONENT |
| backend/src/services/routeService.js | Geocodes locations, fetches OSRM alternatives and normalizes geometry/time/distance. | geocodeLocation, similarityScore, getRouteDetails, getRouteAlternatives, getRouteAlternativesByCoordinates, requestRouteAlternatives, mapOsrmRoutes | Names or coordinates → route alternatives. | backend/src/services/llmLocationResolver.js | MY COMPONENT |
| backend/src/services/llmLocationResolver.js | Optional LLM-assisted location candidates; not the risk model. | getLocationCandidates | Location text → candidate places. | See execution flow / dataset section | MY COMPONENT |
| backend/src/services/weatherService.js | Fetches bounded weather requests and represents unavailable rain as null. | normalizeWeather, getWeatherByCoordinates | Coordinates → normalized weather and nullable rain. | See execution flow / dataset section | MY COMPONENT |
| backend/src/services/vehiclePricing.service.js | Reads optional administrator rate overrides and overlays vehicle baselines. | getPricingOverrides, applyPricingOverride | Dataset vehicle + Mongo overrides → priced vehicle. | backend/src/models/VehiclePricing.js | MY COMPONENT |
| backend/src/models/VehiclePricing.js | Stores per-model administrator pricing provenance. | vehiclePricingSchema; VehiclePricing model | Verified rate fields → Mongo pricing document. | See execution flow / dataset section | MY COMPONENT |
| backend/src/config/neo4j.js | Creates the existing configured Neo4j driver; read connectivity checks. | driver, verifyNeo4jConnection, closeNeo4jConnection | Environment settings → driver / connectivity result. | See execution flow / dataset section | SHARED INTEGRATION |
| backend/src/config/neo4j.config.js | Legacy import alias for the shared graph driver. | driver re-export | Old driver imports → same configured driver. | backend/src/config/neo4j.js | SHARED INTEGRATION |
| backend/src/ai-engine/knowledge-graph/graphManager.js | Retrieves route/segment hazards and builds historical model context and explanations. | GraphManager.getRouteRisks, mapRiskRecord, getSafetyReasoning, getMLRiskContext | Route name/code → matched hazards, match type and ML context. | backend/src/config/neo4j.js | MY COMPONENT |
| backend/src/scripts/importToNeo4j.js | Existing safety graph importer; NOT run in this task and not part of request-time retrieval. | Importer top-level workflow and helper functions; inspect before any use | Road/disaster/vehicle CSVs → graph writes when explicitly executed. | backend/src/config/neo4j.js | MY COMPONENT |
| backend/src/ai-engine/scripts/predict_safety.py | Loads the saved risk pipeline and performs JSON inference. | load_artifact, prepare_input, predict_risk, main | Feature JSON → Low/Medium/High and class probabilities. | See execution flow / dataset section | MY COMPONENT |
| backend/src/ai-engine/scripts/build_dataset.py | Builds risk training rows with road-profile matching and repair metadata. | load_and_repair_disaster_dataset, load_road_dataset, create_route_profile, build_dataset | Original road/disaster CSVs → risk_training_dataset.csv. | See execution flow / dataset section | MY COMPONENT |
| backend/src/ai-engine/scripts/train_models_v2.py | Original grouped development comparison, holdout evaluation and final refit. | create_preprocessor, get_models, create_final_holdout, run_development_cv, select_cv_shortlist, run_development_stability, evaluate_final_holdout, train_and_compare | Training rows → comparison/stability evidence and saved pipeline. | See execution flow / dataset section | MY COMPONENT |
| backend/src/ai-engine/scripts/compare_model_stability.py | Existing stability-analysis entry point; not executed here. | module default / configuration | Prepared data/model comparison configuration → stability evidence. | backend/src/ai-engine/scripts/train_models_v2.py | MY COMPONENT |
| backend/src/ai-engine/scripts/preprocess.py | Legacy dataset preprocessing and column encoding. | encode_column, clean_columns, load_and_preprocess | Raw CSVs → processed CSVs. | See execution flow / dataset section | MY COMPONENT |
| backend/src/ai-engine/scripts/train_model.py | Legacy safety model training; distinct from selected v2 model. | train_safety_engine | Processed rows → older safety_model.joblib. | See execution flow / dataset section | MY COMPONENT |
| backend/src/app.js | Express startup, CORS, API mounting, MongoDB/Neo4j initialization. | app, connectInfrastructure, startServer | HTTP requests + environment → mounted APIs. | backend/src/routes/hotelData.routes.js; backend/src/routes/safetyRoutes.js; backend/src/routes/itinerarySafety.routes.js; backend/src/routes/itinerary.routes.js; backend/src/routes/admin.routes.js; backend/src/routes/auth.routes.js; backend/src/services/session.service.js; backend/src/services/adminAuth.service.js; backend/src/config/neo4j.js | SHARED INTEGRATION |
| backend/src/controllers/itinerary.controller.js | Forwards planner payloads to Python and persists itinerary snapshots when MongoDB is ready. | buildItineraryPayload, optimizeItinerary | Planner request → AI result and persistence status. | backend/src/services/itinerary.service.js; backend/src/models/Itinerary.js | SHARED INTEGRATION |
| backend/src/routes/itinerary.routes.js | Mounts itinerary generation/persistence endpoint; no saved-itinerary read endpoint exists here. | router.post | POST /api/itinerary/optimize → optimizeItinerary. | backend/src/controllers/itinerary.controller.js | SHARED INTEGRATION |
| backend/src/services/itinerary.service.js | Calls Flask itinerary generation with bounded timeout and controlled errors. | generateItineraryFromAI, PYTHON_AI_TIMEOUT_MS | Planner payload → Python response / HTTP error. | See execution flow / dataset section | SHARED INTEGRATION |
| backend/src/models/Itinerary.js | Stores generated itinerary fields plus planningSnapshot. | itinerarySchema; Itinerary model | Generated plan → itineraries MongoDB document. | See execution flow / dataset section | SHARED INTEGRATION |
| backend/src/models/Traveller.js | Credential record for server-backed travellers; never assigns admin roles. | module default / configuration | Name/email/salted password hash → traveller document. | See execution flow / dataset section | SHARED INTEGRATION |
| backend/src/models/AuthSession.js | Server-side hashed opaque sessions with explicit expiry and TTL cleanup. | module default / configuration | Token hash, user ID, role, expiry → session document. | See execution flow / dataset section | SHARED INTEGRATION |
| backend/src/models/Admin.js | Existing administrator credential schema, preserved. | module default / configuration | Existing admin credentials → admin document. | See execution flow / dataset section | SHARED INTEGRATION |
| backend/src/routes/auth.routes.js | Traveller registration/login, session validation and logout endpoints. | module default / configuration | Credentials or HttpOnly cookie → authenticated identity/status. | backend/src/models/Traveller.js; backend/src/services/session.service.js | SHARED INTEGRATION |
| backend/src/services/session.service.js | Opaque session issuance, hashing, origin policy, expiry, revocation and password hashing. | SESSION_DURATION_MS, production, cookieName, cookieOptions, allowedOrigins, authCorsOptions, protectSessionRequest, sessionToken, revokeSession, clearSessionCookie, issueSession, readSession, hashTravellerPassword, verifyTravellerPassword, limitAuthAttempts | Credential/session input → verified account or failure. | backend/src/models/AuthSession.js; backend/src/models/Traveller.js; backend/src/models/Admin.js | SHARED INTEGRATION |
| backend/src/services/adminAuth.service.js | Existing admin password/token compatibility plus cookie-session role verification. | derivePassword, hashPassword, verifyPassword, tokenSecret, encode, createAdminToken, authenticateAdmin, seedAdmin | Admin credentials/session → authorization; explicit safe seeding. | backend/src/models/Admin.js; backend/src/services/session.service.js | SHARED INTEGRATION |
| backend/src/routes/admin.routes.js | Admin-only login and vehicle pricing API. | split, requireDatabase, datasetVehicles | Admin session + rate fields → verified pricing view/update. | backend/src/models/Admin.js; backend/src/models/VehiclePricing.js; backend/src/services/adminAuth.service.js; backend/src/services/session.service.js | SHARED INTEGRATION |
| frontend/App.js | Expo application navigation, server-session bootstrap and protected screen restoration. | App, MainFlow, withRouteData, handleAuth, handleSubmit, acceptSession, checkSession, logout | Session response + route state → protected screens. | frontend/src/api/safetyApi.js; frontend/src/styles/colors.js; frontend/src/screens/WelcomeScreen.js; frontend/src/screens/AuthScreen.js; frontend/src/screens/DashboardScreen.js; frontend/src/screens/ModuleScreen.js; frontend/src/screens/TripInputScreen.js; frontend/src/screens/ResultScreen.js; frontend/screens/HomeScreen.js; frontend/screens/ResultScreen.js; frontend/screens/ItineraryVehicleScreen.js; frontend/screens/MapScreen.js; frontend/src/screens/SafetyMapScreen.js; frontend/src/screens/TripReviewScreen.js; frontend/src/screens/LandmarkExplorerScreen.js; frontend/screens/LandmarkScannerScreen.jsx; frontend/screens/LandmarkChatScreen.jsx; frontend/src/screens/HotelHomeScreen.js; frontend/src/screens/HotelResultsScreen.js; frontend/src/screens/AdminPricingScreen.js; frontend/src/screens/LocationPickerScreen.js; frontend/src/api/adminApi.js; frontend/src/api/authApi.js; frontend/services/sessionNavigation.js; frontend/src/components/MobileBackButton.js | SHARED INTEGRATION |
| frontend/services/sessionNavigation.js | Stores non-credential navigation state per account and emits clean route paths. | screenPaths, mainPage, readNavigation, saveNavigation, clearNavigation, navigationForUrl, navigationForLink, hasRequiredRouteData | Navigation/trip state → sessionStorage snapshot / restored screen. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/src/api/authApi.js | Credentialed traveller/session API client; native token is memory-only. | rememberSession, sessionRequestConfig, restoreSession, travellerAuth, endSession | Credentials/cookie → server session. | frontend/src/api/apiBase.js | SHARED INTEGRATION |
| frontend/src/api/adminApi.js | Administrator login and pricing requests. | adminLogin, getVehiclePricing, updateVehiclePricing | Admin session/rates → admin response. | frontend/src/api/apiBase.js; frontend/src/api/authApi.js | SHARED INTEGRATION |
| frontend/src/api/apiBase.js | Chooses web/native development hosts and environment API overrides. | developmentHost, clean, API_BASE_URL, ITINERARY_API_BASE_URL, AI_SERVICE_BASE_URL | Platform/config → API base URLs. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/src/api/safetyApi.js | Calls route and itinerary safety endpoints and preserves structured error responses. | getVehicleRecommendation, getLowerRiskRoute, getItinerarySafetyRecommendation | Trip/itinerary payload → recommendation JSON. | frontend/src/api/apiBase.js | MY COMPONENT |
| frontend/src/api/locationApi.js | Location-picker/geocoding API client. | searchSriLankanLocations | Location input → selected place candidates. | See execution flow / dataset section | MY COMPONENT |
| frontend/src/screens/TripInputScreen.js | Collects budget, passengers, locations and vehicle category. | TripInputScreen | Props / route.params → rendered screen and navigation actions. | frontend/src/styles/colors.js; frontend/src/api/locationApi.js; frontend/src/components/MobileBackButton.js | MY COMPONENT |
| frontend/src/screens/ResultScreen.js | Displays route risk, graph/road/model evidence, weather and vehicle options. | ResultScreen | Props / route.params → rendered screen and navigation actions. | frontend/src/styles/colors.js; frontend/src/components/VehicleCard.js; frontend/src/components/RiskCard.js; frontend/src/components/MobileBackButton.js; frontend/src/utils/safetyOutput.js | MY COMPONENT |
| frontend/src/screens/SafetyMapScreen.js | Displays the selected safety route geometry. | SafetyMapScreen | Props / route.params → rendered screen and navigation actions. | frontend/src/components/SafetyRouteMap.js | MY COMPONENT |
| frontend/src/screens/TripReviewScreen.js | Reviews the chosen vehicle, risk and quote; reconnects to hotel planning. | TripReviewScreen | Props / route.params → rendered screen and navigation actions. | frontend/src/styles/colors.js | MY COMPONENT |
| frontend/src/screens/LocationPickerScreen.js | Supports selecting route endpoints on a map. | LocationPickerScreen | Props / route.params → rendered screen and navigation actions. | frontend/src/components/LocationPickerMap.js; frontend/src/styles/colors.js; frontend/src/components/MobileBackButton.js | MY COMPONENT |
| frontend/src/screens/AdminPricingScreen.js | Administrator UI for sourced vehicle rate overrides. | AdminPricingScreen | Props / route.params → rendered screen and navigation actions. | frontend/src/styles/colors.js; frontend/src/api/adminApi.js | SHARED INTEGRATION |
| frontend/src/screens/WelcomeScreen.js | Shared account entry and module navigation UI. | WelcomeScreen | User/session/callback props → shared application screen. | frontend/assets/ceylongo-logo.png | SHARED INTEGRATION |
| frontend/src/screens/AuthScreen.js | Shared account entry and module navigation UI. | AuthScreen | User/session/callback props → shared application screen. | frontend/src/styles/colors.js; frontend/src/components/MobileBackButton.js; frontend/assets/ceylongo-logo.png | SHARED INTEGRATION |
| frontend/src/screens/DashboardScreen.js | Shared account entry and module navigation UI. | DashboardScreen | User/session/callback props → shared application screen. | frontend/src/styles/colors.js; frontend/assets/ceylongo-logo.png | SHARED INTEGRATION |
| frontend/src/screens/ModuleScreen.js | Shared account entry and module navigation UI. | ModuleScreen | User/session/callback props → shared application screen. | frontend/src/styles/colors.js; frontend/src/components/MobileBackButton.js | SHARED INTEGRATION |
| frontend/src/components/VehicleCard.js | Reusable vehicle/risk/map/navigation display; .web uses browser implementation where present. | VehicleCard | Display data and callbacks → native/web UI. | frontend/src/styles/colors.js | MY COMPONENT |
| frontend/src/components/RiskCard.js | Reusable vehicle/risk/map/navigation display; .web uses browser implementation where present. | RiskCard | Display data and callbacks → native/web UI. | frontend/src/styles/colors.js | MY COMPONENT |
| frontend/src/components/SafetyRouteMap.js | Reusable vehicle/risk/map/navigation display; .web uses browser implementation where present. | SafetyRouteMap | Display data and callbacks → native/web UI. | See execution flow / dataset section | MY COMPONENT |
| frontend/src/components/SafetyRouteMap.web.js | Reusable vehicle/risk/map/navigation display; .web uses browser implementation where present. | marker, FitRoute, SafetyRouteMap | Display data and callbacks → native/web UI. | See execution flow / dataset section | MY COMPONENT |
| frontend/src/components/LocationPickerMap.js | Reusable vehicle/risk/map/navigation display; .web uses browser implementation where present. | LocationPickerMap | Display data and callbacks → native/web UI. | See execution flow / dataset section | MY COMPONENT |
| frontend/src/components/LocationPickerMap.web.js | Reusable vehicle/risk/map/navigation display; .web uses browser implementation where present. | ClickHandler, CurrentLocationCenter, LocationPickerMap | Display data and callbacks → native/web UI. | See execution flow / dataset section | MY COMPONENT |
| frontend/src/components/MobileBackButton.js | Reusable vehicle/risk/map/navigation display; .web uses browser implementation where present. | MobileBackButton | Display data and callbacks → native/web UI. | frontend/src/styles/colors.js | SHARED INTEGRATION |
| frontend/src/utils/safetyOutput.js | Truthful unknown-weather/evidence/comparison display formatting. | getSafetyOutputLabels | API response → display labels. | See execution flow / dataset section | MY COMPONENT |
| frontend/src/styles/colors.js | Shared visual palette used by safety and auth screens. | colors | Color constants → screen styles. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/services/itineraryVehicle.js | Transforms ordered itinerary into safety payload and derives partial-summary coverage. | buildItineraryVehiclePayload, buildItinerarySafetySummary | Planner result + vehicle preferences → API payload / safety summary. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/screens/ItineraryVehicleScreen.js | Calls itinerary safety; shows leg coverage/return leg, quotes and restored view state. | ItineraryVehicleScreen, analyze, Metric | Itinerary + preferences → per-leg results and vehicle selection. | frontend/src/components/VehicleCard.js; frontend/src/api/safetyApi.js; frontend/src/styles/colors.js; frontend/services/itineraryVehicle.js | SHARED INTEGRATION |
| frontend/screens/HomeScreen.js | Shared planner form and trip options; leads into itinerary generation. | isSupportedStartingPoint, withTimeout, HomeScreen, StepHeader, Field | Preferences/time/location/return flag → optimize request. | frontend/services/api.js; frontend/services/roadEvidence.js; frontend/services/itineraryValidation.js; frontend/components/MapPicker.js; frontend/src/styles/colors.js | SHARED INTEGRATION |
| frontend/screens/ResultScreen.js | Planner result and regeneration UI; hands the plan into vehicle matching. | displayNumber, ResultScreen, Metric, EvidenceRow, StatusMessage, ActionButton | Planner data → itinerary display / vehicle navigation. | frontend/services/api.js; frontend/components/RoadEvidencePanel.js; frontend/src/styles/colors.js; frontend/services/itineraryRegeneration.js | SHARED INTEGRATION |
| frontend/screens/MapScreen.js | Shared optimized-itinerary map wrapper. | MapScreen | Starting location, ordered stops, geometry → map. | frontend/components/ResultMap.js; frontend/src/components/MobileBackButton.js | SHARED INTEGRATION |
| frontend/services/api.js | Axios instance for shared itinerary endpoint. | ITINERARY_API_TIMEOUT_MS | Planner request → Express itinerary API. | frontend/src/api/apiBase.js | SHARED INTEGRATION |
| frontend/services/itineraryValidation.js | Validates planner form values and controlled failures. | MAX_ITINERARY_MINUTES, MIN_RADIUS_KM, MAX_RADIUS_KM, parseOptionalWholeNumber, parseAvailableTime, parseDecimal, parseStartingCoordinates, parseOptionalRadius, formatAvailableTime, validateItineraryForm, itineraryRequestError | User form fields → normalized valid input or errors. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/services/itineraryRegeneration.js | Maintains regeneration constraints and planner explanations. | validGuideExplanation, parseGuideExplanation, stablePlaceIds, canonicalSignature, signatureKey, validatedTargetStopCount, normalizeRecentSignatures, createRegenerationContext, recordSuccessfulPlan, baseRequest, buildReplacementRequest, buildFullRegenerationRequest, regenerationErrorMessage, regenerationErrorKind, regenerationRecoveryMessage, applySuccessfulRegeneration, applyFailedRegeneration | Current plan and user change → next planner payload. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/services/roadEvidence.js | Builds road-day-plan options and optional field-observation exports. | buildRoadOptions, roadLegs, googleLegLink, optionalMinutes, buildEvidence, evidenceCsv | Schedule/return flag/observations → planner options or evidence packet. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/components/RoadEvidencePanel.js | Displays road estimates and optional observation entry UI. | clock, RoadEvidencePanel, Input, Button | Plan and observations → evidence UI/export. | frontend/services/roadEvidence.js | SHARED INTEGRATION |
| frontend/components/ResultMap.js | Native itinerary map component. | ResultMap | Stops/start/geometry → native map. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/components/ResultMap.web.js | Browser itinerary map component. | numberedIcon, FitMapBounds, ResultMap | Stops/start/geometry → Leaflet map. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/components/MapPicker.js | Native planner starting-location picker. | MapPicker | Map input → coordinates. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/components/MapPicker.web.js | Browser planner starting-location picker. | ClickHandler, ViewportSync, MapPicker | Leaflet input → coordinates. | See execution flow / dataset section | SHARED INTEGRATION |
| backend/src/ai_service/app.py | Flask itinerary API and shared Python service; not the Gradient Boosting CLI. | RequestValidationError, _controlled_error, _finite_number, _normalize_id, _normalize_id_array, _normalize_plan_signature, _normalize_recent_plan_signatures, _verified_places_by_id, _validate_constraints, optimize_itinerary | Teammate inputs/results ↔ shared module boundary. | backend/src/ai_service/road_routing.py; backend/src/ai_service/model.py | TEAMMATE DEPENDENCY |
| backend/src/ai_service/model.py | Sasanka itinerary candidate selection/ordering and explanation implementation; not IT22555458 risk model. | _sha256, load_relevance_artifact, get_relevance_engine_metadata, initialize_ai_engine, calculate_haversine_distance, format_time_display, _drop_duplicate_places, filter_locations, evaluate_route, evaluate_route_details, calculate_route_capacity, repair_route, crossover_routes, mutate_route, _route_fitness, _stable_place_id_key, route_travel_distance_km, minimum_open_path_order, minimum_replacement_insertion_order, find_best_full_regeneration_route, _tournament_select, _optimize_route_indices, _text_metadata, build_stop_explanation, build_route_explanation, run_genetic_algorithm_details, run_genetic_algorithm, _is_usable_gemini_key, _gemini_auth_headers, _guide_has_required_sections, _final_gemini_model_output, _safe_guide_text, build_itinerary_guide_prompt, _safe_gemini_model_for_log, _log_gemini_failure, _log_gemini_success, generate_itinerary_summary | Teammate inputs/results ↔ shared module boundary. | backend/src/ai_service/relevance_features.py | TEAMMATE DEPENDENCY |
| backend/src/ai_service/road_routing.py | Road travel matrix/day scheduling used by the itinerary planner. | RoadRoutingError, _request, _number, validate_options, _matrix, RoadContext | Teammate inputs/results ↔ shared module boundary. | See execution flow / dataset section | TEAMMATE DEPENDENCY |
| backend/src/ai_service/relevance_features.py | Planner relevance feature pipeline imported by itinerary model. | normalize_tokens, make_pair_frame, RelevancePairFeatures | Teammate inputs/results ↔ shared module boundary. | See execution flow / dataset section | TEAMMATE DEPENDENCY |
| backend/src/controllers/hotelData.controller.js | Hotel/package requests and shared package-to-safety entry data. | buildGraphFromDataset, buildActivityGraph, generatePackageFromPrompt, priceSelectedHotel | Teammate inputs/results ↔ shared module boundary. | backend/src/services/csv.service.js; backend/src/services/hotelGraph.service.js; backend/src/services/activityGraph.service.js; backend/src/services/llm/extractor.service.js; backend/src/services/package.service.js; backend/src/services/liteApiHotelPricing.service.js | TEAMMATE DEPENDENCY |
| backend/src/routes/hotelData.routes.js | Hotel/activity/package endpoint mounting. | module default / configuration | Teammate inputs/results ↔ shared module boundary. | backend/src/controllers/hotelData.controller.js | TEAMMATE DEPENDENCY |
| backend/src/services/package.service.js | Teammate package recommendation service. | findMatchingPackages, findHotelById | Teammate inputs/results ↔ shared module boundary. | backend/src/config/neo4j.config.js | TEAMMATE DEPENDENCY |
| backend/src/services/schema.service.js | Queries hotel/activity graph vocabulary for the package system. | getGraphSchemaValues | Teammate inputs/results ↔ shared module boundary. | backend/src/config/neo4j.config.js | TEAMMATE DEPENDENCY |
| backend/src/services/hotelGraph.service.js | Teammate hotel graph data operations; not safety hazard matching. | createKnowledgeGraph | Teammate inputs/results ↔ shared module boundary. | backend/src/config/neo4j.config.js | TEAMMATE DEPENDENCY |
| backend/src/services/activityGraph.service.js | Teammate activity graph data operations; not safety hazard matching. | createActivityGraph | Teammate inputs/results ↔ shared module boundary. | backend/src/config/neo4j.config.js | TEAMMATE DEPENDENCY |
| backend/src/services/liteApiHotelPricing.service.js | External hotel price integration; distinct from vehicle pricing. | normalizeName, unavailable, apiBaseUrl, namesMatch, buildOccupancies, findRate, validateStayRequest, getHotelPrice | Teammate inputs/results ↔ shared module boundary. | See execution flow / dataset section | TEAMMATE DEPENDENCY |
| frontend/src/screens/HotelHomeScreen.js | Hotel/package planning input and navigation. | isoDateFromToday, HotelHomeScreen, Feature, StayField | Teammate inputs/results ↔ shared module boundary. | frontend/services/tourism/tourismApi.js; frontend/src/styles/colors.js | TEAMMATE DEPENDENCY |
| frontend/src/screens/HotelResultsScreen.js | Hotel/package results and existing safety/vehicle handoff. | text, normalize, HotelResultsScreen, SafetySummary, Budget, Preferences, HotelPricing, HotelCard | Teammate inputs/results ↔ shared module boundary. | frontend/src/styles/colors.js; frontend/services/tourism/tourismApi.js | TEAMMATE DEPENDENCY |
| frontend/screens/LandmarkScannerScreen.jsx | Existing landmark entry route, preserved by navigation. | InfoRow, SectionCard, LandmarkScannerScreen | Teammate inputs/results ↔ shared module boundary. | frontend/services/landmarkService.js; frontend/src/styles/colors.js; frontend/src/components/MobileBackButton.js | TEAMMATE DEPENDENCY |
| frontend/screens/LandmarkChatScreen.jsx | Existing landmark conversation route, preserved by navigation. | displayMessage, LandmarkChatScreen | Teammate inputs/results ↔ shared module boundary. | frontend/services/landmarkService.js; frontend/src/styles/colors.js; frontend/src/components/MobileBackButton.js | TEAMMATE DEPENDENCY |
| frontend/src/screens/LandmarkExplorerScreen.js | Existing landmark exploration screen. | LandmarkExplorerScreen | Teammate inputs/results ↔ shared module boundary. | frontend/src/api/landmarkApi.js; frontend/src/styles/colors.js | TEAMMATE DEPENDENCY |
| frontend/src/api/landmarkApi.js | Landmark API client; not route-risk inference. | recognizeLandmark | Teammate inputs/results ↔ shared module boundary. | frontend/src/api/apiBase.js | TEAMMATE DEPENDENCY |
| frontend/services/landmarkService.js | Additional landmark service integration. | parseResponse, fetchWithTimeout, predictLandmark, fetchSupportedLandmarks, sendLandmarkChatMessage | Teammate inputs/results ↔ shared module boundary. | frontend/src/api/apiBase.js | TEAMMATE DEPENDENCY |
| backend/src/services/llm/extractor.service.js | Package/travel language-model helper; distinct from the trained risk classifier. | extractPreferences | Prompt/structured request → interpreted or generated travel data. | backend/src/services/llm/ollama.service.js; backend/src/services/llm/promptTemplates.js; backend/src/services/llm/validator.service.js; backend/src/services/schema.service.js | TEAMMATE DEPENDENCY |
| backend/src/services/llm/itineraryGenerator.service.js | Package/travel language-model helper; distinct from the trained risk classifier. | generateItineraryText | Prompt/structured request → interpreted or generated travel data. | backend/src/services/llm/ollama.service.js | TEAMMATE DEPENDENCY |
| backend/src/services/llm/ollama.service.js | Package/travel language-model helper; distinct from the trained risk classifier. | askOllama | Prompt/structured request → interpreted or generated travel data. | See execution flow / dataset section | TEAMMATE DEPENDENCY |
| backend/src/services/llm/promptTemplates.js | Package/travel language-model helper; distinct from the trained risk classifier. | preferenceExtractionPrompt | Prompt/structured request → interpreted or generated travel data. | See execution flow / dataset section | TEAMMATE DEPENDENCY |
| backend/src/services/llm/validator.service.js | Package/travel language-model helper; distinct from the trained risk classifier. | validatePreferences | Prompt/structured request → interpreted or generated travel data. | See execution flow / dataset section | TEAMMATE DEPENDENCY |
| backend/src/services/csv.service.js | Generic CSV loader used by shared data services. | loadDataset | CSV path → row objects. | See execution flow / dataset section | SHARED INTEGRATION |
| backend/tests/auth.session.test.js | Focused Node regression scenarios for the named boundary. | node:test scenarios; see test names | Fixtures/mocks → assertions; no real training or production graph writes. | backend/src/models/Traveller.js; backend/src/models/AuthSession.js; backend/src/models/Admin.js; backend/src/models/VehiclePricing.js; backend/src/routes/auth.routes.js; backend/src/routes/admin.routes.js; backend/src/services/adminAuth.service.js | SHARED INTEGRATION |
| backend/tests/safety.validation.test.js | Focused Node regression scenarios for the named boundary. | node:test scenarios; see test names | Fixtures/mocks → assertions; no real training or production graph writes. | backend/src/app.js; backend/src/routes/safetyRoutes.js; backend/src/services/safetyAnalysis.service.js | MY COMPONENT |
| backend/tests/itinerary-safety.integration.test.js | Focused Node regression scenarios for the named boundary. | node:test scenarios; see test names | Fixtures/mocks → assertions; no real training or production graph writes. | backend/src/routes/itinerarySafety.routes.js; backend/src/services/safetyAnalysis.service.js; backend/src/services/routeService.js | MY COMPONENT |
| backend/tests/route-location-similarity.test.js | Focused Node regression scenarios for the named boundary. | node:test scenarios; see test names | Fixtures/mocks → assertions; no real training or production graph writes. | backend/src/services/routeService.js | MY COMPONENT |
| backend/tests/weather.service.test.js | Focused Node regression scenarios for the named boundary. | node:test scenarios; see test names | Fixtures/mocks → assertions; no real training or production graph writes. | backend/src/services/weatherService.js | MY COMPONENT |
| backend/tests/itinerary.service.test.js | Focused Node regression scenarios for the named boundary. | node:test scenarios; see test names | Fixtures/mocks → assertions; no real training or production graph writes. | backend/src/services/itinerary.service.js; backend/src/controllers/itinerary.controller.js | SHARED INTEGRATION |
| backend/tests/liteapi-hotel-pricing.test.js | Focused Node regression scenarios for the named boundary. | node:test scenarios; see test names | Fixtures/mocks → assertions; no real training or production graph writes. | backend/src/services/liteApiHotelPricing.service.js | TEAMMATE DEPENDENCY |
| frontend/tests/itineraryRegeneration.test.cjs | Frontend helper/API regression scenarios; browser verification is separate. | node:test scenarios; Babel module harness | Synthetic responses/state → assertions. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/tests/itineraryVehicle.test.cjs | Frontend helper/API regression scenarios; browser verification is separate. | node:test scenarios; Babel module harness | Synthetic responses/state → assertions. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/tests/roadEvidence.test.cjs | Frontend helper/API regression scenarios; browser verification is separate. | node:test scenarios; Babel module harness | Synthetic responses/state → assertions. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/tests/safetyOutput.test.cjs | Frontend helper/API regression scenarios; browser verification is separate. | node:test scenarios; Babel module harness | Synthetic responses/state → assertions. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/tests/sessionNavigation.test.cjs | Frontend helper/API regression scenarios; browser verification is separate. | node:test scenarios; Babel module harness | Synthetic responses/state → assertions. | See execution flow / dataset section | SHARED INTEGRATION |
| backend/src/ai_service/tests/test_model.py | Shared itinerary/road-planning regression tests; not final risk holdout evaluation. | unittest TestCase methods | Planner fixtures → unittest assertions. | See execution flow / dataset section | TEAMMATE DEPENDENCY |
| backend/src/ai_service/tests/test_road_routing.py | Shared itinerary/road-planning regression tests; not final risk holdout evaluation. | unittest TestCase methods | Planner fixtures → unittest assertions. | See execution flow / dataset section | TEAMMATE DEPENDENCY |
| backend/src/ai_service/tests/test_itinerary_regeneration.py | Shared itinerary/road-planning regression tests; not final risk holdout evaluation. | unittest TestCase methods | Planner fixtures → unittest assertions. | See execution flow / dataset section | TEAMMATE DEPENDENCY |
| backend/src/ai_service/tests/test_route_field_trials.py | Shared itinerary/road-planning regression tests; not final risk holdout evaluation. | unittest TestCase methods | Planner fixtures → unittest assertions. | See execution flow / dataset section | SHARED INTEGRATION |
| backend/src/ai_service/scripts/evaluate_route_field_trials.py | Existing evaluation utility for collected route observations; not proof that field trials occurred. | number, summarize, main | Recorded observations → timing/evidence comparison outputs. | See execution flow / dataset section | SHARED INTEGRATION |
| backend/package.json | Express startup and Node test commands/dependencies. | configuration; not an algorithm | Development/runtime configuration → application tools. | See execution flow / dataset section | SHARED INTEGRATION |
| backend/requirements.txt | Python service dependencies. | configuration; not an algorithm | Development/runtime configuration → application tools. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/package.json | Expo AppEntry entry point, web start/export tooling and dependencies. | configuration; not an algorithm | Development/runtime configuration → application tools. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/app.json | Expo platform configuration. | configuration; not an algorithm | Development/runtime configuration → application tools. | See execution flow / dataset section | SHARED INTEGRATION |
| frontend/eslint.config.js | Existing frontend lint configuration. | configuration; not an algorithm | Development/runtime configuration → application tools. | See execution flow / dataset section | SHARED INTEGRATION |

## Risk datasets, model artifacts and evaluation outputs (not application source)

| Exact path | Role | Ownership |
|---|---|---|
| backend/src/ai-engine/data/Disaster Dataset.csv | Original hazard-history/label input. | MY COMPONENT |
| backend/src/ai-engine/data/Road Dataset.csv | Original road-profile input. | MY COMPONENT |
| backend/src/ai-engine/data/dataset_cleaning_report.csv | Recorded cleaning/missingness counts. | MY COMPONENT |
| backend/src/ai-engine/data/model_comparison_results.csv | Stored classifier comparison and holdout results. | MY COMPONENT |
| backend/src/ai-engine/data/model_stability_splits.csv | Stored split-wise stability evidence. | MY COMPONENT |
| backend/src/ai-engine/data/model_stability_summary.csv | Stored development stability summary. | MY COMPONENT |
| backend/src/ai-engine/data/processed_disasters.csv | Legacy processed hazard input. | MY COMPONENT |
| backend/src/ai-engine/data/processed_roads.csv | Legacy processed road input. | MY COMPONENT |
| backend/src/ai-engine/data/processed_vehicles.csv | Runtime vehicle recommendation/pricing baseline. | MY COMPONENT |
| backend/src/ai-engine/data/risk_training_dataset.csv | Prepared risk training records with availability/matching metadata. | MY COMPONENT |
| backend/src/ai-engine/data/vehicles.csv | Original vehicle specifications/rates. | MY COMPONENT |
| backend/src/ai-engine/scripts/risk_model_v2.joblib | Selected deployed risk pipeline; do not regenerate during a demonstration. | MY COMPONENT |
| backend/src/ai-engine/scripts/safety_model.joblib | Older saved risk model; distinguish from v2. | MY COMPONENT |

## Top 10 viva files

| # / file | Focus / likely examiner question | Simple English | කෙටි සිංහල පැහැදිලි කිරීම |
|---|---|---|---|
| 1. backend/src/services/safetyAnalysis.service.js | analyzeSafetyLeg, recommendVehicle: How do evidence and route alternatives affect selection? | Combines route, road, graph and model evidence, then filters suitable vehicles. | මාර්ගය, පාරේ ලක්ෂණ, පැරණි අවදානම් හා model ප්‍රතිඵල එකතු කර සුදුසු වාහනය තෝරයි. |
| 2. backend/src/controllers/itinerarySafety.controller.js | recommendItinerarySafety: What if a leg has no evidence? | Evaluates each leg, includes the return and withholds a complete quote when data is missing. | ගමනේ එක් කොටසක දත්ත අඩු නම් සම්පූර්ණ ගමනට නිශ්චිත මිලක් දෙන්නේ නැහැ. ආපසු ගමනත් ගණනය කරයි. |
| 3. backend/src/ai-engine/scripts/predict_safety.py | prepare_input, predict_risk: What does confidence mean? | Loads the saved model and predicts a risk class; probability is not overall accuracy. | සුරැකි model එකෙන් Low, Medium හෝ High ලබා දෙයි. එක් prediction එකක confidence එක model accuracy එක නොවේ. |
| 4. backend/src/ai-engine/scripts/train_models_v2.py | create_final_holdout, train_and_compare: How was overfitting controlled? | Separates grouped development and holdout evaluation, compares classifiers and saves the final pipeline. | සංවර්ධන දත්ත හා අවසාන පරීක්ෂණ දත්ත වෙන් කර models සසඳයි. වෙන් කිරීමේ සීමාවන් පැහැදිලි කළ යුතුයි. |
| 5. backend/src/ai-engine/scripts/build_dataset.py | build_dataset, create_route_profile: How are missing road profiles handled? | Joins hazard rows to road profiles and records missingness rather than inventing observations. | අවදානම් දත්ත පාරේ දත්ත සමඟ සම්බන්ධ කරයි. නොමැති දත්ත සැබෑ අගයන් ලෙස නොපෙන්වයි. |
| 6. backend/src/ai-engine/knowledge-graph/graphManager.js | getRouteRisks, getMLRiskContext: What does Neo4j add? | Retrieves matching historical records and explanation context separately from model inference. | Neo4j මඟින් ගැළපෙන පැරණි අවදානම් වාර්තා ලබා ගනී. ඒවා model prediction එකෙන් වෙනස් සාක්ෂියකි. |
| 7. backend/src/services/routeService.js | getRouteAlternatives, mapOsrmRoutes: Are routes and distances real? | Geocodes the request and normalizes provider routes, coordinates, distance and duration. | සේවා සපයන්නාගෙන් මාර්ගය, දුර හා කාලය ලබාගෙන නිවැරදි ආකෘතියට හරවයි. |
| 8. frontend/services/itineraryVehicle.js | buildItineraryVehiclePayload, buildItinerarySafetySummary: How is partial coverage shown? | Preserves ordered stops/return setting and distinguishes route success from risk evidence coverage. | නැවතුම් පිළිවෙළ හා ආපසු ගමන රැකගනී. මාර්ගය ලැබීම හා අවදානම් සාක්ෂි තිබීම වෙන වෙනම පෙන්වයි. |
| 9. frontend/src/screens/ResultScreen.js | ResultScreen: How do users see missing evidence and vehicle cost? | Renders the returned risk, limitations, historical evidence and vehicle options without fabricating missing values. | API එකෙන් ලැබෙන අවදානම, සීමාවන් හා වාහන මිල පෙන්වයි. නොමැති දත්ත නිර්මාණය නොකරයි. |
| 10. frontend/App.js | MainFlow, checkSession, handleSubmit: How is the platform integrated and refresh protected? | Validates the server session before restoring the current page and connects the shared screens. | පළමුව server session එක පරීක්ෂා කර පසුව තිබූ පිටුව නැවත විවෘත කරයි. කණ්ඩායමේ screens සම්බන්ධ කරයි. |

## Authentication / refresh operational boundaries

- New traveller accounts require registration; earlier local-only profiles were not server accounts. Registration does not verify email ownership and no password-reset service is implemented.
- Browser sessions use HttpOnly, SameSite=Strict cookies and Secure cookies in production. Configure AUTH_ALLOWED_ORIGINS explicitly in production; frontend/API must be deployed same-site over HTTPS for this cookie policy. No auth tokens are stored in browser storage.
- Native opaque tokens are memory-only and server-revocable. Persistent native sign-in after app termination requires platform secure storage and device verification; it is not claimed here.
- Existing legacy signed administrator bearer tokens retain their original expiry behavior for compatibility. New web/native sign-ins use revocable opaque sessions. Existing admin accounts are not replaced.
- New admin initialization requires explicit ADMIN_EMAIL and a password of at least 12 characters; empty configuration creates no default account. Use ADMIN_EMAIL= ADMIN_PASSWORD= npm start when seeding is unwanted.
- Per-process login throttling is bounded; horizontally scaled deployment needs shared ingress rate limiting.
- Protected dynamic links restore their payload from the same browser tab/account snapshot. A fresh tab without those trip details displays an explicit missing-data state; no saved-itinerary read endpoint is invented.
- Route-risk/group APIs retain their existing access contracts; this task does not retrofit user ownership onto old itinerary records or claim tenant isolation for public research endpoints.

## Full path checklist

- `backend/src/services/safetyAnalysis.service.js`
- `backend/src/controllers/itinerarySafety.controller.js`
- `backend/src/routes/itinerarySafety.routes.js`
- `backend/src/routes/safetyRoutes.js`
- `backend/src/services/routeService.js`
- `backend/src/services/llmLocationResolver.js`
- `backend/src/services/weatherService.js`
- `backend/src/services/vehiclePricing.service.js`
- `backend/src/models/VehiclePricing.js`
- `backend/src/config/neo4j.js`
- `backend/src/config/neo4j.config.js`
- `backend/src/ai-engine/knowledge-graph/graphManager.js`
- `backend/src/scripts/importToNeo4j.js`
- `backend/src/ai-engine/scripts/predict_safety.py`
- `backend/src/ai-engine/scripts/build_dataset.py`
- `backend/src/ai-engine/scripts/train_models_v2.py`
- `backend/src/ai-engine/scripts/compare_model_stability.py`
- `backend/src/ai-engine/scripts/preprocess.py`
- `backend/src/ai-engine/scripts/train_model.py`
- `backend/src/app.js`
- `backend/src/controllers/itinerary.controller.js`
- `backend/src/routes/itinerary.routes.js`
- `backend/src/services/itinerary.service.js`
- `backend/src/models/Itinerary.js`
- `backend/src/models/Traveller.js`
- `backend/src/models/AuthSession.js`
- `backend/src/models/Admin.js`
- `backend/src/routes/auth.routes.js`
- `backend/src/services/session.service.js`
- `backend/src/services/adminAuth.service.js`
- `backend/src/routes/admin.routes.js`
- `frontend/App.js`
- `frontend/services/sessionNavigation.js`
- `frontend/src/api/authApi.js`
- `frontend/src/api/adminApi.js`
- `frontend/src/api/apiBase.js`
- `frontend/src/api/safetyApi.js`
- `frontend/src/api/locationApi.js`
- `frontend/src/screens/TripInputScreen.js`
- `frontend/src/screens/ResultScreen.js`
- `frontend/src/screens/SafetyMapScreen.js`
- `frontend/src/screens/TripReviewScreen.js`
- `frontend/src/screens/LocationPickerScreen.js`
- `frontend/src/screens/AdminPricingScreen.js`
- `frontend/src/screens/WelcomeScreen.js`
- `frontend/src/screens/AuthScreen.js`
- `frontend/src/screens/DashboardScreen.js`
- `frontend/src/screens/ModuleScreen.js`
- `frontend/src/components/VehicleCard.js`
- `frontend/src/components/RiskCard.js`
- `frontend/src/components/SafetyRouteMap.js`
- `frontend/src/components/SafetyRouteMap.web.js`
- `frontend/src/components/LocationPickerMap.js`
- `frontend/src/components/LocationPickerMap.web.js`
- `frontend/src/components/MobileBackButton.js`
- `frontend/src/utils/safetyOutput.js`
- `frontend/src/styles/colors.js`
- `frontend/services/itineraryVehicle.js`
- `frontend/screens/ItineraryVehicleScreen.js`
- `frontend/screens/HomeScreen.js`
- `frontend/screens/ResultScreen.js`
- `frontend/screens/MapScreen.js`
- `frontend/services/api.js`
- `frontend/services/itineraryValidation.js`
- `frontend/services/itineraryRegeneration.js`
- `frontend/services/roadEvidence.js`
- `frontend/components/RoadEvidencePanel.js`
- `frontend/components/ResultMap.js`
- `frontend/components/ResultMap.web.js`
- `frontend/components/MapPicker.js`
- `frontend/components/MapPicker.web.js`
- `backend/src/ai_service/app.py`
- `backend/src/ai_service/model.py`
- `backend/src/ai_service/road_routing.py`
- `backend/src/ai_service/relevance_features.py`
- `backend/src/controllers/hotelData.controller.js`
- `backend/src/routes/hotelData.routes.js`
- `backend/src/services/package.service.js`
- `backend/src/services/schema.service.js`
- `backend/src/services/hotelGraph.service.js`
- `backend/src/services/activityGraph.service.js`
- `backend/src/services/liteApiHotelPricing.service.js`
- `frontend/src/screens/HotelHomeScreen.js`
- `frontend/src/screens/HotelResultsScreen.js`
- `frontend/screens/LandmarkScannerScreen.jsx`
- `frontend/screens/LandmarkChatScreen.jsx`
- `frontend/src/screens/LandmarkExplorerScreen.js`
- `frontend/src/api/landmarkApi.js`
- `frontend/services/landmarkService.js`
- `backend/src/services/llm/extractor.service.js`
- `backend/src/services/llm/itineraryGenerator.service.js`
- `backend/src/services/llm/ollama.service.js`
- `backend/src/services/llm/promptTemplates.js`
- `backend/src/services/llm/validator.service.js`
- `backend/src/services/csv.service.js`
- `backend/tests/auth.session.test.js`
- `backend/tests/safety.validation.test.js`
- `backend/tests/itinerary-safety.integration.test.js`
- `backend/tests/route-location-similarity.test.js`
- `backend/tests/weather.service.test.js`
- `backend/tests/itinerary.service.test.js`
- `backend/tests/liteapi-hotel-pricing.test.js`
- `frontend/tests/itineraryRegeneration.test.cjs`
- `frontend/tests/itineraryVehicle.test.cjs`
- `frontend/tests/roadEvidence.test.cjs`
- `frontend/tests/safetyOutput.test.cjs`
- `frontend/tests/sessionNavigation.test.cjs`
- `backend/src/ai_service/tests/test_model.py`
- `backend/src/ai_service/tests/test_road_routing.py`
- `backend/src/ai_service/tests/test_itinerary_regeneration.py`
- `backend/src/ai_service/tests/test_route_field_trials.py`
- `backend/src/ai_service/scripts/evaluate_route_field_trials.py`
- `backend/package.json`
- `backend/requirements.txt`
- `frontend/package.json`
- `frontend/app.json`
- `frontend/eslint.config.js`
- `backend/src/ai-engine/data/Disaster Dataset.csv`
- `backend/src/ai-engine/data/Road Dataset.csv`
- `backend/src/ai-engine/data/dataset_cleaning_report.csv`
- `backend/src/ai-engine/data/model_comparison_results.csv`
- `backend/src/ai-engine/data/model_stability_splits.csv`
- `backend/src/ai-engine/data/model_stability_summary.csv`
- `backend/src/ai-engine/data/processed_disasters.csv`
- `backend/src/ai-engine/data/processed_roads.csv`
- `backend/src/ai-engine/data/processed_vehicles.csv`
- `backend/src/ai-engine/data/risk_training_dataset.csv`
- `backend/src/ai-engine/data/vehicles.csv`
- `backend/src/ai-engine/scripts/risk_model_v2.joblib`
- `backend/src/ai-engine/scripts/safety_model.joblib`
