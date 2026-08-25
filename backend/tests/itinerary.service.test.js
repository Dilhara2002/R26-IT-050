import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";

import { generateItineraryFromAI } from "../src/services/itinerary.service.js";


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
