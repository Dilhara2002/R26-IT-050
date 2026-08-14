import React from "react";
import { View } from "react-native";

export default function ResultMap({ location }) {
  const latitude = location?.latitude ?? 7.2906;
  const longitude = location?.longitude ?? 80.6337;
  const delta = 0.2;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - delta}%2C${latitude - delta}%2C${longitude + delta}%2C${latitude + delta}&layer=mapnik&marker=${latitude}%2C${longitude}`;
  return (
    <View style={{ flex: 1 }}>
      {React.createElement("iframe", {
        src,
        title: "Optimized trip map",
        style: { border: 0, width: "100%", height: "100%" },
      })}
    </View>
  );
}
