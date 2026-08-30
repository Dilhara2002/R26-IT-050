import React from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function ClickHandler({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

export default function LocationPickerMap({ selected, onSelect }) {
  return (
    <MapContainer center={[7.8731, 80.7718]} zoom={7} style={{ height: "100%", width: "100%" }}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickHandler onSelect={onSelect} />
      {selected ? <Marker position={[selected.latitude, selected.longitude]} /> : null}
    </MapContainer>
  );
}
