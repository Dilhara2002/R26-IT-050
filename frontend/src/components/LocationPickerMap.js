import React, { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

const SRI_LANKA = { latitude: 7.8731, longitude: 80.7718 };

export default function LocationPickerMap({ currentLocation, selected, onSelect }) {
  const mapRef = useRef(null);
  useEffect(() => {
    if (!currentLocation || !mapRef.current) return;
    mapRef.current.animateToRegion({ ...currentLocation, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 500);
  }, [currentLocation]);
  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFillObject}
      initialRegion={{ ...SRI_LANKA, latitudeDelta: 3.5, longitudeDelta: 3.5 }}
      onPress={(event) => onSelect(event.nativeEvent.coordinate)}
    >
      {currentLocation ? <Marker coordinate={currentLocation} title="Your current location" pinColor="#1D4ED8" /> : null}
      {selected ? <Marker coordinate={selected} title="Selected location" /> : null}
    </MapView>
  );
}
