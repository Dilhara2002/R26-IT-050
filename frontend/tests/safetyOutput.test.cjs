const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const babel = require("@babel/core");
const code = babel.transformFileSync(path.resolve(__dirname, "../src/utils/safetyOutput.js"), {
  presets: ["babel-preset-expo"], babelrc: false, configFile: false,
}).code;
const helper = { exports: {} };
new Function("module", "exports", "require", code)(helper, helper.exports, require);
const { getSafetyOutputLabels: labels } = helper.exports;

test("rain renders unknown, observed dry and observed rain distinctly", () => {
  assert.equal(labels({}).rain, "Unavailable");
  assert.equal(labels({ analysis: { rainDetected: null } }).rain, "Unavailable");
  assert.equal(labels({ analysis: { rainDetected: false } }).rain, "No");
  assert.equal(labels({ analysis: { rainDetected: true } }).rain, "Yes");
  assert.equal(labels({ analysis: { weatherStatus: "unavailable", rainDetected: false } }).rain, "Unavailable");
});
test("road and inference do not imply graph support or exact coverage", () => {
  const output = labels({ routeResult: { evidenceAvailable: true, roadEvidence: {
    status: "available", coverage: { matchedLabelCount: 2, totalLabelCount: 3 },
  }, historicalGraphEvidence: { status: "unavailable" } } });
  assert.equal(output.model, "Available");
  assert.equal(output.road, "Available");
  assert.equal(output.graph, "Unavailable");
  assert.match(output.coverage, /2\/3.*not segment coverage/);
  assert.equal(labels({}).model, "Unavailable");
  assert.equal(labels({}).road, "Unavailable");
  assert.equal(labels({ analysis: { matchedRoad: "A1" } }).road, "Available");
  assert.equal(labels({ routeResult: { historicalGraphEvidence: { status: "no-match" } } }).graph, "No matched records");
  assert.equal(labels({ routeResult: { historicalGraphEvidence: { status: "available" } } }).graph, "Available");
});
test("comparison displays real differences including zero and never defaults missing values", () => {
  const result = { routeResult: { comparisonAvailable: true }, comparison: {
    status: "available", extraMinutesVsFastest: 2, extraDistanceKmVsFastest: 1,
  } };
  assert.equal(labels(result).comparison, "2 mins, 1 km");
  result.comparison.extraMinutesVsFastest = 0;
  result.comparison.extraDistanceKmVsFastest = 0;
  assert.equal(labels(result).comparison, "0 mins, 0 km");
  result.comparison.extraMinutesVsFastest = null;
  assert.equal(labels(result).comparison, "Unavailable");
  assert.equal(labels({ routeResult: { comparisonAvailable: true } }).comparison, "Unavailable");
  assert.equal(labels({}).comparison, "Unavailable");
});
