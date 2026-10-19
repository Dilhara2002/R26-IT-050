// Pure helpers: no paid APIs, scraping, or fabricated observations.
export function buildRoadOptions({ date, time, breaks, returnToStart, buffer }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("Enter the trip date as YYYY-MM-DD and start time as HH:MM (24-hour Sri Lanka time).");
  }
  const parsed = new Date(`${date}T${time}:00+05:30`);
  const check = new Date(parsed.getTime() + 330 * 60000).toISOString().slice(0, 10);
  if (check !== date) throw new Error("Enter a valid calendar date.");
  const breakMinutes = Number(breaks);
  const bufferPercent = Number(buffer);
  if (String(breaks).trim() === "" || !Number.isFinite(breakMinutes) || breakMinutes < 0 || breakMinutes > 180) {
    throw new Error("Break time must be from 0 to 180 minutes.");
  }
  if (String(buffer).trim() === "" || !Number.isFinite(bufferPercent) || bufferPercent < 0 || bufferPercent > 100) {
    throw new Error("Travel buffer must be from 0 to 100 percent.");
  }
  return { routing_mode: "road", departure_time: `${date}T${time}:00+05:30`,
    return_to_start: returnToStart, break_minutes: breakMinutes, travel_buffer_percent: bufferPercent };
}

export function roadLegs(data) {
  const start = { latitude: data.starting_location.lat, longitude: data.starting_location.lon, name: "Start" };
  const points = [start, ...data.optimized_stops];
  const legs = data.optimized_stops.map((stop, index) => ({
    sequence: index + 1, from: points[index], to: stop,
    predicted: stop.estimated_leg_travel_minutes,
    departure: index ? points[index].departure_time : data.planning_options?.departure_time,
  }));
  if (data.planning_options?.return_to_start && data.optimized_stops.length) {
    legs.push({ sequence: legs.length + 1, from: points[points.length - 1], to: start,
      predicted: data.return_travel_minutes, departure: points[points.length - 1].departure_time });
  }
  return legs;
}

export function googleLegLink(leg) {
  const pair = (point) => `${point.latitude},${point.longitude}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(pair(leg.from))}&destination=${encodeURIComponent(pair(leg.to))}&travelmode=driving`;
}

function optionalMinutes(value, label) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10080) throw new Error(`${label} must be a non-negative duration in minutes.`);
  return parsed;
}

export function buildEvidence(data, observations, trip = {}) {
  const legs = roadLegs(data).map((leg, index) => {
    const input = observations[index] || {};
    const google = optionalMinutes(input.google, `Leg ${index + 1} Google estimate`);
    const actual = optionalMinutes(input.actual, `Leg ${index + 1} actual time`);
    if ((google !== null || actual !== null) && !String(input.note || "").trim()) {
      throw new Error(`Leg ${index + 1}: record departure date/time, comparison conditions and evidence reference in the notes.`);
    }
    return { sequence: leg.sequence, from: leg.from.name, to: leg.to.name,
      from_coordinates: [leg.from.latitude, leg.from.longitude], to_coordinates: [leg.to.latitude, leg.to.longitude],
      planned_departure: leg.departure, predicted_minutes: leg.predicted,
      google_minutes: google, actual_minutes: actual,
      absolute_error_minutes: actual === null ? null : Math.abs(leg.predicted - actual),
      google_absolute_error_minutes: actual === null || google === null ? null : Math.abs(google - actual),
      evidence_notes: String(input.note || "").trim() };
  });
  const actualTotal = optionalMinutes(trip.actualTotal, "Actual full-trip duration");
  const measured = legs.filter((leg) => leg.actual_minutes !== null);
  const paired = measured.filter((leg) => leg.google_minutes !== null);
  const mean = (rows, key) => rows.length ? rows.reduce((sum, row) => sum + row[key], 0) / rows.length : null;
  return {
    schema_version: 1, recorded_at: new Date().toISOString(),
    status: measured.length ? "user_recorded_observations_not_independently_verified" : "template_no_field_observations",
    planning_options: data.planning_options, travel_estimation: data.travel_estimation,
    plan: { starting_location: data.starting_location, stops: data.optimized_stops,
      budget_minutes: data.max_time_allocated_mins, predicted_total_minutes: data.planned_time_minutes,
      finish_time: data.scheduled_finish_time },
    legs,
    metrics: { observed_leg_count: measured.length, total_leg_count: legs.length,
      model_mae_minutes: mean(measured, "absolute_error_minutes"),
      paired_leg_count: paired.length, paired_model_mae_minutes: mean(paired, "absolute_error_minutes"),
      paired_google_mae_minutes: mean(paired, "google_absolute_error_minutes") },
    trip: { actual_total_minutes: actualTotal, all_stops_completed: trip.completed === true ? true : trip.completed === false ? false : null,
      on_time_completion: actualTotal === null || typeof trip.completed !== "boolean" ? null : trip.completed && actualTotal <= data.max_time_allocated_mins,
      notes: String(trip.notes || "").trim() },
  };
}

export function evidenceCsv(packet) {
  // Neutralize spreadsheet formula prefixes in user-entered text.
  const cell = (value) => {
    if (value == null) return '""';
    const text = String(value);
    return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
  };
  const keys = ["sequence", "from", "to", "planned_departure", "predicted_minutes", "google_minutes", "actual_minutes", "absolute_error_minutes", "google_absolute_error_minutes", "evidence_notes"];
  return [keys, ...packet.legs.map((leg) => keys.map((key) => leg[key]))].map((row) => row.map(cell).join(",")).join("\r\n");
}
