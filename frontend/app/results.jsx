import {
  ScrollView,
  Text,
  View,
  StyleSheet,
} from "react-native";

import { useLocalSearchParams } from "expo-router";

import TourismCard from "../components/tourism/TourismCard";

import tourismColors from "../constants/tourism/tourismColors";

export default function Results() {
  const { packageData, prompt } =
    useLocalSearchParams();

  const parsedData = JSON.parse(packageData);

  const selectedPackage =
    parsedData?.selectedPackage;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>
        Generated Travel Package
      </Text>

      <View style={styles.promptBox}>
        <Text style={styles.promptTitle}>
          Your Prompt
        </Text>

        <Text style={styles.prompt}>
          {prompt}
        </Text>
      </View>

      <Text style={styles.section}>
        Recommended Hotel
      </Text>

      <TourismCard
        type="hotel"
        title={selectedPackage.hotelName}
        subtitle={`${selectedPackage.hotelCategory} • ${selectedPackage.district}`}
        description={`Grade: ${selectedPackage.grade}\nFood Type: ${selectedPackage.foodType}`}
        tags={[
          selectedPackage.grade,
          selectedPackage.foodType,
          selectedPackage.district,
        ]}
      />

      <Text style={styles.section}>
        Activities
      </Text>

      {selectedPackage.activities.map(
        (activity, index) => (
          <TourismCard
            key={index}
            type="activity"
            title={activity.name}
            subtitle={`${activity.category} • ${activity.durationHours.low} Hours`}
            description={activity.description}
            tags={[
              activity.category,
              activity.priceLevel,
              activity.suitableFor,
            ]}
          />
        )
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tourismColors.background,
    padding: 18,
  },

  heading: {
    fontSize: 28,
    fontWeight: "900",
    color: tourismColors.primary,
    marginBottom: 18,
  },

  promptBox: {
    backgroundColor:
      tourismColors.primaryLight,

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
    lineHeight: 22,
    color: tourismColors.textDark,
  },

  section: {
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 14,
    marginTop: 10,
    color: tourismColors.textDark,
  },
});