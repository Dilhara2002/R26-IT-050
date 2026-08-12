const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../src/app");


test(
  "POST /api/safety/recommend-vehicle returns a valid result or controlled ML outage",
  async () => {

    const response = await request(app)
      .post("/api/safety/recommend-vehicle")
      .send({
        startLocation: "Colombo",
        endLocation: "Kandy",
        budget: 15000,
        passengers: 4,
        preferredCategory: "SUV",
      });


    if (response.status === 200) {
      assert.equal(response.body.success, true);
      assert.ok(response.body.riskPrediction);
      assert.ok(response.body.analysis);
      assert.ok(response.body.graphRAG);
      assert.ok(
        Object.hasOwn(
          response.body,
          "totalVehiclesAnalyzed"
        )
      );
      return;
    }


    assert.equal(response.status, 503);
    assert.equal(response.body.code, "ML_UNAVAILABLE");
  }
);


test(
  "POST /api/safety/recommend-vehicle rejects missing required fields",
  async () => {

    const response = await request(app)
      .post("/api/safety/recommend-vehicle")
      .send({
        startLocation: "Colombo",
      });


    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  }
);
