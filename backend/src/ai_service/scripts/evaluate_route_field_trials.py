#!/usr/bin/env python3
"""Summarize exported field evidence; never treat model tests as real observations."""
import argparse
import hashlib
import json
import math
from pathlib import Path


def number(value, label, optional=False):
    if value is None and optional:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError(f"{label} must be a finite non-negative number")
    return value


def summarize(packets):
    model_errors, paired_model, google_errors = [], [], []
    complete_trips = on_time = observed_trips = legs_total = 0
    seen = set()
    for packet in packets:
        if packet.get("schema_version") != 1 or not isinstance(packet.get("legs"), list):
            raise ValueError("Expected an evidence export with schema_version 1 and legs")
        # Same departure + start + stops is one trial; avoid counting repeated exports twice.
        trial_key = json.dumps([packet.get("planning_options", {}).get("departure_time"),
                                packet.get("plan", {}).get("starting_location"),
                                [s.get("place_id") for s in packet.get("plan", {}).get("stops", [])]], sort_keys=True)
        digest = hashlib.sha256(trial_key.encode()).hexdigest()
        if digest in seen:
            raise ValueError("Duplicate trip exports: keep one final observation file per planned trip")
        seen.add(digest)
        trip_has_observations = False
        for leg in packet["legs"]:
            legs_total += 1
            predicted = number(leg.get("predicted_minutes"), "predicted_minutes")
            actual = number(leg.get("actual_minutes"), "actual_minutes", optional=True)
            google = number(leg.get("google_minutes"), "google_minutes", optional=True)
            if (actual is not None or google is not None) and not str(leg.get("evidence_notes", "")).strip():
                raise ValueError("Recorded measurements need evidence notes")
            if actual is not None:
                trip_has_observations = True
                model_errors.append(abs(predicted - actual))
                if google is not None:
                    paired_model.append(abs(predicted - actual))
                    google_errors.append(abs(google - actual))
        actual_total = number(packet.get("trip", {}).get("actual_total_minutes"), "actual_total_minutes", optional=True)
        completed = packet.get("trip", {}).get("all_stops_completed")
        if completed is not None and not isinstance(completed, bool):
            raise ValueError("all_stops_completed must be true, false or null")
        if actual_total is not None and isinstance(completed, bool):
            budget = number(packet["plan"]["budget_minutes"], "budget_minutes")
            complete_trips += 1
            on_time += int(completed and actual_total <= budget)
        observed_trips += int(trip_has_observations)
    mean = lambda values: round(sum(values) / len(values), 3) if values else None
    return {"status": "user_recorded_field_evidence" if observed_trips else "no_field_observations",
            "trial_exports": len(seen), "trips_with_driving_observations": observed_trips,
            "planned_legs": legs_total, "observed_legs": len(model_errors),
            "model_mae_minutes": mean(model_errors), "paired_legs": len(google_errors),
            "paired_model_mae_minutes": mean(paired_model), "paired_google_mae_minutes": mean(google_errors),
            "trips_with_completion_evidence": complete_trips,
            "on_time_completed_trips": on_time,
            "on_time_completion_rate": on_time / complete_trips if complete_trips else None,
            "limitations": "Self-recorded observations; no independent verification. Google comparison uses matched observed legs only. Small pilots do not establish general accuracy. Traffic, weather and source quality require manual review of evidence notes."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--output", type=Path, help="Optional JSON report file")
    args = parser.parse_args()
    try:
        report = summarize([json.loads(path.read_text()) for path in args.files])
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.error(str(error))
    rendered = json.dumps(report, indent=2, allow_nan=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n")
    print(rendered)


if __name__ == "__main__":
    main()
