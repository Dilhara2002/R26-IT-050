import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
} from "react-native";
import * as Location from "expo-location";
import API from "../services/api";

// Auto-resolves to MapPicker.js on Mobile, and MapPicker.web.js on Web
import MapPicker from "../components/MapPicker";

export default function HomeScreen({ navigation }) {
  const [preferences, setPreferences] = useState([]);
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");

  const [lat, setLat] = useState(7.2906);
  const [lon, setLon] = useState(80.6337);

  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(true);

  const availablePreferences = [
    "History",
    "Nature",
    "Wildlife",
    "Culture",
    "Adventure",
    "City",
    "Beach",
    "Religion",
  ];

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Notice",
          "Location permission denied. You can manually select your location on the map."
        );
        setLocationLoading(false);
        return;
      }

      try {
        let userLocation = await Location.getCurrentPositionAsync({});
        setLat(userLocation.coords.latitude);
        setLon(userLocation.coords.longitude);
      } catch (error) {
        console.log("Could not detect GPS automatically.");
      } finally {
        setLocationLoading(false);
      }
    })();
  }, []);

  const togglePreference = (item) => {
    if (preferences.includes(item)) {
      setPreferences(preferences.filter((p) => p !== item));
    } else {
      setPreferences([...preferences, item]);
    }
  };

  const handleGenerate = async () => {
    if (preferences.length === 0) {
      Alert.alert("Error", "Please select at least one preference.");
      return;
    }
    if (!hours && !minutes) {
      Alert.alert("Error", "Please enter your available time.");
      return;
    }

    const totalMinutes = parseInt(hours || 0) * 60 + parseInt(minutes || 0);
    setLoading(true);

    try {
      const res = await API.post("/optimize-itinerary", {
        preferences: preferences,
        max_time_minutes: totalMinutes,
        current_lat: parseFloat(lat),
        current_lon: parseFloat(lon),
      });

      setLoading(false);

      if (res.data.status === "success") {
        navigation.navigate("Result", { data: res.data.data });
      } else {
        Alert.alert("Try Again", res.data.message || "No suitable route found.");
      }
    } catch (err) {
      setLoading(false);
      console.log(err);
      Alert.alert(
        "Connection Error",
        "Cannot connect to the Server. Check your IP and Wi-Fi."
      );
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.aiBadge}>✦ Smart Optimization</Text>
        <Text style={styles.title}>Dynamic Trip Planner</Text>
        <Text style={styles.subtitle}>
          Generate context-aware travel routes. Select your starting
          point, interests, and time limit to optimize your journey.
        </Text>
      </View>

      <View style={styles.assistantCard}>
        <View style={styles.assistantHeader}>
          <View style={styles.botCircle}>
            <Text style={styles.botIcon}>📍</Text>
          </View>
          <View>
            <Text style={styles.cardTitle}>Dynamic Routing Engine</Text>
            <Text style={styles.cardSub}>Smart Path Optimization</Text>
          </View>
        </View>

        {/* Map Selection Section */}
        <Text style={styles.sectionTitle}>1. Set Start Location</Text>
        <View style={styles.mapContainer}>
          {locationLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={styles.loadingTextSmall}>Detecting Location...</Text>
            </View>
          ) : (
            <MapPicker
              lat={lat}
              lon={lon}
              onSelect={(newLat, newLon) => {
                setLat(newLat);
                setLon(newLon);
              }}
            />
          )}
        </View>
        <Text style={styles.coordsText}>
          Selected: {lat.toFixed(4)}, {lon.toFixed(4)}
        </Text>

        {/* Preferences Section */}
        <Text style={styles.sectionTitle}>2. Select Your Interests</Text>
        <View style={styles.chips}>
          {availablePreferences.map((item) => {
            const isActive = preferences.includes(item);
            return (
              <Pressable
                key={item}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => togglePreference(item)}
              >
                <Text
                  style={[styles.chipText, isActive && styles.chipTextActive]}
                >
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Time Constraint Section */}
        <Text style={styles.sectionTitle}>3. Time Constraint</Text>
        <View style={styles.timeInputRow}>
          <TextInput
            placeholder="Hours"
            placeholderTextColor="#94A3B8"
            value={hours}
            onChangeText={setHours}
            keyboardType="numeric"
            style={styles.timeInput}
          />
          <TextInput
            placeholder="Minutes"
            placeholderTextColor="#94A3B8"
            value={minutes}
            onChangeText={setMinutes}
            keyboardType="numeric"
            style={styles.timeInput}
          />
        </View>

        {/* Generate Button */}
        {loading ? (
          <View style={styles.loadingBoxMain}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>
              Optimizing Route & Fetching Locations...
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={handleGenerate}
            style={({ pressed }) => [
              styles.generateButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.generateText}>Generate Route</Text>
            <Text style={styles.generateIcon}>🚀</Text>
          </Pressable>
        )}
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
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
  },
  hero: {
    backgroundColor: "#1D4ED8",
    borderRadius: 28,
    padding: 26,
    marginBottom: 18,
  },
  aiBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.18)",
    color: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    fontWeight: "800",
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  subtitle: {
    color: "#DBEAFE",
    lineHeight: 23,
    fontSize: 15,
  },
  assistantCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 20,
    elevation: 6,
    marginBottom: 20,
  },
  assistantHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 25,
  },
  botCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#DBEAFE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  botIcon: {
    fontSize: 25,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
  },
  cardSub: {
    color: "#64748B",
    marginTop: 3,
  },
  sectionTitle: {
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 12,
    fontSize: 15,
    marginTop: 5,
  },
  mapContainer: {
    height: 250,
    width: "100%",
    borderRadius: 18,
    overflow: "hidden",
    borderColor: "#BFDBFE",
    borderWidth: 1,
    marginBottom: 6,
  },
  coordsText: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "right",
    marginBottom: 18,
    fontWeight: "600",
  },
  loadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
  },
  loadingTextSmall: {
    marginTop: 8,
    color: "#2563EB",
    fontWeight: "600",
    fontSize: 12,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 22,
  },
  chip: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  chipActive: {
    backgroundColor: "#2563EB",
    borderColor: "#1D4ED8",
  },
  chipText: {
    color: "#1D4ED8",
    fontWeight: "700",
    fontSize: 13,
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  timeInputRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 25,
  },
  timeInput: {
    flex: 1,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 16,
    padding: 15,
    fontSize: 16,
    color: "#0F172A",
    fontWeight: "600",
  },
  generateButton: {
    backgroundColor: "#2563EB",
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 10,
  },
  generateText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  generateIcon: {
    color: "#FFFFFF",
    fontSize: 18,
    marginLeft: 8,
  },
  pressed: {
    opacity: 0.75,
  },
  loadingBoxMain: {
    alignItems: "center",
    paddingVertical: 20,
    marginTop: 10,
  },
  loadingText: {
    marginTop: 12,
    color: "#64748B",
    fontWeight: "600",
  },
});