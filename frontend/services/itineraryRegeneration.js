const MAX_RECENT_PLAN_SIGNATURES = 6;
const MAX_ROUTE_STOPS = 8;
const MAX_GUIDE_EXPLANATION_CHARS = 8000;

export function validGuideExplanation(data, deterministicExplanation = null) {
  const candidates = [data?.guide_explanation, data?.ai_paraphrase];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const normalized = candidate.trim();
    if (
      normalized &&
      normalized.length <= MAX_GUIDE_EXPLANATION_CHARS &&
      normalized !== deterministicExplanation
    ) {
      return normalized;
    }
  }
  return null;
}

export function parseGuideExplanation(guideText, optimizedStops = []) {
  if (typeof guideText !== "string" || !guideText.trim()) return null;
  const normalized = guideText.trim();
  const lines = normalized.split(/\r?\n/).map((line) => line.trim());
  const sections = [];
  let current = null;
  for (const line of lines) {
    if (!line) continue;
    const stopMatch = line.match(/^Stop\s+(\d+)\s*:\s*(.+)$/i);
    if (/^Trip overview:?$/i.test(line)) {
      current = { type: "overview", title: "Trip overview", body: [] };
      sections.push(current);
    } else if (stopMatch) {
      current = {
        type: "stop",
        sequence: Number(stopMatch[1]),
        name: stopMatch[2].trim(),
        title: `Stop ${stopMatch[1]}: ${stopMatch[2].trim()}`,
        body: [],
      };
      sections.push(current);
    } else if (/^Route-flow conclusion:?$/i.test(line)) {
      current = { type: "conclusion", title: "Route-flow conclusion", body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  const stopSections = sections.filter((section) => section.type === "stop");
  const expectedStops = Array.isArray(optimizedStops) ? optimizedStops : [];
  const structured =
    sections.some((section) => section.type === "overview") &&
    sections.some((section) => section.type === "conclusion") &&
    stopSections.length === expectedStops.length &&
    stopSections.every(
      (section, index) =>
        section.sequence === index + 1 && section.name === expectedStops[index]?.name
    );
  return structured
    ? { structured: true, sections: sections.map((section) => ({ ...section, body: section.body.join("\n") })), raw: normalized }
    : { structured: false, sections: [], raw: normalized };
}

function stablePlaceIds(data) {
  const stops = Array.isArray(data?.optimized_stops) ? data.optimized_stops : [];
  const ids = stops.map((stop) => String(stop?.place_id ?? "").trim());
  if (!ids.length || ids.some((placeId) => !placeId) || new Set(ids).size !== ids.length) {
    throw new Error("This itinerary does not contain usable stable place IDs.");
  }
  return ids;
}

const canonicalSignature = (placeIds) => [...placeIds].sort();
const signatureKey = (signature) => canonicalSignature(signature).join("\u001f");

function validatedTargetStopCount(value, fallback) {
  const candidate = value ?? fallback;
  if (!Number.isInteger(candidate) || candidate < 1 || candidate > MAX_ROUTE_STOPS) {
    throw new Error(`target_stop_count must be an integer from 1 to ${MAX_ROUTE_STOPS}.`);
  }
  return candidate;
}

function normalizeRecentSignatures(signatures = []) {
  if (!Array.isArray(signatures) || signatures.length > MAX_RECENT_PLAN_SIGNATURES) {
    throw new Error(`Recent plan history must contain at most ${MAX_RECENT_PLAN_SIGNATURES} signatures.`);
  }
  const normalized = [];
  const seen = new Set();
  for (const signature of signatures) {
    if (!Array.isArray(signature) || signature.length < 1 || signature.length > MAX_ROUTE_STOPS) {
      throw new Error("Each recent plan signature must contain between 1 and 8 place IDs.");
    }
    const ids = signature.map((value) => String(value ?? "").trim());
    if (ids.some((value) => !value) || new Set(ids).size !== ids.length) {
      throw new Error("Recent plan signatures require unique, non-empty place IDs.");
    }
    const canonical = canonicalSignature(ids);
    const key = signatureKey(canonical);
    if (!seen.has(key)) {
      normalized.push(canonical);
      seen.add(key);
    }
  }
  return normalized;
}

export function createRegenerationContext(data) {
  const currentSignature = canonicalSignature(stablePlaceIds(data));
  const targetStopCount = validatedTargetStopCount(
    data?.regeneration_target_stop_count,
    currentSignature.length
  );
  return {
    targetStopCount,
    recentPlanSignatures: [currentSignature],
  };
}

export function recordSuccessfulPlan(context, data) {
  const targetStopCount = validatedTargetStopCount(
    context?.targetStopCount,
    stablePlaceIds(data).length
  );
  const history = normalizeRecentSignatures(context?.recentPlanSignatures || []);
  const nextSignature = canonicalSignature(stablePlaceIds(data));
  const withoutDuplicate = history.filter(
    (signature) => signatureKey(signature) !== signatureKey(nextSignature)
  );
  return {
    targetStopCount,
    recentPlanSignatures: [...withoutDuplicate, nextSignature].slice(
      -MAX_RECENT_PLAN_SIGNATURES
    ),
  };
}

function baseRequest(data) {
  const startingLocation = data?.starting_location;
  const preferences = data?.user_preferences;
  if (
    !startingLocation ||
    !Number.isFinite(Number(startingLocation.lat)) ||
    !Number.isFinite(Number(startingLocation.lon)) ||
    !Array.isArray(preferences) ||
    !preferences.length ||
    !Number.isFinite(Number(data?.max_time_allocated_mins))
  ) {
    throw new Error("The original itinerary inputs are incomplete.");
  }
  const request = {
    preferences,
    max_time_minutes: Number(data.max_time_allocated_mins),
    current_lat: Number(startingLocation.lat),
    current_lon: Number(startingLocation.lon),
  };
  if (Number.isFinite(Number(data.search_radius_km))) {
    request.radius_km = Number(data.search_radius_km);
  }
  return request;
}

export function buildReplacementRequest(data, rejectedPlaceId) {
  const placeIds = stablePlaceIds(data);
  const normalizedRejectedId = String(rejectedPlaceId ?? "").trim();
  if (!placeIds.includes(normalizedRejectedId)) {
    throw new Error("The selected stop is no longer part of this itinerary.");
  }
  return {
    ...baseRequest(data),
    generation_mode: "replace_stop",
    excluded_place_ids: [normalizedRejectedId],
    locked_place_ids: placeIds.filter((placeId) => placeId !== normalizedRejectedId),
    replaced_place_id: normalizedRejectedId,
    target_stop_count: placeIds.length,
  };
}

export function buildFullRegenerationRequest(data, context = null) {
  const currentSignature = canonicalSignature(stablePlaceIds(data));
  const targetStopCount = validatedTargetStopCount(
    context?.targetStopCount ?? data?.regeneration_target_stop_count,
    currentSignature.length
  );
  const recentPlanSignatures = normalizeRecentSignatures(
    context?.recentPlanSignatures || []
  );
  if (!recentPlanSignatures.some(
    (signature) => signatureKey(signature) === signatureKey(currentSignature)
  )) {
    recentPlanSignatures.push(currentSignature);
  }
  return {
    ...baseRequest(data),
    generation_mode: "full_regeneration",
    // Retained for older servers as the legacy current-plan signature. New
    // servers do not remove this entire set from the candidate pool.
    excluded_place_ids: currentSignature,
    locked_place_ids: [],
    target_stop_count: targetStopCount,
    current_plan_signature: currentSignature,
    recent_plan_signatures: recentPlanSignatures.slice(-MAX_RECENT_PLAN_SIGNATURES),
  };
}

export function regenerationErrorMessage(error) {
  const status = error?.response?.status;
  const code = error?.response?.data?.code;
  if (
    status === 504 ||
    code === "itinerary_generation_timeout" ||
    error?.code === "ECONNABORTED" ||
    error?.code === "ETIMEDOUT"
  ) {
    return "This plan variation took longer than expected.";
  }
  const serverMessage =
    error?.response?.data?.error || error?.response?.data?.message;
  if (typeof serverMessage === "string" && serverMessage.trim()) {
    return serverMessage.trim();
  }
  if (!error?.response) {
    return "The itinerary service could not be reached.";
  }
  return "The itinerary could not be regenerated.";
}

export function regenerationErrorKind(error) {
  const status = error?.response?.status;
  const code = error?.response?.data?.code;
  if (code === "no_additional_feasible_alternative") return "exhausted";
  if (
    status === 504 ||
    code === "itinerary_generation_timeout" ||
    error?.code === "ECONNABORTED" ||
    error?.code === "ETIMEDOUT"
  ) return "timeout";
  if (status === 409) return "no_feasible_alternative";
  if (!error?.response) return "service_unavailable";
  return "unexpected";
}

export function regenerationRecoveryMessage(kind) {
  if (kind === "timeout") {
    return "Your current itinerary has been kept. Please try again or adjust the interests, time, or radius.";
  }
  if (kind === "exhausted" || kind === "no_feasible_alternative") {
    return "The current itinerary has been kept. Unique alternatives are limited by the verified catalogue and your constraints.";
  }
  if (kind === "service_unavailable") {
    return "Your current itinerary has been kept. Check the local services and try again.";
  }
  return "Your current itinerary has been kept. Please try again.";
}

export function applySuccessfulRegeneration(currentState, responsePayload) {
  if (
    responsePayload?.status !== "success" ||
    !responsePayload?.data ||
    responsePayload.data.route_changed !== true ||
    !Array.isArray(responsePayload.data.optimized_stops) ||
    !responsePayload.data.optimized_stops.length
  ) {
    throw new Error("The regeneration service returned an unusable or unchanged route.");
  }
  const mode = responsePayload.data.generation_mode || currentState?.regenerationLoading?.mode;
  const currentSignature = canonicalSignature(stablePlaceIds(currentState.data));
  const nextSignature = canonicalSignature(stablePlaceIds(responsePayload.data));
  const context = currentState.regenerationContext || createRegenerationContext(currentState.data);
  if (mode === "full_regeneration") {
    if (nextSignature.length !== context.targetStopCount) {
      throw new Error(
        `The regenerated plan did not preserve the stable ${context.targetStopCount}-stop target.`
      );
    }
    if (signatureKey(nextSignature) === signatureKey(currentSignature)) {
      throw new Error("The regeneration service returned the current plan again.");
    }
    const recentKeys = new Set(
      normalizeRecentSignatures(context.recentPlanSignatures).map(signatureKey)
    );
    if (recentKeys.has(signatureKey(nextSignature))) {
      throw new Error("The regeneration service returned a recent plan again.");
    }
  }
  return {
    ...currentState,
    data: responsePayload.data,
    persistence: responsePayload.persistence || null,
    safetyResult: null,
    safetyError: "",
    validationError: "",
    regenerationError: "",
    regenerationLoading: null,
    regenerationContext: recordSuccessfulPlan(context, responsePayload.data),
  };
}

export function applyFailedRegeneration(currentState, error) {
  return {
    ...currentState,
    regenerationLoading: null,
    regenerationError: regenerationErrorMessage(error),
    regenerationErrorKind: regenerationErrorKind(error),
  };
}
