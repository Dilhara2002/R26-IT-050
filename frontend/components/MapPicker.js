import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

export default function MapPicker({ lat, lon, hasSelection = false, onSelect, onReady }) {
  const mapRef = useRef(null);
  const mapReadyRef = useRef(false);

  useEffect(() => {
    if (!mapReadyRef.current || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: lat,
        longitude: lon,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      },
      250
    );
  }, [lat, lon]);

  const handleMapReady = () => {
    mapReadyRef.current = true;
    onReady?.();
  };

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFillObject}
      initialRegion={{
        latitude: lat,
        longitude: lon,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      }}
      onMapReady={handleMapReady}
      onPress={(e) => onSelect(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
    >
      {hasSelection ? (
        <Marker coordinate={{ latitude: lat, longitude: lon }} title="Selected start location" pinColor="red" />
      ) : null}
    </MapView>
  );
}
