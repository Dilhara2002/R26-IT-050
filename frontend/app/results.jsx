import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

const toNumber = (value, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    typeof value.low === "number"
  ) {
    return value.low;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
};

const safeText = (value, fallback = "Not available") => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (
    typeof value === "object" &&
    typeof value.low === "number"
  ) {
    return String(value.low);
  }

  if (typeof value === "object") {
    return fallback;
  }

  return String(value);
};

const getHotelName = (hotel) => {
  return (
    hotel?.name ||
    hotel?.hotelName ||
    hotel?.propertyName ||
    "Recommended Hotel"
  );
};

const getActivityName = (activity) => {
  if (typeof activity === "string") {
    return activity;
  }

  return (
    activity?.name ||
    activity?.activityName ||
    activity?.title ||
    "Activity"
  );
};

const getItineraryDays = (recommendation) => {
  const itinerary = recommendation?.itinerary;

  if (!itinerary) {
    return [];
  }

  if (Array.isArray(itinerary)) {
    return itinerary;
  }

  if (Array.isArray(itinerary.dayWisePlan)) {
    return itinerary.dayWisePlan;
  }

  if (Array.isArray(itinerary.days)) {
    return itinerary.days;
  }

  return [];
};

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [selectedRecommendation, setSelectedRecommendation] =
    useState(null);

  const parsedData = useMemo(() => {
    try {
      const rawData =
        params?.data ||
        params?.result ||
        params?.packageData ||
        params?.recommendations;

      if (!rawData) {
        return null;
      }

      const normalizedRaw = Array.isArray(rawData)
        ? rawData[0]
        : rawData;

      if (typeof normalizedRaw === "object") {
        return normalizedRaw;
      }

      return JSON.parse(normalizedRaw);
    } catch (error) {
      console.error(
        "Failed to parse recommendation data:",
        error
      );

      return null;
    }
  }, [params]);

  const recommendations = useMemo(() => {
    if (!Array.isArray(parsedData?.recommendations)) {
      return [];
    }

    // Frontend displays maximum TOP 3 hotels.
    return parsedData.recommendations.slice(0, 3);
  }, [parsedData]);

  const handleSelectHotel = (recommendation) => {
    setSelectedRecommendation(recommendation);

    console.log(
      "Selected hotel:",
      recommendation?.hotel?.name
    );
  };

  const handleContinue = () => {
    if (!selectedRecommendation) {
      return;
    }

    console.log(
      "Continuing with selected recommendation:",
      selectedRecommendation
    );

    /*
     * CURRENT BEHAVIOUR:
     * We keep the complete selected recommendation:
     *
     * selectedRecommendation.hotel
     * selectedRecommendation.activities
     * selectedRecommendation.itinerary
     *
     * Later this can be passed to the next itinerary/safety
     * screen.
     *
     * Example future navigation:
     *
     * router.push({
     *   pathname: "/selected-hotel",
     *   params: {
     *     recommendation: JSON.stringify(
     *       selectedRecommendation
     *     ),
     *   },
     * });
     */
  };

  if (!parsedData) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>
          Unable to Load Recommendations
        </Text>

        <Text style={styles.errorText}>
          Recommendation information is missing or invalid.
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() => router.back()}
        >
          <Text style={styles.primaryButtonText}>
            Go Back
          </Text>
        </Pressable>
      </View>
    );
  }

  if (recommendations.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>
          No Hotels Found
        </Text>

        <Text style={styles.errorText}>
          We could not find hotels matching your
          preferences. Please try another search.
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() => router.back()}
        >
          <Text style={styles.primaryButtonText}>
            Search Again
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>
          Top Hotel Recommendations
        </Text>

        <Text style={styles.subtitle}>
          Choose any hotel that you prefer from our top{" "}
          {recommendations.length} recommendations.
        </Text>
      </View>

      {parsedData?.userFriendlyResponse ? (
        <View style={styles.responseCard}>
          <Text style={styles.responseText}>
            {parsedData.userFriendlyResponse}
          </Text>
        </View>
      ) : null}

      {parsedData?.extractedPreferences ? (
        <View style={styles.preferencesCard}>
          <Text style={styles.sectionTitle}>
            Your Preferences
          </Text>

          {parsedData.extractedPreferences.district ? (
            <Text style={styles.preferenceText}>
              Destination:{" "}
              {safeText(
                parsedData.extractedPreferences.district
              )}
            </Text>
          ) : null}

          {parsedData.extractedPreferences.hotelCategory ? (
            <Text style={styles.preferenceText}>
              Hotel Type:{" "}
              {safeText(
                parsedData.extractedPreferences
                  .hotelCategory
              )}
            </Text>
          ) : null}

          {parsedData.extractedPreferences.grade ? (
            <Text style={styles.preferenceText}>
              Grade:{" "}
              {safeText(
                parsedData.extractedPreferences.grade
              )}
            </Text>
          ) : null}

          {parsedData.extractedPreferences.foodType ? (
            <Text style={styles.preferenceText}>
              Food Type:{" "}
              {safeText(
                parsedData.extractedPreferences.foodType
              )}
            </Text>
          ) : null}

          {parsedData.extractedPreferences.durationDays ? (
            <Text style={styles.preferenceText}>
              Duration:{" "}
              {safeText(
                parsedData.extractedPreferences.durationDays
              )}{" "}
              day(s)
            </Text>
          ) : null}

          {parsedData.extractedPreferences.activityCategory ? (
            <Text style={styles.preferenceText}>
              Activity Type:{" "}
              {safeText(
                parsedData.extractedPreferences
                  .activityCategory
              )}
            </Text>
          ) : null}
        </View>
      ) : null}

      {recommendations.map((recommendation, index) => {
        const hotel = recommendation?.hotel || {};

        const activities = Array.isArray(
          recommendation?.activities
        )
          ? recommendation.activities
          : [];

        const itineraryDays =
          getItineraryDays(recommendation);

        const rank =
          toNumber(recommendation?.rank, index + 1) ||
          index + 1;

        const matchingActivityCount = toNumber(
          recommendation?.matchScore
            ?.matchingActivityCount,
          activities.length
        );

        const isSelected =
          selectedRecommendation?.rank ===
          recommendation?.rank;

        return (
          <View
            key={
              hotel?.id ||
              `${getHotelName(hotel)}-${index}`
            }
            style={[
              styles.hotelCard,
              isSelected && styles.selectedHotelCard,
            ]}
          >
            <View style={styles.rankRow}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>
                  #{rank}
                </Text>
              </View>

              {isSelected ? (
                <View style={styles.selectedBadge}>
                  <Text style={styles.selectedBadgeText}>
                    Selected
                  </Text>
                </View>
              ) : (
                <Text style={styles.matchText}>
                  {matchingActivityCount} matching{" "}
                  {matchingActivityCount === 1
                    ? "activity"
                    : "activities"}
                </Text>
              )}
            </View>

            <Text style={styles.hotelName}>
              {getHotelName(hotel)}
            </Text>

            <View style={styles.hotelDetails}>
              {hotel?.district ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    District
                  </Text>

                  <Text style={styles.detailValue}>
                    {safeText(hotel.district)}
                  </Text>
                </View>
              ) : null}

              {hotel?.category ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    Category
                  </Text>

                  <Text style={styles.detailValue}>
                    {safeText(hotel.category)}
                  </Text>
                </View>
              ) : null}

              {hotel?.grade ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    Grade
                  </Text>

                  <Text style={styles.detailValue}>
                    {safeText(hotel.grade)}
                  </Text>
                </View>
              ) : null}

              {hotel?.foodType ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    Food Type
                  </Text>

                  <Text style={styles.detailValue}>
                    {safeText(hotel.foodType)}
                  </Text>
                </View>
              ) : null}

              {hotel?.rooms !== undefined &&
              hotel?.rooms !== null ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    Rooms
                  </Text>

                  <Text style={styles.detailValue}>
                    {safeText(hotel.rooms)}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Activities
              </Text>

              {activities.length > 0 ? (
                activities.map(
                  (activity, activityIndex) => {
                    const activityName =
                      getActivityName(activity);

                    const duration = toNumber(
                      activity?.durationHours,
                      0
                    );

                    return (
                      <View
                        key={`${activityName}-${activityIndex}`}
                        style={styles.activityCard}
                      >
                        <Text style={styles.activityName}>
                          {activityName}
                        </Text>

                        {activity?.category ? (
                          <Text
                            style={styles.activityMeta}
                          >
                            Category:{" "}
                            {safeText(
                              activity.category
                            )}
                          </Text>
                        ) : null}

                        {activity?.suitableFor ? (
                          <Text
                            style={styles.activityMeta}
                          >
                            Suitable For:{" "}
                            {safeText(
                              activity.suitableFor
                            )}
                          </Text>
                        ) : null}

                        {activity?.priceLevel ? (
                          <Text
                            style={styles.activityMeta}
                          >
                            Price Level:{" "}
                            {safeText(
                              activity.priceLevel
                            )}
                          </Text>
                        ) : null}

                        {duration > 0 ? (
                          <Text
                            style={styles.activityMeta}
                          >
                            Duration: {duration} hour
                            {duration === 1 ? "" : "s"}
                          </Text>
                        ) : null}
                      </View>
                    );
                  }
                )
              ) : (
                <Text style={styles.emptyActivities}>
                  No matching activities found for this
                  hotel.
                </Text>
              )}
            </View>

            {recommendation?.itinerary ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Suggested Itinerary
                </Text>

                {recommendation.itinerary.title ? (
                  <Text style={styles.itineraryTitle}>
                    {recommendation.itinerary.title}
                  </Text>
                ) : null}

                {recommendation.itinerary.summary ? (
                  <Text style={styles.itinerarySummary}>
                    {recommendation.itinerary.summary}
                  </Text>
                ) : null}

                {itineraryDays.map(
                  (day, dayIndex) => {
                    const dayActivities =
                      Array.isArray(day?.activities)
                        ? day.activities
                        : [];

                    return (
                      <View
                        key={`day-${
                          day?.day || dayIndex + 1
                        }`}
                        style={styles.dayCard}
                      >
                        <Text style={styles.dayTitle}>
                          Day{" "}
                          {safeText(
                            day?.day,
                            dayIndex + 1
                          )}
                        </Text>

                        {dayActivities.length > 0 ? (
                          dayActivities.map(
                            (
                              activity,
                              activityIndex
                            ) => (
                              <Text
                                key={`day-${dayIndex}-${activityIndex}`}
                                style={
                                  styles.dayActivity
                                }
                              >
                                •{" "}
                                {getActivityName(
                                  activity
                                )}
                              </Text>
                            )
                          )
                        ) : (
                          <Text
                            style={styles.dayActivity}
                          >
                            Free day at the hotel
                          </Text>
                        )}

                        {day?.notes ? (
                          <Text style={styles.dayNotes}>
                            {safeText(day.notes)}
                          </Text>
                        ) : null}
                      </View>
                    );
                  }
                )}

                {Array.isArray(
                  recommendation.itinerary
                    .whyThisPackageMatches
                ) &&
                recommendation.itinerary
                  .whyThisPackageMatches.length > 0 ? (
                  <View style={styles.whySection}>
                    <Text style={styles.whyTitle}>
                      Why This Hotel Matches
                    </Text>

                    {recommendation.itinerary.whyThisPackageMatches.map(
                      (reason, reasonIndex) => (
                        <Text
                          key={`reason-${reasonIndex}`}
                          style={styles.reasonText}
                        >
                          • {safeText(reason)}
                        </Text>
                      )
                    )}
                  </View>
                ) : null}
              </View>
            ) : null}

            <Pressable
              style={[
                styles.selectButton,
                isSelected &&
                  styles.selectedButton,
              ]}
              onPress={() =>
                handleSelectHotel(recommendation)
              }
            >
              <Text style={styles.selectButtonText}>
                {isSelected
                  ? "✓ Hotel Selected"
                  : "Select Hotel"}
              </Text>
            </Pressable>
          </View>
        );
      })}

      {selectedRecommendation ? (
        <View style={styles.selectedSummary}>
          <Text style={styles.selectedSummaryLabel}>
            Your Selected Hotel
          </Text>

          <Text style={styles.selectedSummaryHotel}>
            {getHotelName(
              selectedRecommendation.hotel
            )}
          </Text>

          <Text style={styles.selectedSummaryInfo}>
            Rank #{selectedRecommendation.rank}
          </Text>

          <Text style={styles.selectedSummaryInfo}>
            Activities:{" "}
            {Array.isArray(
              selectedRecommendation.activities
            )
              ? selectedRecommendation.activities.length
              : 0}
          </Text>

          {selectedRecommendation.hotel?.district ? (
            <Text style={styles.selectedSummaryInfo}>
              Location:{" "}
              {safeText(
                selectedRecommendation.hotel.district
              )}
            </Text>
          ) : null}

          <Pressable
            style={styles.continueButton}
            onPress={handleContinue}
          >
            <Text style={styles.continueButtonText}>
              Continue with Selected Hotel
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.selectionNotice}>
          <Text style={styles.selectionNoticeText}>
            Select one of the recommended hotels to
            continue.
          </Text>
        </View>
      )}

      <Pressable
        style={styles.searchAgainButton}
        onPress={() => router.back()}
      >
        <Text style={styles.searchAgainButtonText}>
          Search Again
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f6f7f9",
  },

  contentContainer: {
    padding: 20,
    paddingBottom: 50,
  },

  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#f6f7f9",
  },

  header: {
    marginBottom: 18,
  },

  title: {
    fontSize: 30,
    fontWeight: "700",
    marginBottom: 7,
  },

  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    opacity: 0.7,
  },

  responseCard: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 14,
    marginBottom: 18,
  },

  responseText: {
    fontSize: 15,
    lineHeight: 22,
  },

  preferencesCard: {
    backgroundColor: "#ffffff",
    padding: 18,
    borderRadius: 16,
    marginBottom: 20,
  },

  preferenceText: {
    fontSize: 14,
    lineHeight: 22,
    opacity: 0.75,
  },

  hotelCard: {
    backgroundColor: "#ffffff",
    padding: 20,
    borderRadius: 18,
    marginBottom: 22,
    borderWidth: 2,
    borderColor: "transparent",
  },

  selectedHotelCard: {
    borderColor: "#111111",
  },

  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  rankBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "#eeeeee",
  },

  rankText: {
    fontSize: 14,
    fontWeight: "700",
  },

  selectedBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "#111111",
  },

  selectedBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },

  matchText: {
    fontSize: 13,
    opacity: 0.65,
  },

  hotelName: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 16,
  },

  hotelDetails: {
    marginBottom: 5,
  },

  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },

  detailLabel: {
    fontSize: 14,
    fontWeight: "600",
    opacity: 0.65,
  },

  detailValue: {
    flex: 1,
    fontSize: 14,
    textAlign: "right",
    marginLeft: 14,
  },

  section: {
    marginTop: 20,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },

  activityCard: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#dddddd",
  },

  activityName: {
    fontSize: 16,
    fontWeight: "600",
  },

  activityMeta: {
    fontSize: 13,
    marginTop: 4,
    opacity: 0.7,
  },

  emptyActivities: {
    fontSize: 14,
    opacity: 0.6,
  },

  itineraryTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 5,
  },

  itinerarySummary: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.75,
    marginBottom: 12,
  },

  dayCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#f6f7f9",
    marginBottom: 10,
  },

  dayTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },

  dayActivity: {
    fontSize: 14,
    lineHeight: 20,
  },

  dayNotes: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    opacity: 0.7,
  },

  whySection: {
    marginTop: 16,
  },

  whyTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },

  reasonText: {
    fontSize: 13,
    lineHeight: 20,
    opacity: 0.75,
  },

  selectButton: {
    marginTop: 22,
    backgroundColor: "#111111",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },

  selectedButton: {
    opacity: 0.75,
  },

  selectButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },

  selectedSummary: {
    backgroundColor: "#ffffff",
    padding: 20,
    borderRadius: 18,
    marginBottom: 20,
  },

  selectedSummaryLabel: {
    fontSize: 14,
    fontWeight: "600",
    opacity: 0.6,
  },

  selectedSummaryHotel: {
    fontSize: 23,
    fontWeight: "700",
    marginTop: 6,
    marginBottom: 8,
  },

  selectedSummaryInfo: {
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.7,
  },

  continueButton: {
    marginTop: 18,
    backgroundColor: "#111111",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },

  continueButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },

  selectionNotice: {
    backgroundColor: "#ffffff",
    padding: 18,
    borderRadius: 14,
    marginBottom: 20,
    alignItems: "center",
  },

  selectionNoticeText: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: "center",
  },

  errorTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },

  errorText: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.7,
    textAlign: "center",
    marginBottom: 22,
  },

  primaryButton: {
    backgroundColor: "#111111",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },

  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },

  searchAgainButton: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#111111",
  },

  searchAgainButtonText: {
    color: "#111111",
    fontSize: 15,
    fontWeight: "600",
  },
});