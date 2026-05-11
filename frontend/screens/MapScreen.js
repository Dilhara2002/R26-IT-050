import React, { useState, useEffect } from "react";
import { View, StyleSheet, ActivityIndicator, Text, Pressable } from "react-native";
import * as Location from "expo-location";

// Auto-resolves to ResultMap.js on Mobile, and ResultMap.web.js on Web
import ResultMap from "../components/ResultMap";

export default function MapScreen({ route, navigation }) {
  const { itineraryData } = route.params || {};
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoading(false);
        return;
      }
      let userLocation = await Location.getCurrentPositionAsync({});
      setLocation(userLocation.coords);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.loadingText}>Loading Interactive Map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ResultMap location={location} itineraryData={itineraryData} />
      
      <View style={styles.floatingCard}>
        <Text style={styles.cardTitle}>Live Route View</Text>
        <Text style={styles.cardSub}>Optimized for your current context</Text>
        
        <Pressable 
          onPress={() => navigation.goBack()} 
          style={styles.backBtn}
        >
          <Text style={styles.backBtnText}>Back to List</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EAF2FF' },
  loadingText: { marginTop: 10, color: '#1D4ED8', fontWeight: 'bold' },
  floatingCard: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center', // <--- Centers it perfectly on web
    width: '90%',
    maxWidth: 400, // <--- Stops it from stretching across the screen
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  cardTitle: { fontSize: 18, fontWeight: "900", color: "#0F172A" },
  cardSub: { color: "#64748B", fontSize: 13, marginTop: 2 },
  backBtn: {
    marginTop: 15,
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  backBtnText: { color: '#1D4ED8', fontWeight: 'bold' }
});