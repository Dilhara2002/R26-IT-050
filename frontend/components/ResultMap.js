import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

const getRiskColor = (leg) => {
  if (!leg?.risk_evidence_available) return '#64748B';
  if (leg?.risk_prediction?.riskLevel === 'Low') return '#16A34A';
  if (leg?.risk_prediction?.riskLevel === 'Medium') return '#F59E0B';
  if (leg?.risk_prediction?.riskLevel === 'High') return '#DC2626';
  return '#64748B';
};

const getSafetyLines = (safetyLegs) =>
  (Array.isArray(safetyLegs) ? safetyLegs : []).flatMap((leg, index) => {
    const coordinates = leg?.route_geometry?.coordinates;
    if (leg?.status !== 'success' || leg?.route_geometry?.type !== 'LineString' || !Array.isArray(coordinates)) {
      return [];
    }
    const nativeCoordinates = coordinates
      .filter((coordinate) =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        Number.isFinite(coordinate[0]) &&
        Number.isFinite(coordinate[1])
      )
      .map(([longitude, latitude]) => ({ latitude, longitude }));
    return nativeCoordinates.length >= 2
      ? [{ key: leg?.leg_sequence ?? index, coordinates: nativeCoordinates, color: getRiskColor(leg) }]
      : [];
  });

export default function ResultMap({ startingLocation, optimizedStops = [], safetyLegs = [] }) {
  const mapRef = useRef(null);
  const startCoordinate = useMemo(() => {
    const latitude = Number(startingLocation?.lat);
    const longitude = Number(startingLocation?.lon);
    return {
      latitude: Number.isFinite(latitude) ? latitude : 7.2906,
      longitude: Number.isFinite(longitude) ? longitude : 80.6337,
    };
  }, [startingLocation]);
  const validStops = useMemo(() =>
    (Array.isArray(optimizedStops) ? optimizedStops : [])
      .filter((stop) => Number.isFinite(stop?.latitude) && Number.isFinite(stop?.longitude)),
  [optimizedStops]);
  const stopCoordinates = useMemo(() =>
    validStops.map((stop) => ({ latitude: stop.latitude, longitude: stop.longitude })),
  [validStops]);
  const safetyLines = useMemo(() => getSafetyLines(safetyLegs), [safetyLegs]);

  useEffect(() => {
    const coordinates = [
      startCoordinate,
      ...stopCoordinates,
      ...safetyLines.flatMap((line) => line.coordinates),
    ];
    if (mapRef.current && coordinates.length > 1) {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 140, right: 50, bottom: 80, left: 50 },
        animated: true,
      });
    }
  }, [startCoordinate, stopCoordinates, safetyLines]);

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
      {safetyLines.map((line) => (
        <Polyline
          key={`safety-leg-${line.key}`}
          coordinates={line.coordinates}
          strokeColor={line.color}
          strokeWidth={6}
        />
      ))}
      <Marker coordinate={startCoordinate} title="Starting location" pinColor="#1D4ED8" />
      {validStops.map((stop) => (
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
