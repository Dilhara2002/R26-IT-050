import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
} from "react-native";

import { colors } from "../styles/colors";
import { searchSriLankanLocations } from "../api/locationApi";

const vehicleCategories = [
  "All",
  "Economy",
  "Sedan",
  "SUV",
  "Van",
  "MUV",
  "Luxury",
];

export default function TripInputScreen({
  form,
  setForm,
  loading,
  onSubmit,
  onBack,
}) {
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [endSuggestions, setEndSuggestions] = useState([]);

  const selectedCategory = form.preferredVehicle || "All";

  const updateField = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleLocationSearch = async (type, value) => {
    updateField(type, value);

    try {
      const suggestions = await searchSriLankanLocations(value);

      if (type === "startLocation") {
        setStartSuggestions(suggestions);
      } else {
        setEndSuggestions(suggestions);
      }
    } catch (error) {
      console.log("Location search error:", error.message);
    }
  };

  const selectLocation = (type, location) => {
    updateField(type, location.name);

    if (type === "startLocation") setStartSuggestions([]);
    else setEndSuggestions([]);
  };

  const handleCategorySelect = (category) => {
    updateField("preferredVehicle", category === "All" ? "" : category);
  };

  const renderSuggestion = (type, item) => (
    <TouchableOpacity
      style={styles.suggestionItem}
      onPress={() => selectLocation(type, item)}
    >
      <Text style={styles.suggestionText}>{item.displayName}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>

      {/* HEADER */}
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>🚗</Text>
        <Text style={styles.title}>Vehicle Recommendation</Text>
        <Text style={styles.subtitle}>
          Enter your trip details to get smart vehicle suggestions.
        </Text>
      </View>

      {/* FORM CARD */}
      <View style={styles.card}>

        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        {/* BUDGET (LKR) */}
        <Text style={styles.label}>Budget (LKR)</Text>

        <View style={styles.currencyInputContainer}>
          <Text style={styles.currencySymbol}>₨</Text>

          <TextInput
            style={styles.currencyInput}
            value={form.budget}
            onChangeText={(value) =>
              updateField("budget", value.replace(/[^0-9]/g, ""))
            }
            keyboardType="numeric"
            placeholder="Enter amount"
            placeholderTextColor="#94A3B8"
          />
        </View>

        <Text style={styles.label}>Passengers</Text>
        <TextInput
          style={styles.input}
          value={form.passengers}
          onChangeText={(value) => updateField("passengers", value)}
          keyboardType="numeric"
          placeholder="Number of passengers"
          placeholderTextColor="#94A3B8"
        />

        <Text style={styles.label}>Start Location</Text>
        <TextInput
          style={styles.input}
          value={form.startLocation}
          onChangeText={(value) =>
            handleLocationSearch("startLocation", value)
          }
          placeholder="Example: Colombo"
          placeholderTextColor="#94A3B8"
        />

        {startSuggestions.length > 0 && (
          <View style={styles.suggestionBox}>
            <FlatList
              data={startSuggestions}
              keyExtractor={(item, index) =>
                `${item.displayName}-${index}`
              }
              renderItem={({ item }) =>
                renderSuggestion("startLocation", item)
              }
              scrollEnabled={false}
            />
          </View>
        )}

        <Text style={styles.label}>End Location</Text>
        <TextInput
          style={styles.input}
          value={form.endLocation}
          onChangeText={(value) =>
            handleLocationSearch("endLocation", value)
          }
          placeholder="Example: Kandy"
          placeholderTextColor="#94A3B8"
        />

        {endSuggestions.length > 0 && (
          <View style={styles.suggestionBox}>
            <FlatList
              data={endSuggestions}
              keyExtractor={(item, index) =>
                `${item.displayName}-${index}`
              }
              renderItem={({ item }) =>
                renderSuggestion("endLocation", item)
              }
              scrollEnabled={false}
            />
          </View>
        )}

        <Text style={styles.label}>Vehicle Category</Text>

        <View style={styles.categoryContainer}>
          {vehicleCategories.map((category) => {
            const isActive = selectedCategory === category;

            return (
              <TouchableOpacity
                key={category}
                style={[
                  styles.categoryButton,
                  isActive && styles.categoryButtonActive,
                ]}
                onPress={() => handleCategorySelect(category)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    isActive && styles.categoryTextActive,
                  ]}
                >
                  {category}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[
            styles.button,
            loading && styles.buttonDisabled,
          ]}
          onPress={onSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Analyzing..." : "Find Best Vehicle"}
          </Text>
        </TouchableOpacity>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#EAF2FF",
  },
  content: {
    padding: 18,
    paddingBottom: 40,
  },

  hero: {
    backgroundColor: "#1D4ED8",
    borderRadius: 26,
    padding: 22,
    marginBottom: 18,
    alignItems: "center",
  },
  heroIcon: {
    fontSize: 50,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
  },
  subtitle: {
    color: "#DBEAFE",
    textAlign: "center",
    marginTop: 8,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    elevation: 4,
  },

  backText: {
    color: "#1D4ED8",
    fontWeight: "700",
    marginBottom: 12,
  },

  label: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 6,
    color: "#0F172A",
  },

  currencyInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    paddingHorizontal: 12,
  },

  currencySymbol: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginRight: 6,
  },

  currencyInput: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    color: "#0F172A",
  },

  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 13,
    fontSize: 15,
    color: "#0F172A",
  },

  suggestionBox: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    marginTop: 6,
    overflow: "hidden",
  },

  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },

  suggestionText: {
    fontSize: 14,
    color: "#0F172A",
  },

  categoryContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },

  categoryButton: {
    backgroundColor: "#F1F5F9",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
  },

  categoryButtonActive: {
    backgroundColor: "#2563EB",
  },

  categoryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },

  categoryTextActive: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  button: {
    backgroundColor: "#2563EB",
    padding: 16,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 22,
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
});