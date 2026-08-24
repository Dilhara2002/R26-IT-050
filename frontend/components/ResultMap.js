import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker, PROVIDER_GOOGLE } from 'react-native-maps';

export default function ResultMap({ startingLocation, optimizedStops = [] }) {
  const mapRef = useRef(null);
  const startCoordinate = useMemo(() => ({
    latitude: Number(startingLocation?.lat ?? 7.2906),
    longitude: Number(startingLocation?.lon ?? 80.6337),
  }), [startingLocation]);
  const stopCoordinates = useMemo(
    () => optimizedStops
      .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude))
      .map((stop) => ({ latitude: stop.latitude, longitude: stop.longitude })),
    [optimizedStops]
  );

  useEffect(() => {
    const coordinates = [startCoordinate, ...stopCoordinates];
    if (mapRef.current && coordinates.length > 1) {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 140, right: 50, bottom: 80, left: 50 },
        animated: true,
      });
    }
  }, [startCoordinate, stopCoordinates]);

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFillObject}
      initialRegion={{
        ...startCoordinate,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }}
    >
      <Marker coordinate={startCoordinate} title="Starting location" pinColor="#1C2A44" />
      {optimizedStops.map((stop) => (
        <Marker
          key={stop.place_id ?? `${stop.latitude}-${stop.longitude}`}
          coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
        >
          <View style={styles.stopMarker}>
            <Text style={styles.stopMarkerText}>{stop.sequence}</Text>
          </View>
          <Callout>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>{stop.name}</Text>
              <Text>{stop.duration_minutes} minutes</Text>
            </View>
          </Callout>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  stopMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#DC2626',
    borderColor: '#FFFFFF',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopMarkerText: { color: '#FFFFFF', fontWeight: '900' },
  callout: { width: 180, padding: 6 },
  calloutTitle: { fontWeight: '800', marginBottom: 4 },
});
