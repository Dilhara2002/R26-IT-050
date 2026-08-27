import React, { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const marker = (color) => L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 2px 7px #475569"></div>`,
  iconSize: [28, 28], iconAnchor: [14, 14],
});

function FitRoute({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [45, 45] });
  }, [map, points]);
  return null;
}

export default function SafetyRouteMap({ coordinates = [] }) {
  const points = useMemo(
    () => coordinates
      .filter((point) => Array.isArray(point) && point.length >= 2)
      .map(([longitude, latitude]) => [Number(latitude), Number(longitude)])
      .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude)),
    [coordinates]
  );
  const start = points[0] || [7.8731, 80.7718];
  const end = points[points.length - 1];

  return (
    <MapContainer center={start} zoom={8} style={{ height: "100%", width: "100%" }}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitRoute points={points} />
      {points.length > 1 && <Polyline positions={points} pathOptions={{ color: "#3E6650", weight: 6, opacity: 0.9 }} />}
      {points.length > 0 && <Marker position={start} icon={marker("#3E6650")}><Popup>Start</Popup></Marker>}
      {end && <Marker position={end} icon={marker("#DC2626")}><Popup>Destination</Popup></Marker>}
    </MapContainer>
  );
}
