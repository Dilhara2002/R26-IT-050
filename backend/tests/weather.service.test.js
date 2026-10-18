import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { getWeatherByCoordinates } from "../src/services/weatherService.js";

test("weather provider preserves observations and fails to unknown with a bounded request", async (t) => {
  const originalKey = process.env.OPENWEATHER_API_KEY;
  const originalGet = axios.get;
  t.after(() => {
    axios.get = originalGet;
    if (originalKey === undefined) delete process.env.OPENWEATHER_API_KEY;
    else process.env.OPENWEATHER_API_KEY = originalKey;
  });
  delete process.env.OPENWEATHER_API_KEY;
  let calls = 0;
  axios.get = async () => { calls += 1; throw new Error("must not call without credentials"); };
  const missing = await getWeatherByCoordinates(7, 80);
  assert.equal(calls, 0);
  assert.equal(missing.status, "unavailable");
  assert.equal(missing.isRaining, null);
  process.env.OPENWEATHER_API_KEY = "test-only";
  for (const code of ["ECONNABORTED", "ERR_BAD_RESPONSE"]) {
    let timeout;
    axios.get = async (_url, options) => {
      timeout = options.timeout;
      throw Object.assign(new Error("provider failure"), { code });
    };
    const failed = await getWeatherByCoordinates(7, 80);
    assert.equal(timeout, 5000);
    assert.equal(failed.status, "unavailable");
    assert.equal(failed.isRaining, null);
  }
  for (const [main, rain] of [["Clear", false], ["Rain", true]]) {
    axios.get = async () => ({ data: { weather: [{ main, description: main }], main: { temp: 26 } } });
    const observed = await getWeatherByCoordinates(7, 80);
    assert.equal(observed.status, "available");
    assert.equal(observed.isRaining, rain);
  }
  axios.get = async () => ({ data: {} });
  assert.equal((await getWeatherByCoordinates(7, 80)).isRaining, null);
});
