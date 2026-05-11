import React from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Reliable CDN links for Leaflet markers
const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const ClickHandler = ({ setCoords }) => {
  useMapEvents({
    click(e) {
      setCoords(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

export default function MapPicker({ lat, lon, onSelect }) {
  return (
    <MapContainer center={[lat, lon]} zoom={12} style={{ height: '100%', width: '100%' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[lat, lon]} icon={customIcon} />
      <ClickHandler setCoords={onSelect} />
    </MapContainer>
  );
}