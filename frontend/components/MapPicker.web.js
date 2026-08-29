import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const selectedIcon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;background:#d62828;border:3px solid white;border-radius:50%;box-shadow:0 1px 5px rgba(0,0,0,.55)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const ClickHandler = ({ setCoords }) => {
  useMapEvents({
    click(e) {
      setCoords(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const ViewportSync = ({ lat, lon }) => {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lon], map.getZoom(), { animate: true });
  }, [map, lat, lon]);

  return null;
};

export default function MapPicker({ lat, lon, hasSelection = false, onSelect, onReady }) {
  return (
    <MapContainer
      center={[lat, lon]}
      zoom={12}
      style={{ height: '100%', width: '100%' }}
      whenReady={onReady}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ViewportSync lat={lat} lon={lon} />
      {hasSelection ? <Marker position={[lat, lon]} icon={selectedIcon} /> : null}
      <ClickHandler setCoords={onSelect} />
    </MapContainer>
  );
}
