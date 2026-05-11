import React, { useState, useEffect } from "react";
import { View, StyleSheet, ActivityIndicator, Text } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";

export default function MapScreen({ route }) {
  // ResultScreen එකෙන් එවන දත්ත ලබාගැනීම
  const { itineraryData } = route.params || {};
  
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // යූසර්ගෙන් Location Permission ඉල්ලීම
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission to access location was denied');
        setLoading(false);
        return;
      }

      // යූසර් දැනට ඉන්න තැන ලබාගැනීම
      let userLocation = await Location.getCurrentPositionAsync({});
      setLocation(userLocation.coords);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading Map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: location ? location.latitude : 7.2906,
          longitude: location ? location.longitude : 80.6337,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation={true} // යූසර් ඉන්න තැන නිල් පාටින් පෙන්වයි
        showsMyLocationButton={true}
      >
        {/* යූසර් ඉන්න තැනට Marker එකක් */}
        {location && (
          <Marker
            coordinate={{ latitude: location.latitude, longitude: location.longitude }}
            title="You are here"
            pinColor="blue"
          />
        )}

        {/* AI එකෙන් ලැබුණු Route එකේ තැන් මැප් එකේ පෙන්වීම */}
        {itineraryData && itineraryData.optimized_route && itineraryData.optimized_route.map((place, index) => {
           // මෙතනදී අපි උපකල්පනය කරන්නේ backend එකෙන් තැන් වල lat/long එවනවා කියලා.
           // දැනට ඔයාගේ data වල නම විතරක් තියෙන නිසා මේක placeholder එකක් විදිහට තියෙන්න දෙන්න.
           return null; 
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});