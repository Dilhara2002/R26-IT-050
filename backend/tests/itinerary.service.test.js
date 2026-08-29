import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";

import { generateItineraryFromAI } from "../src/services/itinerary.service.js";
import { buildItineraryPayload } from "../src/controllers/itinerary.controller.js";


test("itinerary service preserves controlled verified-evidence errors", async () => {
  const originalPost = axios.post;
  axios.post = async () => {
    const error = new Error("Request failed with status code 404");
    error.response = {
      status: 404,
      data: {
        status: "error",
        code: "insufficient_verified_evidence",
        error: "No source-traced Kandy locations matched inside the active radius.",
        data_scope: "verified_kandy_v1"
      }
    };
    throw error;
  };

  try {
    await assert.rejects(
      generateItineraryFromAI({ preferences: ["Beach"] }),
      (error) => {
        assert.equal(error.statusCode, 404);
        assert.equal(error.details.code, "insufficient_verified_evidence");
        assert.equal(error.details.data_scope, "verified_kandy_v1");
        return true;
      }
    );
  } finally {
    axios.post = originalPost;
  }
});

test("legacy controller payload remains limited to the original four fields", () => {
  const payload = buildItineraryPayload({
    preferences: ["Nature"],
    max_time_minutes: 360,
    current_lat: 7.2906,
    current_lon: 80.6337
  });
  assert.deepEqual(payload, {
    preferences: ["Nature"],
    max_time_minutes: 360,
    current_lat: 7.2906,
    current_lon: 80.6337
  });
});

test("controller forwards stable-ID regeneration constraints additively", () => {
  const payload = buildItineraryPayload({
    preferences: ["Nature"],
    max_time_minutes: 360,
    current_lat: 7.2906,
    current_lon: 80.6337,
    radius_km: 15,
    generation_mode: "replace_stop",
    excluded_place_ids: ["rejected-id"],
    locked_place_ids: ["accepted-a", "accepted-b"],
    replaced_place_id: "rejected-id",
    target_stop_count: 3
  });
  assert.deepEqual(payload.excluded_place_ids, ["rejected-id"]);
  assert.deepEqual(payload.locked_place_ids, ["accepted-a", "accepted-b"]);
  assert.equal(payload.generation_mode, "replace_stop");
  assert.equal(payload.replaced_place_id, "rejected-id");
  assert.equal(payload.target_stop_count, 3);
  assert.equal(payload.radius_km, 15);
});

test("controller validates and canonicalizes bounded full-regeneration context", () => {
  const payload = buildItineraryPayload({
    preferences: ["Nature", "Adventure"],
    max_time_minutes: 360,
    generation_mode: "full_regeneration",
    excluded_place_ids: ["place-c", "place-a", "place-b"],
    locked_place_ids: [],
    target_stop_count: 3,
    current_plan_signature: ["place-c", "place-a", "place-b"],
    recent_plan_signatures: [
      ["place-c", "place-a", "place-b"],
      ["place-a", "place-d", "place-e"],
    ],
  });
  assert.equal(payload.target_stop_count, 3);
  assert.deepEqual(payload.current_plan_signature, ["place-a", "place-b", "place-c"]);
  assert.deepEqual(payload.recent_plan_signatures, [
    ["place-a", "place-b", "place-c"],
    ["place-a", "place-d", "place-e"],
  ]);
});

test("controller rejects unbounded or malformed regeneration context", () => {
  const invalidCases = [
    { target_stop_count: 0 },
    { target_stop_count: 9 },
    { target_stop_count: 3.5 },
    { current_plan_signature: [] },
    { current_plan_signature: ["same", "same"] },
    { recent_plan_signatures: Array.from({ length: 9 }, (_, index) => [`p-${index}`]) },
    { recent_plan_signatures: [["same"], ["same"]] },
  ];
  for (const additions of invalidCases) {
    assert.throws(() => buildItineraryPayload({ preferences: ["Nature"], ...additions }));
  }
});

test("controller rejects invalid time, coordinates, and radius instead of defaulting", () => {
  const cases = [
    { max_time_minutes: 0 },
    { max_time_minutes: -1 },
    { max_time_minutes: 1441 },
    { max_time_minutes: "120" },
    { current_lat: Number.NaN },
    { current_lon: Number.POSITIVE_INFINITY },
    { radius_km: 0 },
  ];
  for (const additions of cases) {
    assert.throws(
      () => buildItineraryPayload({ preferences: ["Nature"], ...additions }),
      /must be a finite number between/
    );
  }
});

test("itinerary service sends regeneration fields unchanged to Flask", async () => {
  const originalPost = axios.post;
  let receivedPayload;
  axios.post = async (_url, payload) => {
    receivedPayload = payload;
    return { data: { status: "success", data: { route_changed: true } } };
  };
  const requestPayload = {
    preferences: ["Nature"],
    generation_mode: "full_regeneration",
    excluded_place_ids: ["old-a", "old-b"],
    locked_place_ids: []
  };
  try {
    await generateItineraryFromAI(requestPayload);
    assert.deepEqual(receivedPayload, requestPayload);
  } finally {
    axios.post = originalPost;
  }
});

test("itinerary service forwards optional guide explanation unchanged", async () => {
  const originalPost = axios.post;
  const upstream = {
    status: "success",
    data: {
      deterministic_explanation: { summary: "Deterministic evidence." },
      guide_explanation: "Optional friendly paraphrase.",
    },
  };
  axios.post = async () => ({ data: upstream });
  try {
    const result = await generateItineraryFromAI({ preferences: ["Nature"] });
    assert.strictEqual(result, upstream);
    assert.equal(result.data.guide_explanation, "Optional friendly paraphrase.");
  } finally {
    axios.post = originalPost;
  }
});

test("itinerary service treats no-additional-alternative 409 as controlled exhaustion", async () => {
  const originalPost = axios.post;
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  axios.post = async () => {
    const error = new Error("Request failed with status code 409");
    error.response = {
      status: 409,
      data: {
        status: "error",
        code: "no_additional_feasible_alternative",
        message: "No additional feasible plan variation remains.",
      },
    };
    throw error;
  };
  try {
    await assert.rejects(
      generateItineraryFromAI({ generation_mode: "full_regeneration" }),
      (error) => {
        assert.equal(error.statusCode, 409);
        assert.equal(error.details.code, "no_additional_feasible_alternative");
        assert.equal(error.details.message, "No additional feasible plan variation remains.");
        return true;
      }
    );
    assert.deepEqual(logged, []);
  } finally {
    axios.post = originalPost;
    console.error = originalError;
  }
});

test("itinerary service preserves insufficient-alternative errors", async () => {
  const originalPost = axios.post;
  axios.post = async () => {
    const error = new Error("Request failed with status code 409");
    error.response = {
      status: 409,
      data: {
        status: "error",
        code: "insufficient_verified_alternatives",
        error: "No different verified route can satisfy the constraints."
      }
    };
    throw error;
  };
  try {
    await assert.rejects(
      generateItineraryFromAI({ generation_mode: "full_regeneration" }),
      (error) => {
        assert.equal(error.statusCode, 409);
        assert.equal(error.details.code, "insufficient_verified_alternatives");
        return true;
      }
    );
  } finally {
    axios.post = originalPost;
  }
});
