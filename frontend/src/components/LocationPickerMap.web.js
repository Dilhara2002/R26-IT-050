import React from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function ClickHandler({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

function CurrentLocationCenter({ location }) {
  const map = useMap();
  React.useEffect(() => {
    if (location) map.setView([location.latitude, location.longitude], 14);
  }, [location, map]);
  return null;
}

export default function LocationPickerMap({ currentLocation, selected, onSelect }) {
  return (
    <MapContainer center={[7.8731, 80.7718]} zoom={7} style={{ height: "100%", width: "100%" }}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickHandler onSelect={onSelect} />
      <CurrentLocationCenter location={currentLocation} />
      {currentLocation ? <Marker position={[currentLocation.latitude, currentLocation.longitude]} /> : null}
      {selected ? <Marker position={[selected.latitude, selected.longitude]} /> : null}
    </MapContainer>
  );
}
