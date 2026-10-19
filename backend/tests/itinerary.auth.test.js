import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import axios from 'axios';
import AuthSession from '../src/models/AuthSession.js';
import Traveller from '../src/models/Traveller.js';
import itineraryRoutes from '../src/routes/itinerary.routes.js';

test('itinerary routes use traveller sessions and isolate unavailable saved storage', async t => {
  const token = 'a'.repeat(64);
  const owner = '507f1f77bcf86cd799439011';
  t.mock.method(AuthSession, 'findOne', async query => {
    assert.ok(query.expiresAt.$gt instanceof Date);
    return { userId: owner, role: 'traveller' };
  });
  t.mock.method(Traveller, 'findById', id => {
    assert.equal(id, owner);
    return { select: async () => ({ _id: owner, name: 'Test' }) };
  });
  t.mock.method(axios, 'post', async (_url, payload) => {
    assert.deepEqual(payload.preferences, ['Nature']);
    return { data: { status: 'success', data: { optimized_route: [] } } };
  });
  const app = express();
  app.use(express.json());
  app.use('/api/itinerary', itineraryRoutes);
  const payload = { preferences: ['Nature'] };
  for (const path of ['/api/itinerary', '/api/itinerary/optimize']) {
    const r = path.endsWith('optimize') ? await request(app).post(path).send(payload) : await request(app).get(path);
    assert.equal(r.status, 401);
    assert.match(r.body.message, /sign in/i);
  }
  for (const headers of [{ Cookie: `ceylongo_session=${token}` }, { Authorization: `Bearer ${token}` }]) {
    const saved = await request(app).get('/api/itinerary').set(headers);
    assert.equal(saved.status, 503); // No database connected; generation must still succeed.
    const generated = await request(app).post('/api/itinerary/optimize').set(headers).send(payload);
    assert.equal(generated.status, 200);
    assert.equal(generated.body.status, 'success');
    assert.equal((await request(app).post('/api/itinerary/optimize').set(headers).send({})).status, 400);
  }
  assert.equal((await request(app).post('/api/itinerary/optimize').set('Origin', 'https://evil.invalid').send(payload)).status, 403);
  AuthSession.findOne.mock.mockImplementation(async () => null);
  assert.equal((await request(app).get('/api/itinerary').set('Authorization', `Bearer ${token}`)).status, 401);
  AuthSession.findOne.mock.mockImplementation(async () => { throw new Error('private database detail'); });
  const unavailable = await request(app).get('/api/itinerary').set('Authorization', `Bearer ${token}`);
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(unavailable.body.message, /private/);
});
