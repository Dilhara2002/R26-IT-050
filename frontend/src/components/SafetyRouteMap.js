import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";

export default function SafetyRouteMap({ coordinates = [] }) {
  const mapRef = useRef(null);
  const routePoints = useMemo(
    () => coordinates
      .filter((point) => Array.isArray(point) && point.length >= 2)
      .map(([longitude, latitude]) => ({ latitude: Number(latitude), longitude: Number(longitude) }))
      .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)),
    [coordinates]
  );

  useEffect(() => {
    if (mapRef.current && routePoints.length > 1) {
      mapRef.current.fitToCoordinates(routePoints, {
        edgePadding: { top: 150, right: 50, bottom: 70, left: 50 },
        animated: true,
      });
    }
  }, [routePoints]);

  const start = routePoints[0] || { latitude: 7.8731, longitude: 80.7718 };
  const end = routePoints[routePoints.length - 1];

  return (
    <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={StyleSheet.absoluteFillObject}
      initialRegion={{ ...start, latitudeDelta: 1, longitudeDelta: 1 }}>
      {routePoints.length > 1 && <Polyline coordinates={routePoints} strokeColor="#3E6650" strokeWidth={5} />}
      {routePoints.length > 0 && <Marker coordinate={start} title="Start" pinColor="#3E6650" />}
      {end && <Marker coordinate={end} title="Destination" pinColor="#DC2626" />}
    </MapView>
  );
}
