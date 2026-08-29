export const MAX_ITINERARY_MINUTES = 1440;

function parseOptionalWholeNumber(rawValue, fieldName) {
  const normalized = String(rawValue ?? "").trim();
  if (!normalized) return 0;
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${fieldName} must be a non-negative whole number.`);
  }
  const value = Number(normalized);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${fieldName} must be a finite whole number.`);
  }
  return value;
}

export function parseAvailableTime(hours, minutes) {
  const hourValue = parseOptionalWholeNumber(hours, "Hours");
  const minuteValue = parseOptionalWholeNumber(minutes, "Minutes");
  if (minuteValue > 59) {
    throw new Error("Minutes must be between 0 and 59.");
  }
  const totalMinutes = hourValue * 60 + minuteValue;
  if (!Number.isSafeInteger(totalMinutes) || totalMinutes <= 0) {
    throw new Error("Available time must be greater than zero.");
  }
  if (totalMinutes > MAX_ITINERARY_MINUTES) {
    throw new Error("Available time cannot exceed 24 hours.");
  }
  return totalMinutes;
}
