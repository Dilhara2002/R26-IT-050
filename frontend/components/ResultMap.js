import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

const DEFAULT_CENTER = { latitude: 7.2906, longitude: 80.6337 };

export default function ResultMap({ startingLocation, optimizedStops = [] }) {
  const mapRef = useRef(null);
  const startCoordinate = useMemo(() => {
    const latitude = Number(startingLocation?.lat);
    const longitude = Number(startingLocation?.lon);
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude }
      : null;
  }, [startingLocation]);
  const validStops = useMemo(
    () =>
      (Array.isArray(optimizedStops) ? optimizedStops : [])
        .filter(
          (stop) =>
            Number.isFinite(Number(stop?.latitude)) &&
            Number.isFinite(Number(stop?.longitude))
        )
        .map((stop, index) => ({
          ...stop,
          sequence: Number.isFinite(Number(stop.sequence)) ? Number(stop.sequence) : index + 1,
          latitude: Number(stop.latitude),
          longitude: Number(stop.longitude),
        })),
    [optimizedStops]
  );
  const routeCoordinates = useMemo(
    () => [
      ...(startCoordinate ? [startCoordinate] : []),
      ...validStops.map(({ latitude, longitude }) => ({ latitude, longitude })),
    ],
    [startCoordinate, validStops]
  );
  const initialCenter = startCoordinate || routeCoordinates[0] || DEFAULT_CENTER;

  useEffect(() => {
    if (!mapRef.current || routeCoordinates.length === 0) return;
    if (routeCoordinates.length === 1) {
      mapRef.current.animateToRegion(
        { ...routeCoordinates[0], latitudeDelta: 0.05, longitudeDelta: 0.05 },
        300
      );
      return;
    }
    mapRef.current.fitToCoordinates(routeCoordinates, {
      edgePadding: { top: 190, right: 50, bottom: 80, left: 50 },
      animated: true,
    });
  }, [routeCoordinates]);

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFillObject}
      initialRegion={{
        ...initialCenter,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }}
    >
      {routeCoordinates.length > 1 ? (
        <Polyline coordinates={routeCoordinates} strokeColor="#1D4ED8" strokeWidth={4} />
      ) : null}
      {startCoordinate ? (
        <Marker coordinate={startCoordinate} title="Starting location" pinColor="#1D4ED8" />
      ) : null}
      {validStops.map((stop) => (
        <Marker
          key={stop.place_id ?? `${stop.sequence}-${stop.latitude}-${stop.longitude}`}
          coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
        >
          <View style={styles.stopMarker}>
            <Text style={styles.stopMarkerText}>{stop.sequence}</Text>
          </View>
          <Callout>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>{stop.sequence}. {stop.name}</Text>
              {stop.district ? <Text style={styles.calloutText}>{stop.district}</Text> : null}
              <Text style={styles.calloutText}>{stop.duration_minutes ?? 'Unknown'} minutes</Text>
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
  callout: { width: 190, padding: 6 },
  calloutTitle: { color: '#0F172A', fontWeight: '900', marginBottom: 4 },
  calloutText: { color: '#475569', marginTop: 2 },
});
