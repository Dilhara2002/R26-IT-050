// Browser storage contains navigation/trip display state only, never credentials.
const PREFIX = "ceylongo.navigation.";
export const screenPaths = {
  Main: "app/:page?", ItineraryHome: "itinerary", ItineraryResult: "itinerary/result",
  ItineraryVehicle: "itinerary/vehicle", Map: "itinerary/map", SafetyMap: "safety/map",
  TripReview: "trip/summary", LandmarkExplorer: "landmarks", LandmarkScanner: "landmarks/scan",
  LandmarkChat: "landmarks/chat", HotelHome: "hotels", HotelResults: "hotels/results",
  LocationPicker: "location",
};
export const mainPage = (requested, role) => {
  if (role === "admin") return "admin";
  return ["dashboard", "form", "result"].includes(requested) ? requested : "dashboard";
};
export const readNavigation = (storage, userId) => {
  try {
    const raw = storage?.getItem(PREFIX + userId);
    if (!raw || raw.length > 2000000) return null;
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.navigation?.routes) ||
        !data.navigation.routes.every(route => Object.hasOwn(screenPaths, route.name))) return null;
    return data;
  } catch { return null; }
};
export const saveNavigation = (storage, userId, data) => {
  if (!userId) return;
  try {
    const text = JSON.stringify({ ...data, version: 1 }, (key, value) =>
      /password|token|cookie|secret/i.test(key) ? undefined : value);
    if (text.length <= 2000000) storage?.setItem(PREFIX + userId, text);
  } catch { /* Storage may be disabled or full; authentication never depends on it. */ }
};
export const clearNavigation = (storage, userId) => {
  try { if (userId) storage?.removeItem(PREFIX + userId); } catch { /* Optional storage. */ }
};
export const navigationForUrl = (saved, pathname) => saved?.path?.split("?")[0] === pathname ? saved.navigation : undefined;

// Complex route data belongs in the account-scoped snapshot, never in query strings.
export const navigationForLink = state => ({ ...state, routes: state.routes.map(route => ({
  ...route,
  params: route.name === "Main" && route.params?.page ? { page: route.params.page } : undefined,
  ...(route.state ? { state: navigationForLink(route.state) } : {}),
})) });

export const hasRequiredRouteData = (name, params) => {
  const fields = { TripReview: ["selectedVehicle", "tripResult"], SafetyMap: ["selectedRoute"],
    ItineraryResult: ["data"], ItineraryVehicle: ["itinerary"], Map: ["startingLocation"] }[name] || [];
  return fields.every(field => params?.[field] && typeof params[field] === "object" && !Array.isArray(params[field]));
};
