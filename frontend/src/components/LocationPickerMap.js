import React from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

const SRI_LANKA = { latitude: 7.8731, longitude: 80.7718 };

export default function LocationPickerMap({ selected, onSelect }) {
  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFillObject}
      initialRegion={{ ...SRI_LANKA, latitudeDelta: 3.5, longitudeDelta: 3.5 }}
      onPress={(event) => onSelect(event.nativeEvent.coordinate)}
    >
      {selected ? <Marker coordinate={selected} title="Selected location" /> : null}
    </MapView>
  );
}
