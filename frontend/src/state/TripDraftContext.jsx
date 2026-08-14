import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const initialDraft = {
  prompt: "",
  budget: "15000",
  passengers: "2",
  originName: "Colombo",
  destinationName: "Kandy",
  origin: { latitude: 7.2906, longitude: 80.6337 },
  timeBudgetMinutes: 480,
  recommendations: null,
  selectedHotel: null,
  selectedActivities: [],
  itinerary: null,
  safety: null,
  selectedVehicle: null,
};

const TripDraftContext = createContext(null);

export function TripDraftProvider({ children }) {
  const [draft, setDraft] = useState(initialDraft);
  const updateDraft = useCallback((updates) => setDraft((current) => ({ ...current, ...updates })), []);
  const resetDraft = useCallback(() => setDraft(initialDraft), []);
  const value = useMemo(() => ({ draft, updateDraft, resetDraft }), [draft, resetDraft, updateDraft]);
  return <TripDraftContext.Provider value={value}>{children}</TripDraftContext.Provider>;
}

export function useTripDraft() {
  const context = useContext(TripDraftContext);
  if (!context) throw new Error("useTripDraft must be used inside TripDraftProvider");
  return context;
}
