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

    if (type === "startLocation") {
      setStartSuggestions([]);
    } else {
      setEndSuggestions([]);
    }
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
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Trip Details</Text>
      <Text style={styles.subtitle}>
        Enter your route and travel requirements.
      </Text>

      <Text style={styles.label}>Budget</Text>
      <TextInput
        style={styles.input}
        value={form.budget}
        onChangeText={(value) => updateField("budget", value)}
        keyboardType="numeric"
        placeholder="Enter your budget"
        placeholderTextColor={colors.muted}
      />

      <Text style={styles.label}>Passengers</Text>
      <TextInput
        style={styles.input}
        value={form.passengers}
        onChangeText={(value) => updateField("passengers", value)}
        keyboardType="numeric"
        placeholder="Number of passengers"
        placeholderTextColor={colors.muted}
      />

      <Text style={styles.label}>Start Location</Text>
      <TextInput
        style={styles.input}
        value={form.startLocation}
        onChangeText={(value) => handleLocationSearch("startLocation", value)}
        placeholder="Example: Colombo"
        placeholderTextColor={colors.muted}
      />

      {startSuggestions.length > 0 && (
        <View style={styles.suggestionBox}>
          <FlatList
            data={startSuggestions}
            keyExtractor={(item, index) => `${item.displayName}-${index}`}
            renderItem={({ item }) => renderSuggestion("startLocation", item)}
            scrollEnabled={false}
          />
        </View>
      )}

      <Text style={styles.label}>End Location</Text>
      <TextInput
        style={styles.input}
        value={form.endLocation}
        onChangeText={(value) => handleLocationSearch("endLocation", value)}
        placeholder="Example: Kandy"
        placeholderTextColor={colors.muted}
      />

      {endSuggestions.length > 0 && (
        <View style={styles.suggestionBox}>
          <FlatList
            data={endSuggestions}
            keyExtractor={(item, index) => `${item.displayName}-${index}`}
            renderItem={({ item }) => renderSuggestion("endLocation", item)}
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
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Analyzing..." : "Recommend Vehicle"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: 20,
    flex: 1,
  },
  backText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: "bold",
    color: colors.primaryDark,
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    marginTop: 6,
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
    marginTop: 14,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    color: colors.text,
  },
  suggestionBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    marginTop: 6,
    overflow: "hidden",
  },
  suggestionItem: {
    padding: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionText: {
    fontSize: 14,
    color: colors.text,
  },
  categoryContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  categoryButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  categoryButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  categoryTextActive: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  button: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 28,
    marginBottom: 40,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "bold",
  },
});