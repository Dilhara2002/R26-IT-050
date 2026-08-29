import React, { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const DEFAULT_CENTER = [7.2906, 80.6337];
const startIcon = L.divIcon({
  className: '',
  html: '<div style="background:#1D4ED8;border:3px solid white;border-radius:50%;width:24px;height:24px;box-shadow:0 2px 6px #555"></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function numberedIcon(sequence) {
  return L.divIcon({
    className: '',
    html: `<div style="background:#DC2626;color:white;border:2px solid white;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-weight:900;box-shadow:0 2px 6px #555">${Number(sequence)}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function FitMapBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points, { padding: [50, 50] });
    } else if (points.length === 1) {
      map.setView(points[0], 13);
    }
  }, [map, points]);
  return null;
}

export default function ResultMap({ startingLocation, optimizedStops = [] }) {
  const startPosition = useMemo(() => {
    const latitude = Number(startingLocation?.lat);
    const longitude = Number(startingLocation?.lon);
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      ? [latitude, longitude]
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
          position: [Number(stop.latitude), Number(stop.longitude)],
        })),
    [optimizedStops]
  );
  const routePoints = useMemo(
    () => [
      ...(startPosition ? [startPosition] : []),
      ...validStops.map((stop) => stop.position),
    ],
    [startPosition, validStops]
  );
  const initialCenter = startPosition || routePoints[0] || DEFAULT_CENTER;

  return (
    <MapContainer center={initialCenter} zoom={12} style={{ height: '100%', width: '100%' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitMapBounds points={routePoints} />
      {routePoints.length > 1 ? (
        <Polyline positions={routePoints} pathOptions={{ color: '#1D4ED8', weight: 4 }} />
      ) : null}
      {startPosition ? (
        <Marker position={startPosition} icon={startIcon}>
          <Popup><strong>Starting location</strong></Popup>
        </Marker>
      ) : null}
      {validStops.map((stop) => (
        <Marker
          key={stop.place_id ?? `${stop.sequence}-${stop.position[0]}-${stop.position[1]}`}
          position={stop.position}
          icon={numberedIcon(stop.sequence)}
        >
          <Popup>
            <strong>{stop.sequence}. {stop.name}</strong>
            {stop.district ? <><br />{stop.district}</> : null}
            <br />{stop.duration_minutes ?? 'Unknown'} minutes
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
