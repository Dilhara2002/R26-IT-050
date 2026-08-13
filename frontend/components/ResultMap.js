import React from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

export default function ResultMap({ location, itineraryData }) {
  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFillObject}
      initialRegion={{
        latitude: location ? location.latitude : 7.2906,
        longitude: location ? location.longitude : 80.6337,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }}
      showsUserLocation={true}
      showsMyLocationButton={true}
    >
      {location && (
        <Marker coordinate={{ latitude: location.latitude, longitude: location.longitude }} title="You are here" pinColor="blue" />
      )}
    </MapView>
  );
}