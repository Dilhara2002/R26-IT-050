import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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

export default function ResultMap({ location, itineraryData }) {
  const defaultLat = location ? location.latitude : 7.2906;
  const defaultLon = location ? location.longitude : 80.6337;

  return (
    <MapContainer center={[defaultLat, defaultLon]} zoom={12} style={{ height: '100%', width: '100%' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {location && (
        <Marker position={[location.latitude, location.longitude]}>
          <Popup>You are here</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}