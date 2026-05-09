import { ScrollView, View, Text, StyleSheet } from "react-native";
import TourismPostCard from "../components/TourismPostCard";
import tourismColors from "../theme/tourismColors";

export default function TourismResultScreen({ route }) {
  const { prompt, packageData } = route.params || {};

  const selectedPackage = packageData?.selectedPackage;

  const hotelItem = {
    title: selectedPackage?.hotelName || "Hotel not found",
    subtitle: `${selectedPackage?.hotelCategory || "Hotel"} • ${
      selectedPackage?.district || "Unknown District"
    }`,
    description: `Grade: ${selectedPackage?.grade || "N/A"}\nFood Type: ${
      selectedPackage?.foodType || "N/A"
    }\nRooms: ${selectedPackage?.rooms?.low || "N/A"}`,
    image: selectedPackage?.hotelImage || null,
    tags: [
      selectedPackage?.grade || "N/A",
      selectedPackage?.foodType || "N/A",
      selectedPackage?.district || "N/A",
    ],
  };

  const activities = selectedPackage?.activities || [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Generated Travel Package</Text>

      <View style={styles.promptBox}>
        <Text style={styles.promptTitle}>Your Request</Text>
        <Text style={styles.prompt}>{prompt}</Text>
      </View>

      <Text style={styles.sectionTitle}>Recommended Hotel</Text>
      <TourismPostCard item={hotelItem} type="hotel" />

      <Text style={styles.sectionTitle}>Recommended Activities</Text>

      {activities.length > 0 ? (
        activities.map((activity, index) => {
          const activityItem = {
            title: activity.name || "Activity",
            subtitle: `${activity.category || "Activity"} • ${
              activity.durationHours?.low || "N/A"
            } Hours`,
            description: activity.description || "No description available.",
            image: activity.image || null,
            tags: [
              activity.category || "N/A",
              activity.priceLevel || "N/A",
              activity.suitableFor || "N/A",
            ],
          };

          return (
            <TourismPostCard
              key={activity.activityId || index}
              item={activityItem}
              type="activity"
            />
          );
        })
      ) : (
        <Text style={styles.emptyText}>No activities found.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tourismColors.background,
  },
  content: {
    padding: 18,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 28,
    fontWeight: "900",
    color: tourismColors.primary,
    marginBottom: 18,
  },
  promptBox: {
    backgroundColor: tourismColors.primaryLight,
    padding: 18,
    borderRadius: 18,
    marginBottom: 22,
  },
  promptTitle: {
    fontWeight: "800",
    color: tourismColors.primary,
    marginBottom: 8,
  },
  prompt: {
    color: tourismColors.textDark,
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: tourismColors.textDark,
    marginBottom: 14,
    marginTop: 10,
  },
  emptyText: {
    color: tourismColors.textLight,
    fontSize: 15,
  },
});