const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');
function load(file) {
  const { code } = babel.transformFileSync(path.resolve(__dirname, '../services', file), { presets: ['babel-preset-expo'], babelrc: false, configFile: false });
  const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require); return m.exports;
}
const { buildRoadOptions, roadLegs, googleLegLink, buildEvidence, evidenceCsv } = load('roadEvidence.js');
const { buildReplacementRequest, buildFullRegenerationRequest } = load('itineraryRegeneration.js');
const options = { routing_mode: 'road', departure_time: '2026-10-01T08:00:00+05:30', return_to_start: true, break_minutes: 30, travel_buffer_percent: 25, visit_windows: {} };
const data = { planning_options: options, starting_location: { lat: 7.29, lon: 80.63 }, user_preferences: ['Nature'], max_time_allocated_mins: 180, planned_time_minutes: 120,
  return_travel_minutes: 25, optimized_stops: [{ place_id: 'a', name: 'A', latitude: 7.3, longitude: 80.64, estimated_leg_travel_minutes: 20, departure_time: '2026-10-01T09:00:00+05:30' }] };
test('day schedule rejects invalid date and coercion', () => {
  const input = { date: '2026-10-01', time: '08:00', breaks: '30', returnToStart: true, buffer: '25' };
  assert.equal(buildRoadOptions(input).routing_mode, 'road');
  for (const change of [{ date: '2026-02-30' }, { time: '25:00' }, { breaks: '' }, { buffer: '-1' }]) assert.throws(() => buildRoadOptions({ ...input, ...change }));
});
test('legs include return and Google link uses exact coordinates', () => {
  const legs = roadLegs(data);
  assert.equal(legs.length, 2); assert.equal(legs[1].predicted, 25);
  assert.match(googleLegLink(legs[0]), /origin=7.29%2C80.63/);
  assert.match(googleLegLink(legs[0]), /travelmode=driving/);
});
test('blank observations are missing, not zero accuracy', () => {
  const packet = buildEvidence(data, {});
  assert.equal(packet.metrics.observed_leg_count, 0);
  assert.equal(packet.metrics.model_mae_minutes, null);
  assert.equal(packet.trip.on_time_completion, null);
  assert.equal(packet.status, 'template_no_field_observations');
});
test('calculates actual error and paired baselines on same subset', () => {
  const packet = buildEvidence(data, { 0: { google: '22', actual: '30', note: '2026-10-01 08:00 LK; dry; screenshot 1' }, 1: { actual: '20', note: '2026-10-01 09:00 LK; dry; log 2' } }, { actualTotal: '170', completed: true });
  assert.equal(packet.metrics.model_mae_minutes, 7.5);
  assert.equal(packet.metrics.paired_model_mae_minutes, 10);
  assert.equal(packet.metrics.paired_google_mae_minutes, 8);
  assert.equal(packet.trip.on_time_completion, true);
});
test('invalid and undocumented measurements rejected', () => {
  assert.throws(() => buildEvidence(data, { 0: { actual: '-2', note: 'test' } }));
  assert.throws(() => buildEvidence(data, { 0: { actual: '20' } }));
  assert.equal(buildEvidence(data, {}, { actualTotal: '190', completed: true }).trip.on_time_completion, false);
});
test('CSV escapes quotes and formula injection', () => {
  const packet = buildEvidence(data, { 0: { note: '=SUM(1,2) "test"' } });
  assert.ok(evidenceCsv(packet).includes('"\'=SUM(1,2) ""test"""'));
});
test('replacement and regeneration preserve road schedule options', () => {
  for (const request of [buildReplacementRequest(data, 'a'), buildFullRegenerationRequest(data)]) {
    assert.equal(request.routing_mode, 'road');
    assert.equal(request.departure_time, options.departure_time);
    assert.equal(request.return_to_start, true);
  }
});
