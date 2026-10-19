# IT22555458 — free road routing and panel validation

## What is implemented

The itinerary screen requests `routing_mode: road`. No Google API key, billing account or paid routing subscription is used. OSRM calculates static driving durations and distances over OpenStreetMap roads. The existing relevance model and initial genetic algorithm remain in place; road durations now govern fitness and time feasibility. The bounded candidate catalogue remains 40 Central Province POIs, with at most 15 candidates and 8 selected stops per plan.

The planner includes a dated Sri Lanka departure time, visits, one break after reaching the first stop and before its visit, an adjustable travel buffer, optional return to start, and waiting for supplied opening windows. Final ordering uses a directed travel-time subset search. Initial selection is still a heuristic, not a global optimum. Full regeneration searches unseen fixed-size subsets; replacement preserves accepted places. Rechecking opening hours preserves all selected places.

A venue with no supplied opening hours is explicitly **unknown**, not assumed verified open. Users can supply one date-specific window and source URL per selected place and recheck the schedule. These entries are user supplied; the software does not verify the source. Visits must finish before closing. Overnight/multiple daily windows are not supported.

No live traffic, future road conditions, weather, closures, parking, walking, accessibility, monetary budget or safety guarantees are claimed. Driving time is estimated to a snapped road point; final access to the venue still needs checking. The default 25% buffer and catalogue visit durations are assumptions, not calibrated accuracy or confidence intervals.

## Run locally

Use the existing backend and frontend startup commands. The Python itinerary service needs no new package: `requests` is already imported by the existing model (now also declared in requirements).

```sh
cd backend
npm run ai-service
# In a second terminal in backend:
npm start
# In a third terminal in frontend:
npm run web
```

The optional Gemini guide remains optional. Without its key, road planning and deterministic explanations still work. Existing users of the API who omit `routing_mode` keep the original calculation for compatibility. The updated planner UI always requests road mode; failed routing does not silently fall back to Haversine.

Default routing server: `https://routing.openstreetmap.de/routed-car`. For an already running local OSRM car server, set `ITINERARY_OSRM_URL=http://127.0.0.1:5000` in the backend environment. Never accept a service URL from client input. Self-hosting requires separate map preparation and computing resources; it is not installed automatically.

Public demo use is best effort, not unlimited hosting: one request/second per Python process, a one-hour in-memory cache with 32 entries, bounded timeouts and no retries. Run one Python worker for the research demo; multiple independent workers need a shared rate limiter or a self-hosted server. The matrix and final route geometry require at most two calls per new plan. Coordinates go to the routing operator; no account credentials are sent. OSRM/FOSSGIS and OpenStreetMap attribution links appear in the result screen. Network failures give a controlled 503; unavailable geometry leaves markers only, while valid matrix-based estimates remain visible.

Sources: [OSRM API](https://project-osrm.org/docs/v5.24.0/api/), [operator usage policy](https://routing.openstreetmap.de/about.html), [OpenStreetMap licence](https://www.openstreetmap.org/copyright).

## Panel evidence workflow (සිංහල)

1. App එකේ start location, interests, time budget, date සහ departure time දාලා plan එක හදන්න. Return trip අවශ්‍ය නම් switch එක on තබන්න.
2. Result එකේ **Check opening hours / record trip evidence** විවෘත කරන්න. Official source එකෙන් දන්නා opening/closing times සහ source URL ඇතුළත් කරලා **Recheck this plan with supplied hours** ඔබන්න. නොදන්නා දත්ත හිස්ව තබන්න; ඒවා තහවුරු කළා කියලා කියන්න එපා.
3. එක් එක් leg එකේ **Compare this leg in Google Maps** ඔබන්න. Google Maps වල එකම departure date/time, driving mode සහ endpoints තෝරන්න. Link එක departure time එක ස්වයංක්‍රීයව සකස් නොකරයි. Estimate එක සහ ගත් වේලාව screenshot එකක් සමඟ සටහන් කරන්න. Google API මිලදී ගැනීමක් අවශ්‍ය නැහැ.
4. ගමනේදී සෑම leg එකකටම ඇත්ත departure/arrival times සහ driving minutes ලියාගන්න. Sightseeing, waiting සහ breaks driving time එකට දාන්න එපා. Actual visit durations, weather, traffic, missed places සහ closures notes වල දාන්න.
5. Result form එකට actual සහ Google minutes දාන්න. එක් එක් measurement එකට departure/conditions/evidence reference notes අවශ්‍යයි. මුළු trip duration එක සහ සියලු ස්ථාන නැරඹුවාද කියන එකත් සටහන් කරන්න.
6. **Export full evidence JSON** මඟින් සම්පූර්ණ සාක්ෂි save කරන්න. **Export leg CSV** එක leg comparison table එක පමණයි. Web එකේ download වෙනවා; mobile එකේ share/save text ලෙස ලබාගන්න පුළුවන්. Form observations database එකට auto-save නොවන නිසා regenerate/recheck/leave කිරීමට පෙර export කරන්න.
7. මුලින් වෙනස් day trips 3–5ක pilot එකක් කරන්න. මෙය සාමාන්‍ය accuracy එක තහවුරු කිරීමට ප්‍රමාණවත් sample එකක් කියලා claim කරන්න එපා. Repeat routes/time periods සහ larger trials පසුව එකතු කරන්න.

Export files can be combined without trusting precomputed metrics:

```sh
backend/.venv311/bin/python backend/src/ai_service/scripts/evaluate_route_field_trials.py \
  /path/to/trip-1.json /path/to/trip-2.json --output /tmp/route-field-report.json
```

One final export per trip only. Duplicate planned date/start/stop sequences are rejected. Missing observations remain missing, never zero error. Model MAE is mean `abs(predicted driving minutes - actual driving minutes)` over observed legs. Paired model/Google MAE uses only legs with both Google and actual observations. On-time completion requires all stops visited and actual **whole-trip** duration within the requested budget. Report sample counts and review notes/screenshots alongside the numbers; entered observations are not independently verified.

## What the panel can be told now

> The implementation now uses road-network driving estimates with explicit buffers and day scheduling constraints. It supports matched Google Maps comparisons and recorded field-trip evaluation. Real-trip accuracy remains unmeasured until the field trials are completed. Future travel conditions are estimates, not guarantees.

After actual trials, replace this statement with measured results and sample counts. Automated unit tests, live API smoke checks, source-traced POIs and Google estimates are **not** independent real-trip ground truth. No measured field accuracy is supplied or fabricated by this change.

## API example

```json
{
  "preferences": ["Nature", "Culture"],
  "current_lat": 7.2906,
  "current_lon": 80.6337,
  "max_time_minutes": 480,
  "radius_km": 15,
  "routing_mode": "road",
  "departure_time": "2026-10-01T08:00:00+05:30",
  "return_to_start": true,
  "break_minutes": 30,
  "travel_buffer_percent": 25,
  "visit_windows": {}
}
```

A supplied `visit_windows` entry is keyed by a verified `place_id` and contains `opens_at`, `closes_at` (same trip date, ISO +05:30) and `source_url`. For `generation_mode: reschedule`, send all accepted place IDs as `locked_place_ids`, with no exclusions/history. Infeasible or closed windows produce 409 and the frontend retains the previous plan.
