import test from "node:test";
import assert from "node:assert/strict";
import {
  getHotelPrice,
  validateStayRequest,
} from "../src/services/liteApiHotelPricing.service.js";

test("validateStayRequest calculates complete stay length", () => {
  const result = validateStayRequest({
    checkInDate: "2026-09-10",
    checkOutDate: "2026-09-13",
    adults: 4,
    roomQuantity: 2,
  });
  assert.equal(result.valid, true);
  assert.equal(result.value.nights, 3);
});

test("validateStayRequest rejects invalid dates and rooms without adults", () => {
  assert.equal(validateStayRequest({}).valid, false);
  assert.equal(
    validateStayRequest({
      checkInDate: "2026-09-13",
      checkOutDate: "2026-09-10",
      adults: 2,
      roomQuantity: 1,
    }).valid,
    false
  );
  assert.equal(
    validateStayRequest({
      checkInDate: "2026-09-10",
      checkOutDate: "2026-09-13",
      adults: 1,
      roomQuantity: 2,
    }).valid,
    false
  );
});

test("getHotelPrice reports missing credentials without inventing a price", async () => {
  const previousKey = process.env.LITEAPI_KEY;
  delete process.env.LITEAPI_KEY;
  try {
    const result = await getHotelPrice(
      { hotelName: "Example Hotel", hotelLatitude: 7.29, hotelLongitude: 80.63 },
      {
        checkInDate: "2026-09-10",
        checkOutDate: "2026-09-13",
        adults: 2,
        roomQuantity: 1,
      }
    );
    assert.equal(result.status, "unavailable");
    assert.match(result.reason, /LITEAPI_KEY/);
    assert.equal("total" in result, false);
  } finally {
    if (previousKey === undefined) delete process.env.LITEAPI_KEY;
    else process.env.LITEAPI_KEY = previousKey;
  }
});

test("getHotelPrice maps a LiteAPI whole-stay retail total", async () => {
  const previousKey = process.env.LITEAPI_KEY;
  const previousFetch = global.fetch;
  process.env.LITEAPI_KEY = "test-key";
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      sandbox: true,
      hotels: [{ id: "lp-kandy", name: "Example Hotel", address: "Kandy" }],
      data: [
        {
          hotelId: "lp-kandy",
          roomTypes: [
            {
              offerId: "offer-1",
              rates: [
                {
                  name: "Deluxe Room",
                  boardName: "Breakfast Included",
                  retailRate: {
                    total: [{ amount: 300, currency: "USD" }],
                    taxesAndFees: [],
                  },
                },
              ],
            },
          ],
        },
      ],
    }),
  });

  try {
    const result = await getHotelPrice(
      { hotelName: "The Example Hotel", hotelLatitude: 7.29, hotelLongitude: 80.63 },
      {
        checkInDate: "2026-09-10",
        checkOutDate: "2026-09-13",
        adults: 4,
        roomQuantity: 2,
      }
    );
    assert.equal(result.status, "available");
    assert.equal(result.environment, "SANDBOX");
    assert.equal(result.offer.total, "300.00");
    assert.equal(result.offer.estimatedPerRoomPerNight, "50.00");
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.LITEAPI_KEY;
    else process.env.LITEAPI_KEY = previousKey;
  }
});
