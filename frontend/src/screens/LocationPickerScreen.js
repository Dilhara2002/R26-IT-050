import React, { useState } from "react";
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import LocationPickerMap from "../components/LocationPickerMap";
import { colors } from "../styles/colors";

export default function LocationPickerScreen({ navigation, route }) {
  const field = route.params?.field === "endLocation" ? "endLocation" : "startLocation";
  const [selected, setSelected] = useState(null);
  const title = field === "startLocation" ? "Select start location" : "Select end location";

  const confirm = () => {
    if (!selected) return;
    const latitude = Number(selected.latitude.toFixed(6));
    const longitude = Number(selected.longitude.toFixed(6));
    const label = `Map point ${latitude}, ${longitude}`;
    navigation.navigate("Main", {
      locationSelection: {
        id: Date.now(),
        field,
        value: `geo:${latitude},${longitude}|${label}`,
        displayValue: label,
      },
    });
  };

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Tap anywhere on the map, then confirm the selected point.</Text>
      </View>
      <View style={styles.map}><LocationPickerMap selected={selected} onSelect={setSelected} /></View>
      <View style={styles.footer}>
        <Text style={styles.coordinates}>{selected ? `${selected.latitude.toFixed(6)}, ${selected.longitude.toFixed(6)}` : "No point selected"}</Text>
        <TouchableOpacity style={[styles.button, !selected && styles.disabled]} onPress={confirm} disabled={!selected}>
          <Text style={styles.buttonText}>Use This Location</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:colors.background},header:{padding:18,backgroundColor:colors.primaryDark},title:{color:"#F1E9D2",fontSize:23,fontWeight:"800"},subtitle:{color:colors.backgroundDeep,fontSize:12,marginTop:5},map:{flex:1,minHeight:360},footer:{padding:16,backgroundColor:colors.card,borderTopWidth:1,borderTopColor:colors.border},coordinates:{color:colors.muted,textAlign:"center",marginBottom:10},button:{height:52,borderRadius:14,backgroundColor:colors.primary,alignItems:"center",justifyContent:"center"},disabled:{opacity:.45},buttonText:{color:"#F1E9D2",fontWeight:"900",fontSize:15},
});
