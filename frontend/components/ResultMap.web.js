import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function FitMapBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points, { padding: [50, 50] });
    }
  }, [map, points]);
  return null;
}

const startIcon = L.divIcon({
  className: '',
  html: '<div style="background:#1D4ED8;color:white;border:3px solid white;border-radius:50%;width:24px;height:24px;box-shadow:0 2px 6px #555"></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function numberedIcon(sequence) {
  return L.divIcon({
    className: '',
    html: `<div style="background:#DC2626;color:white;border:2px solid white;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-weight:900;box-shadow:0 2px 6px #555">${sequence}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

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
    const leafletCoordinates = coordinates
      .filter((coordinate) =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        Number.isFinite(coordinate[0]) &&
        Number.isFinite(coordinate[1])
      )
      .map(([longitude, latitude]) => [latitude, longitude]);
    return leafletCoordinates.length >= 2
      ? [{ key: leg?.leg_sequence ?? index, coordinates: leafletCoordinates, color: getRiskColor(leg) }]
      : [];
  });

export default function ResultMap({ startingLocation, optimizedStops = [], safetyLegs = [] }) {
  const parsedLat = Number(startingLocation?.lat);
  const parsedLon = Number(startingLocation?.lon);
  const defaultLat = Number.isFinite(parsedLat) ? parsedLat : 7.2906;
  const defaultLon = Number.isFinite(parsedLon) ? parsedLon : 80.6337;
  const validStops = useMemo(() =>
    (Array.isArray(optimizedStops) ? optimizedStops : [])
      .filter((stop) => Number.isFinite(stop?.latitude) && Number.isFinite(stop?.longitude)),
  [optimizedStops]);
  const safetyLines = useMemo(() => getSafetyLines(safetyLegs), [safetyLegs]);
  const points = useMemo(() => [
    [defaultLat, defaultLon],
    ...validStops.map((stop) => [stop.latitude, stop.longitude]),
    ...safetyLines.flatMap((line) => line.coordinates),
  ], [defaultLat, defaultLon, validStops, safetyLines]);

  return (
    <MapContainer center={[defaultLat, defaultLon]} zoom={12} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
      />
      <FitMapBounds points={points} />
      {safetyLines.map((line) => (
        <Polyline
          key={`safety-leg-${line.key}`}
          positions={line.coordinates}
          pathOptions={{ color: line.color, weight: 6, opacity: 0.9 }}
        />
      ))}
      <Marker position={[defaultLat, defaultLon]} icon={startIcon}>
        <Popup>Starting location</Popup>
      </Marker>
      {validStops.map((stop) => (
        <Marker
          key={stop.place_id ?? `${stop.latitude}-${stop.longitude}`}
          position={[stop.latitude, stop.longitude]}
          icon={numberedIcon(stop.sequence)}
        >
          <Popup><strong>{stop.name}</strong><br />{stop.duration_minutes} minutes</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
