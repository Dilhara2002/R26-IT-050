const DEFAULT_BASE_URL = "https://api.liteapi.travel/v3.0";
const MATCH_RADIUS_METERS = 10_000;

const normalizeName = (value = "") =>
  String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(hotel|resort|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const unavailable = (reason, details = {}) => ({
  status: "unavailable",
  source: "LITEAPI_HOTEL_RATES",
  reason,
  ...details,
});

const apiBaseUrl = () =>
  (process.env.LITEAPI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");

const namesMatch = (expected, candidate) => {
  const left = normalizeName(expected);
  const right = normalizeName(candidate);
  return Boolean(
    left &&
      right &&
      (left === right ||
        (right.length >= 6 && left.includes(right)) ||
        (left.length >= 6 && right.includes(left)))
  );
};

const buildOccupancies = (adults, roomQuantity) => {
  const occupancies = Array.from({ length: roomQuantity }, () => ({ adults: 0 }));
  for (let index = 0; index < adults; index += 1) {
    occupancies[index % roomQuantity].adults += 1;
  }
  return occupancies;
};

const findRate = (hotelResult) => {
  for (const roomType of hotelResult?.roomTypes || []) {
    for (const rate of roomType?.rates || []) {
      const total = rate?.retailRate?.total?.[0];
      if (Number.isFinite(Number(total?.amount)) && total?.currency) {
        return { roomType, rate, total };
      }
    }
  }
  return null;
};

export const validateStayRequest = (stay) => {
  if (!stay || typeof stay !== "object") {
    return { valid: false, error: "stay details are required for hotel pricing." };
  }

  const { checkInDate, checkOutDate } = stay;
  const adults = Number(stay.adults);
  const roomQuantity = Number(stay.roomQuantity);
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDate.test(checkInDate || "") || !isoDate.test(checkOutDate || "")) {
    return { valid: false, error: "checkInDate and checkOutDate must use YYYY-MM-DD." };
  }

  const checkIn = new Date(`${checkInDate}T00:00:00Z`);
  const checkOut = new Date(`${checkOutDate}T00:00:00Z`);
  if (!Number.isFinite(checkIn.getTime()) || !Number.isFinite(checkOut.getTime()) || checkOut <= checkIn) {
    return { valid: false, error: "checkOutDate must be after checkInDate." };
  }
  if (!Number.isInteger(adults) || adults < 1 || adults > 36) {
    return { valid: false, error: "adults must be an integer from 1 to 36." };
  }
  if (!Number.isInteger(roomQuantity) || roomQuantity < 1 || roomQuantity > 9) {
    return { valid: false, error: "roomQuantity must be an integer from 1 to 9." };
  }
  if (roomQuantity > adults) {
    return { valid: false, error: "roomQuantity cannot exceed the number of adults." };
  }

  return {
    valid: true,
    value: {
      checkInDate,
      checkOutDate,
      adults,
      roomQuantity,
      nights: Math.round((checkOut - checkIn) / 86_400_000),
    },
  };
};

export const getHotelPrice = async (hotel, stay, options = {}) => {
  const validation = validateStayRequest(stay);
  if (!validation.valid) return unavailable(validation.error);

  const apiKey = process.env.LITEAPI_KEY;
  if (!apiKey) {
    return unavailable("LITEAPI_KEY is not configured.", { stay: validation.value });
  }

  const latitude = Number(hotel.hotelLatitude ?? hotel.latitude);
  const longitude = Number(hotel.hotelLongitude ?? hotel.longitude);
  const expectedName = hotel.hotelName ?? hotel.name;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !expectedName) {
    return unavailable("The recommended hotel is missing coordinates or a name.", {
      stay: validation.value,
    });
  }

  try {
    const response = await fetch(`${apiBaseUrl()}/hotels/rates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        checkin: validation.value.checkInDate,
        checkout: validation.value.checkOutDate,
        currency: options.currency || process.env.LITEAPI_CURRENCY || "USD",
        guestNationality: process.env.LITEAPI_GUEST_NATIONALITY || "LK",
        occupancies: buildOccupancies(
          validation.value.adults,
          validation.value.roomQuantity
        ),
        latitude,
        longitude,
        radius: MATCH_RADIUS_METERS,
        hotelName: expectedName,
        includeHotelData: true,
        roomMapping: true,
        maxRatesPerHotel: 1,
        limit: 10,
        timeout: 10,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage =
        payload?.error?.message || payload?.message || payload?.error || null;
      throw new Error(
        typeof providerMessage === "string"
          ? providerMessage
          : `LiteAPI request failed with status ${response.status}.`
      );
    }

    const matchedHotel = (payload.hotels || []).find((candidate) =>
      namesMatch(expectedName, candidate.name)
    );
    if (!matchedHotel) {
      return unavailable("No safely name-matched LiteAPI hotel was found near this recommendation.", {
        stay: validation.value,
      });
    }

    const hotelResult = (payload.data || []).find(
      (candidate) => String(candidate.hotelId) === String(matchedHotel.id)
    );
    const selectedRate = findRate(hotelResult);
    if (!selectedRate) {
      return unavailable("The matched hotel has no room rate for these dates and guests.", {
        stay: validation.value,
        matchedHotel: { hotelId: matchedHotel.id, name: matchedHotel.name },
      });
    }

    const { roomType, rate, total } = selectedRate;
    const totalAmount = Number(total.amount);
    const divisor = validation.value.nights * validation.value.roomQuantity;
    return {
      status: "available",
      source: "LITEAPI_HOTEL_RATES",
      environment: payload.sandbox === true ? "SANDBOX" : "PRODUCTION",
      isLiveMarketRate: payload.sandbox !== true,
      matchedHotel: {
        hotelId: matchedHotel.id,
        name: matchedHotel.name,
        address: matchedHotel.address || null,
      },
      stay: validation.value,
      offer: {
        offerId: roomType.offerId || rate.offerId || null,
        roomDescription: rate.name || null,
        boardName: rate.boardName || null,
        refundable: rate.cancellationPolicies?.refundableTag || null,
        currency: total.currency,
        total: totalAmount.toFixed(2),
        base: null,
        estimatedPerRoomPerNight: (totalAmount / divisor).toFixed(2),
        taxes: rate.retailRate?.taxesAndFees || [],
      },
      note: "The provider retail total covers all requested room occupancies for the complete stay.",
    };
  } catch (error) {
    return unavailable(error.message, { stay: validation.value });
  }
};
