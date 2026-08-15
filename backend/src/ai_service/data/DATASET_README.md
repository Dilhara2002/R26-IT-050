# POI Dataset Workspace

This directory separates the application's current prototype data from future research-grade data. The current Flask application continues to load `places.csv`; no runtime path or application code changes are required by this workspace.

## Current runtime dataset

`places.csv` is the current 1,000-record, AI-assisted synthetic/prototype POI dataset used for application, routing, and integration testing. It must not be used as evidence for final model-performance claims or as an independently verified catalogue of Sri Lankan tourism POIs.

Recorded identity of the current version:

- Data rows: 1,000
- Columns: 8
- Size: 72,185 bytes
- SHA-256: `7388e5315c830944b4ffa7314c9e8400c8dda7d0a62f64c86616d48e10825d6b`
- Git blob: `159862a96b10cdc932151b9e922354d92620adc0`
- Columns: `Place_ID`, `Name`, `Latitude`, `Longitude`, `District`, `Tags`, `Duration_Minutes`, `Rating`

The immutable archive of this version is `raw/places_synthetic_prototype_v1.csv`. It must remain a byte-for-byte copy and must never be cleaned, normalized, reordered, or silently corrected.

## Known prototype limitations

The completed forensic audit identified these limitations:

- No record-level source, licence, collection date, or verification evidence.
- AI-assisted batch construction and district blocks that do not form a national sampling frame.
- Exact and probable entity duplicates, including aliases and possible parent/sub-POI records.
- Multiple distinct names sharing identical coordinates.
- Repeated, rounded, and grid-like coordinate patterns requiring source verification.
- Ratings without a platform, observation date, scale provenance, or review count.
- Highly discretized duration estimates without an observed or documented basis.
- Templated names and tag-order inconsistencies.
- Coverage of only eight districts.
- A target currently derived from `Rating >= 3.9`, with 938 of 1,000 records in the majority class.
- A majority-class holdout baseline that exceeds the reported Random Forest accuracy.
- TF-IDF preprocessing fitted before the current train/test split and a non-stratified split.

These findings do not prove that every POI is false. They mean that no record should be treated as research-grade until its relevant fields have traceable evidence.

## Future verified dataset

`verified/places_verified_v1.csv` is the empty schema for the future final research dataset. No record may enter it without traceable evidence. In particular:

- `primary_source_url`, `source_type`, `source_license`, `collected_at`, and `collector` are required provenance fields.
- Coordinates require a traceable `coordinate_source_url` and validation that they represent the intended entity rather than a district centroid, nearby feature, parent site, or guessed point.
- A rating requires `rating_platform`, `rating_observed_at`, `rating_count`, `rating_scale`, and the corresponding source evidence.
- Canonical names, aliases, `entity_type`, `parent_poi_id`, and `duplicate_cluster_id` must distinguish aliases, sub-POIs, trailheads, viewpoints, and genuinely separate entities.
- `raw_record_hash` must preserve lineage to the immutable source record where applicable.
- `label` and `label_definition_version` remain blank until the final target definition and labeling protocol are formally approved.

## Verification statuses

The allowed verification statuses are:

- `unverified`
- `source_matched`
- `coordinate_verified`
- `partially_verified`
- `verified`
- `contradicted`
- `not_found`
- `retired`

`verified/verification_log.csv` records field-level evidence and decisions. No record or field may be silently corrected. Every correction, contradiction, alias decision, coordinate adjustment, or retirement must appear in the verification log with the original value, verified value, status, evidence URL, reviewer, date, and notes.

`verified/source_register.csv` records source ownership, access method, licence, redistribution status, access date, and the fields collected from each source. A web page being publicly accessible does not automatically grant redistribution rights.

## Versioning rules

1. Never edit a released raw archive in place.
2. Identify raw releases with a stable version and preserve their byte-level hash.
3. Make corrections only in a new verified-data version and record them in the verification log.
4. Keep schema changes, label-definition changes, and data changes versioned separately when practical.
5. Record the source snapshot or access date for time-sensitive fields.
6. Preserve canonical IDs across verified versions; do not recycle retired IDs.
7. Record the code commit, environment, split manifest, random seeds, and dataset hash used for every final experiment.
8. Do not replace the runtime `places.csv` until a verified dataset has passed structural, factual, licensing, deduplication, and application-compatibility review.

## Validation

Run the read-only validator from the repository root with bytecode disabled:

```powershell
$env:PYTHONDONTWRITEBYTECODE = "1"
backend\.venv\Scripts\python.exe -B backend\src\ai_service\scripts\validate_dataset.py backend\src\ai_service\data\places.csv
```

The validator reports structural and data-quality findings but never edits or rewrites its input.
