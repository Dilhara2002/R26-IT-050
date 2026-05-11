import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert } from "react-native";
import * as Location from "expo-location";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import API from "../services/api";

export default function HomeScreen({ navigation }) {
  const [preferences, setPreferences] = useState([]);
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  
  // Default Location (Kandy) until GPS loads or user selects a point
  const [lat, setLat] = useState(7.2906);
  const [lon, setLon] = useState(80.6337);
  
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(true);

  // Updated to match your exact dataset tags
  const availablePreferences = ["History", "Nature", "Wildlife", "Culture", "Adventure", "City", "Beach", "Religion"];

  // Auto-fetch location on load, but allow user to override it on the map
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Notice", "Location permission denied. You can manually select your location on the map.");
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
      setPreferences(preferences.filter(p => p !== item));
    } else {
      setPreferences([...preferences, item]);
    }
  };

  // Function to handle when the user taps on the map
  const handleMapPress = (e) => {
    setLat(e.nativeEvent.coordinate.latitude);
    setLon(e.nativeEvent.coordinate.longitude);
  };

  const optimize = async () => {
    if (preferences.length === 0) {
      Alert.alert("Error", "Please select at least one preference.");
      return;
    }
    if (!hours && !minutes) {
      Alert.alert("Error", "Please enter your available time.");
      return;
    }

    const totalMinutes = (parseInt(hours || 0) * 60) + parseInt(minutes || 0);
    setLoading(true);

    try {
      const res = await API.post("/optimize-itinerary", {
        preferences: preferences,
        max_time_minutes: totalMinutes,
        current_lat: parseFloat(lat),
        current_lon: parseFloat(lon)
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
      Alert.alert("Connection Error", "Cannot connect to the AI Server. Check your IP and Wi-Fi.");
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Smart Travel Planner ✨</Text>
      
      {/* Interactive Map for Location Selection */}
      <Text style={styles.label}>Tap to select your starting point:</Text>
      <View style={styles.mapContainer}>
        {locationLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={{ marginTop: 10 }}>Loading map...</Text>
          </View>
        ) : (
          <MapView
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={{
              latitude: lat,
              longitude: lon,
              latitudeDelta: 0.1,
              longitudeDelta: 0.1,
            }}
            onPress={handleMapPress}
          >
            <Marker coordinate={{ latitude: lat, longitude: lon }} title="Start Location" pinColor="red" />
          </MapView>
        )}
      </View>
      <Text style={styles.coordsText}>📍 Selected: {lat.toFixed(4)}, {lon.toFixed(4)}</Text>

      <Text style={styles.label}>Select Your Interests:</Text>
      <View style={styles.prefContainer}>
        {availablePreferences.map(item => (
          <TouchableOpacity 
            key={item} 
            style={[styles.prefButton, preferences.includes(item) && styles.prefSelected]}
            onPress={() => togglePreference(item)}
          >
            <Text style={{ color: preferences.includes(item) ? "#fff" : "#000" }}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>How much time do you have?</Text>
      <View style={styles.timeInputRow}>
        <TextInput 
          placeholder="Hours" 
          placeholderTextColor="#888"
          value={hours} 
          onChangeText={setHours} 
          keyboardType="numeric" 
          style={styles.input} 
        />
        <TextInput 
          placeholder="Minutes" 
          placeholderTextColor="#888"
          value={minutes} 
          onChangeText={setMinutes} 
          keyboardType="numeric" 
          style={styles.input} 
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#28a745" style={{ marginTop: 30, marginBottom: 40 }} />
      ) : (
        <TouchableOpacity style={styles.generateBtn} onPress={optimize}>
          <Text style={styles.btnText}>Generate Itinerary 🚀</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#f9f9f9" },
  title: { fontSize: 26, fontWeight: "bold", marginBottom: 15, textAlign: 'center', color: '#333' },
  label: { fontSize: 16, fontWeight: "600", marginTop: 10, marginBottom: 10, color: '#333' },
  mapContainer: { height: 200, width: '100%', borderRadius: 10, overflow: 'hidden', borderColor: '#ddd', borderWidth: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#eee' },
  coordsText: { color: "#555", fontSize: 14, marginTop: 5, textAlign: 'center', marginBottom: 10 },
  prefContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  prefButton: { padding: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 20, marginRight: 10, marginBottom: 10 },
  prefSelected: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  timeInputRow: { flexDirection: 'row', justifyContent: 'space-between' },
  // Fixed input text color and placeholder alignment
  input: { borderBottomWidth: 1, borderColor: '#ccc', width: '45%', padding: 10, fontSize: 18, color: '#000' },
  generateBtn: { backgroundColor: "#28a745", padding: 15, borderRadius: 10, marginTop: 30, alignItems: 'center', marginBottom: 40 },
  btnText: { color: "#fff", fontSize: 18, fontWeight: "bold" }
});