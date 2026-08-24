import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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
  html: '<div style="background:#1C2A44;color:white;border:3px solid white;border-radius:50%;width:24px;height:24px;box-shadow:0 2px 6px #555"></div>',
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

export default function ResultMap({ startingLocation, optimizedStops = [] }) {
  const defaultLat = Number(startingLocation?.lat ?? 7.2906);
  const defaultLon = Number(startingLocation?.lon ?? 80.6337);
  const points = useMemo(() => [
    [defaultLat, defaultLon],
    ...optimizedStops
      .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude))
      .map((stop) => [stop.latitude, stop.longitude]),
  ], [defaultLat, defaultLon, optimizedStops]);

  return (
    <MapContainer center={[defaultLat, defaultLon]} zoom={12} style={{ height: '100%', width: '100%' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitMapBounds points={points} />
      <Marker position={[defaultLat, defaultLon]} icon={startIcon}>
        <Popup>Starting location</Popup>
      </Marker>
      {optimizedStops.map((stop) => (
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
