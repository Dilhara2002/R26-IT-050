const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../services/itineraryValidation.js'), 'utf8');
const helpers = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('authentication and service failures have actionable messages', async () => {
  const { itineraryRequestError } = await helpers;
  assert.equal(itineraryRequestError({ response: { status: 401 } }).title, 'Sign in required');
  assert.equal(itineraryRequestError({ response: { status: 503 } }).kind, 'service_unavailable');
});
test('form validation retains inputs and accepts valid constraints', async () => {
  const { validateItineraryForm } = await helpers;
  const form = { preferences: ['Nature'], hours: '4', minutes: '30', latitude: '7.2906', longitude: '80.6337', radius: '' };
  const before = JSON.stringify(form);
  assert.equal(validateItineraryForm(form).values.totalMinutes, 270);
  assert.equal(validateItineraryForm(form).valid, true);
  assert.equal(validateItineraryForm({ ...form, minutes: '60' }).valid, false);
  assert.equal(JSON.stringify(form), before);
});
