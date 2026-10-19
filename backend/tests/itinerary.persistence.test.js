import test from "node:test";
import assert from "node:assert/strict";

import {
  deleteOwnedItinerary,
  listOwnedItineraries,
  persistGeneratedItinerarySafely,
} from "../src/services/itineraryPersistence.service.js";
import {
  createUserToken,
  verifyUserToken,
} from "../src/services/userAuth.service.js";

const createFakeModel = ({ readyState = 1, failSave = false } = {}) => {
  class FakeItinerary {
    static db = { readyState };
    static records = [];
    static nextId = 1;

    constructor(values) {
      Object.assign(this, values);
      this._id = `trip-${FakeItinerary.nextId++}`;
      this.createdAt = new Date("2026-08-30T00:00:00.000Z");
    }

    async save() {
      if (failSave) throw new Error("database unavailable");
      FakeItinerary.records.push({ ...this });
    }

    static find(query) {
      const matches = FakeItinerary.records.filter(
        (trip) => trip.ownerUserId === query.ownerUserId
      );
      return {
        sort() {
          return { lean: async () => matches.map((trip) => ({ ...trip })) };
        },
      };
    }

    static async findOneAndDelete(query) {
      const index = FakeItinerary.records.findIndex(
        (trip) => trip._id === query._id && trip.ownerUserId === query.ownerUserId
      );
      if (index < 0) return null;
      return FakeItinerary.records.splice(index, 1)[0];
    }
  }
  return FakeItinerary;
};

const itineraryData = {
  user_preferences: ["Nature"],
  max_time_allocated_mins: 360,
  optimized_route: ["Place A"],
  optimized_stops: [{ place_id: "a", name: "Place A" }],
  starting_location: { lat: 7.29, lon: 80.63 },
};

test("signed user tokens preserve owner identity and reject tampering", () => {
  const token = createUserToken({ _id: "507f1f77bcf86cd799439011" });
  assert.equal(verifyUserToken(token).sub, "507f1f77bcf86cd799439011");
  const [payload, signature] = token.split(".");
  const tampered = `${payload}.${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
  assert.throws(() => verifyUserToken(tampered));
});

test("generated itineraries are saved with the authenticated owner", async () => {
  const model = createFakeModel();
  const result = await persistGeneratedItinerarySafely({
    ownerUserId: "user-a",
    itineraryData,
    model,
  });
  assert.equal(result.saved, true);
  assert.equal(model.records.length, 1);
  assert.equal(model.records[0].ownerUserId, "user-a");
  assert.strictEqual(model.records[0].itineraryData, itineraryData);
});

test("saved itinerary reads are owner-scoped", async () => {
  const model = createFakeModel();
  model.records.push(
    { _id: "trip-a", ownerUserId: "user-a", itineraryData: { name: "A" } },
    { _id: "trip-b", ownerUserId: "user-b", itineraryData: { name: "B" } },
  );
  const userA = await listOwnedItineraries("user-a", model);
  const userB = await listOwnedItineraries("user-b", model);
  assert.deepEqual(userA.map((trip) => trip._id), ["trip-a"]);
  assert.deepEqual(userB.map((trip) => trip._id), ["trip-b"]);
});

test("delete requires both itinerary ID and matching owner", async () => {
  const model = createFakeModel();
  model.records.push({ _id: "trip-a", ownerUserId: "user-a", itineraryData });
  assert.equal(await deleteOwnedItinerary("user-b", "trip-a", model), null);
  assert.equal(model.records.length, 1);
  assert.equal((await deleteOwnedItinerary("user-a", "trip-a", model))._id, "trip-a");
  assert.equal(model.records.length, 0);
});

test("database unavailability and write failure never reject itinerary generation", async () => {
  const unavailable = createFakeModel({ readyState: 0 });
  const skipped = await persistGeneratedItinerarySafely({
    ownerUserId: "user-a",
    itineraryData,
    model: unavailable,
  });
  assert.deepEqual(skipped, {
    status: "skipped",
    saved: false,
    reason: "database_unavailable",
  });

  const failing = createFakeModel({ failSave: true });
  const failed = await persistGeneratedItinerarySafely({
    ownerUserId: "user-a",
    itineraryData,
    model: failing,
  });
  assert.deepEqual(failed, {
    status: "failed",
    saved: false,
    reason: "database_write_failed",
  });
});

test("unauthenticated generation is returned without persistence", async () => {
  const model = createFakeModel();
  const result = await persistGeneratedItinerarySafely({ itineraryData, model });
  assert.deepEqual(result, {
    status: "skipped",
    saved: false,
    reason: "authentication_required",
  });
  assert.equal(model.records.length, 0);
});
