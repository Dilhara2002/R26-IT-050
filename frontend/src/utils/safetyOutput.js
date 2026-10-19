export function getSafetyOutputLabels(result) {
  const route = result?.routeResult;
  const analysis = result?.analysis;
  const comparison = result?.comparison;
  const graph = route?.historicalGraphEvidence;
  const reasoning = result?.graphRAG;
  const graphStatus = graph?.status || (reasoning?.status === "available"
    ? (reasoning.matchType === "no-match" || !reasoning.matchedRisks?.length ? "no-match" : "available")
    : "unavailable");
  const coverage = route?.roadEvidence?.coverage;
  const hasLabelCounts = Number.isInteger(coverage?.matchedLabelCount) &&
    Number.isInteger(coverage?.totalLabelCount) && coverage.totalLabelCount > 0;
  const canCompare = route?.comparisonAvailable === true && comparison?.status !== "unavailable" &&
    Number.isFinite(comparison?.extraMinutesVsFastest) && Number.isFinite(comparison?.extraDistanceKmVsFastest);
  return {
    rain: analysis?.weatherStatus === "unavailable" || typeof analysis?.rainDetected !== "boolean"
      ? "Unavailable" : analysis.rainDetected ? "Yes" : "No",
    model: route?.evidenceAvailable === true || (!route && result?.riskPrediction)
      ? "Available" : "Unavailable",
    road: route?.roadEvidence?.status === "available" || (!route?.roadEvidence && analysis?.matchedRoad)
      ? "Available" : "Unavailable",
    graph: graphStatus === "available" ? "Available" : graphStatus === "no-match" ? "No matched records" : "Unavailable",
    coverage: hasLabelCounts
      ? `${coverage.matchedLabelCount}/${coverage.totalLabelCount} provider labels matched; route-family approximation, not segment coverage`
      : "Unknown; exact traversed-segment coverage is not established",
    comparison: canCompare
      ? `${comparison.extraMinutesVsFastest} mins, ${comparison.extraDistanceKmVsFastest} km`
      : "Unavailable",
  };
}
