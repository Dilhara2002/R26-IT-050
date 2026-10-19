import test from "node:test";
import assert from "node:assert/strict";

import { similarityScore } from "../src/services/routeService.js";

test("hotel bridge ignores Sri Lanka country suffixes during geocoder matching", () => {
  assert.equal(similarityScore("Kandy, Sri Lanka", "Kandy"), 1);
  assert.equal(similarityScore("Colombo, LK", "Colombo"), 1);
});

test("hotel bridge accepts an equivalent geocoder district label", () => {
  assert.equal(similarityScore("Kandy, Sri Lanka", "Kandy District"), 1);
});

test("location matching still rejects unrelated destinations", () => {
  assert.ok(similarityScore("Kandy, Sri Lanka", "Galle") < 0.5);
});
