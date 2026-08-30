import React, { useEffect, useState } from "react";
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Location from "expo-location";
import LocationPickerMap from "../components/LocationPickerMap";
import { colors } from "../styles/colors";

const CURRENT_LOCATION_TIMEOUT_MS = 8000;

const withTimeout = (promise, timeoutMs) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Current location request timed out.")), timeoutMs);
  promise.then(
    (value) => { clearTimeout(timeout); resolve(value); },
    (error) => { clearTimeout(timeout); reject(error); }
  );
});

export default function LocationPickerScreen({ navigation, route }) {
  const field = route.params?.field === "endLocation" ? "endLocation" : "startLocation";
  const [selected, setSelected] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("Finding your current location...");
  const title = field === "startLocation" ? "Select start location" : "Select end location";

  useEffect(() => {
    let active = true;
    const loadCurrentLocation = async () => {
      try {
        const permission = await withTimeout(
          Location.requestForegroundPermissionsAsync(),
          CURRENT_LOCATION_TIMEOUT_MS
        );
        if (permission.status !== "granted") {
          if (active) setLocationStatus("Location permission unavailable — showing Sri Lanka.");
          return;
        }
        const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 300000, requiredAccuracy: 5000 });
        if (active && lastKnown) {
          setCurrentLocation({ latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude });
          setLocationStatus("Map centered near your current location.");
        }
        const position = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          CURRENT_LOCATION_TIMEOUT_MS
        );
        if (!active) return;
        setCurrentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus("Map centered on your current location.");
      } catch {
        if (active) setLocationStatus("Current location unavailable — showing Sri Lanka.");
      }
    };
    loadCurrentLocation();
    return () => { active = false; };
  }, []);

  const confirm = () => {
    if (!selected) return;
    const latitude = Number(selected.latitude.toFixed(6));
    const longitude = Number(selected.longitude.toFixed(6));
    const label = `Map point ${latitude}, ${longitude}`;
    navigation.navigate("Main", {
      locationSelection: {
        id: Date.now(),
        field,
        value: `geo:${latitude},${longitude}|${label}`,
        displayValue: label,
      },
    });
  };

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Tap anywhere on the map, then confirm the selected point.</Text>
        <Text style={styles.locationStatus}>{locationStatus}</Text>
      </View>
      <View style={styles.map}><LocationPickerMap currentLocation={currentLocation} selected={selected} onSelect={setSelected} /></View>
      <View style={styles.footer}>
        <Text style={styles.coordinates}>{selected ? `${selected.latitude.toFixed(6)}, ${selected.longitude.toFixed(6)}` : "No point selected"}</Text>
        <TouchableOpacity style={[styles.button, !selected && styles.disabled]} onPress={confirm} disabled={!selected}>
          <Text style={styles.buttonText}>Use This Location</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:colors.background},header:{padding:18,backgroundColor:colors.primaryDark},back:{color:colors.turmeric,fontSize:14,fontWeight:"800",marginBottom:10},title:{color:"#F1E9D2",fontSize:23,fontWeight:"800"},subtitle:{color:colors.backgroundDeep,fontSize:12,marginTop:5},locationStatus:{color:colors.turmeric,fontSize:11,fontWeight:"700",marginTop:7},map:{flex:1,minHeight:360},footer:{padding:16,backgroundColor:colors.card,borderTopWidth:1,borderTopColor:colors.border},coordinates:{color:colors.muted,textAlign:"center",marginBottom:10},button:{height:52,borderRadius:14,backgroundColor:colors.primary,alignItems:"center",justifyContent:"center"},disabled:{opacity:.45},buttonText:{color:"#F1E9D2",fontWeight:"900",fontSize:15},
});
