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
  hotelContext,
}) {
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [endSuggestions, setEndSuggestions] = useState([]);

  const selectedCategory = form.preferredCategory || "All";

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
    updateField("preferredCategory", category === "All" ? "" : category);
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.hero}>
        <Text style={styles.heroBadge}>✦ AI SAFE JOURNEY PLANNER</Text>
        <Text style={styles.title}>Plan a safer journey</Text>
        <Text style={styles.subtitle}>
          Add your route and travel needs to receive a safer vehicle recommendation.
        </Text>
      </View>

      {hotelContext && (
        <View style={styles.hotelBridge}>
          <View style={styles.hotelBridgeIcon}><Text style={styles.hotelBridgeEmoji}>🏨</Text></View>
          <View style={styles.hotelBridgeCopy}>
            <Text style={styles.hotelBridgeLabel}>ISHAN SAFE JOURNEY ANALYSIS</Text>
            <Text style={styles.hotelBridgeTitle}>{hotelContext.selectedHotel?.hotel?.name || "Selected hotel"}</Text>
            <Text style={styles.hotelBridgeText}>Route and passenger details were received from your hotel plan. The recommended vehicle cost will be added to the selected hotel price.</Text>
          </View>
        </View>
      )}

      {!hotelContext && <>
        <Text style={styles.label}>Budget</Text>
        <TextInput
          style={styles.input}
          value={form.budget}
          onChangeText={(value) => updateField("budget", value)}
          keyboardType="numeric"
          placeholder="Enter your budget"
          placeholderTextColor={colors.muted}
        />
      </>}

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

      {hotelContext ? (
        <>
          <Text style={styles.label}>Destination Hotel</Text>
          <View style={styles.lockedDestination}>
            <Text style={styles.lockedDestinationIcon}>🏨</Text>
            <View style={styles.lockedDestinationCopy}>
              <Text style={styles.lockedDestinationName}>
                {hotelContext.selectedHotel?.hotel?.name || "Selected hotel"}
              </Text>
              <Text style={styles.lockedDestinationAddress}>
                {[hotelContext.selectedHotel?.hotel?.district, "Sri Lanka"]
                  .filter(Boolean)
                  .join(", ")}
              </Text>
              <Text style={styles.lockedDestinationNote}>
                Automatically selected from your hotel plan
              </Text>
            </View>
            <Text style={styles.lockedDestinationBadge}>LOCKED</Text>
          </View>
        </>
      ) : (
        <>
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
        </>
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
          {loading
            ? "Analyzing..."
            : hotelContext
              ? "Analyze Hotel Route & Recommend Vehicle"
              : "Recommend Vehicle"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  contentContainer: {
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 48,
  },
  backText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    lineHeight: 39,
    fontWeight: "600",
    fontFamily: "serif",
    color: "#FFFFFF",
    marginTop: 13,
  },
  subtitle: {
    fontSize: 15,
    color: "#E7DBBA",
    marginTop: 8,
    lineHeight: 22,
  },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: 26,
    padding: 25,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(216,154,31,0.42)",
  },
  heroBadge: {
    alignSelf: "flex-start",
    color: "#D89A1F",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  hotelBridge:{flexDirection:"row",gap:12,backgroundColor:colors.card,borderWidth:1,borderColor:colors.primary,borderRadius:18,padding:15,marginBottom:8},
  hotelBridgeIcon:{width:44,height:44,borderRadius:14,backgroundColor:colors.backgroundDeep,alignItems:"center",justifyContent:"center"},
  hotelBridgeEmoji:{fontSize:21},
  hotelBridgeCopy:{flex:1},
  hotelBridgeLabel:{color:colors.cinnamon,fontSize:9,fontWeight:"900",letterSpacing:1},
  hotelBridgeTitle:{color:colors.text,fontSize:16,fontFamily:"serif",fontWeight:"600",marginTop:3},
  hotelBridgeText:{color:colors.muted,fontSize:11,lineHeight:17,marginTop:4},
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.cinnamon,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 14,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 15,
    fontSize: 16,
    color: colors.text,
    shadowColor: "#241F18",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  lockedDestination: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 16,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  lockedDestinationIcon: {
    fontSize: 24,
  },
  lockedDestinationCopy: {
    flex: 1,
  },
  lockedDestinationName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  lockedDestinationAddress: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  lockedDestinationNote: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 5,
  },
  lockedDestinationBadge: {
    color: colors.primary,
    backgroundColor: colors.backgroundDeep,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
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
    borderRadius: 18,
    alignItems: "center",
    marginTop: 28,
    marginBottom: 0,
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
