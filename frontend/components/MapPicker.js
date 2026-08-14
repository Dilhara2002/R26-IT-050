import React from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

export default function MapPicker({ lat, lon, onSelect }) {
  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFillObject}
      initialRegion={{
        latitude: lat,
        longitude: lon,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      }}
      onPress={(e) => onSelect(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
    >
      <Marker coordinate={{ latitude: lat, longitude: lon }} title="Start Location" pinColor="red" />
    </MapView>
  );
}