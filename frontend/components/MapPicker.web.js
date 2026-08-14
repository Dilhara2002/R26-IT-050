import React from "react";
import { Text, View } from "react-native";

export default function MapPicker({ lat, lon }) {
  const delta = 0.08;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - delta}%2C${lat - delta}%2C${lon + delta}%2C${lat + delta}&layer=mapnik&marker=${lat}%2C${lon}`;
  return (
    <View style={{ flex: 1 }}>
      {React.createElement("iframe", {
        src,
        title: "Trip starting point map",
        style: { border: 0, width: "100%", height: "100%" },
      })}
      <Text style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>Edit latitude and longitude below to move the web map.</Text>
    </View>
  );
}
