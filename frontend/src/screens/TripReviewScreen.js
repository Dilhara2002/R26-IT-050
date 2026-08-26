import React, { useState } from "react";
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../styles/colors";

const getVehicleValue = (vehicle, keys, fallback = "Unavailable") => {
  for (const key of keys) {
    if (vehicle?.[key] !== undefined && vehicle?.[key] !== null) return vehicle[key];
  }
  return fallback;
};

export default function TripReviewScreen({ route, navigation }) {
  const { selectedVehicle = {}, tripResult = {}, hotelContext = null } = route.params || {};
  const [confirmed, setConfirmed] = useState(false);
  const selectedRoute = tripResult?.routeResult || null;
  const risk = tripResult?.riskPrediction || {};
  const vehicleName = getVehicleValue(selectedVehicle, ["Vehicle Name (Make & Model)", "vehicleName", "model"], "Selected Vehicle");
  const category = getVehicleValue(selectedVehicle, ["Vehicle Category", "vehicleCategory"]);
  const seats = getVehicleValue(selectedVehicle, ["Seating Capacity", "seatingCapacity"]);
  const fuel = getVehicleValue(selectedVehicle, ["Fuel Type", "fuelType"]);
  const cost = getVehicleValue(selectedVehicle, ["estimatedHirePrice", "calculatedCost"], null);
  const explanation = tripResult?.explanation?.vehicleRecommendation?.reason || "Selected using your budget, passengers and route conditions.";

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="checkmark-circle" size={34} color="#FFFFFF" /></View>
        <Text style={styles.eyebrow}>YOUR TRIP IS ALMOST READY</Text>
        <Text style={styles.title}>Review Trip Plan</Text>
        <Text style={styles.subtitle}>Check your selected vehicle, route and safety details before continuing.</Text>
      </View>

      <Section icon="car-sport-outline" title="Selected Vehicle">
        <Text style={styles.vehicleName}>{vehicleName}</Text>
        <View style={styles.infoGrid}>
          <Info label="Category" value={category} />
          <Info label="Seats" value={seats} />
          <Info label="Fuel" value={fuel} />
          <Info label="Estimated Trip Cost" value={cost === null ? "Unavailable" : `LKR ${Number(cost).toLocaleString()}`} />
        </View>
        <Text style={styles.reason}>{explanation}</Text>
      </Section>

      <Section icon="navigate-outline" title="Route Summary">
        <Text style={styles.routeTitle}>{selectedRoute?.startLocation || tripResult?.trip?.from} → {selectedRoute?.endLocation || tripResult?.trip?.to}</Text>
        <View style={styles.infoGrid}>
          <Info label="Distance" value={`${selectedRoute?.distanceKm ?? tripResult?.trip?.distanceKm ?? "—"} km`} />
          <Info label="Duration" value={`${selectedRoute?.durationMinutes ?? tripResult?.trip?.durationMinutes ?? "—"} mins`} />
          <Info label="Passengers" value={tripResult?.trip?.passengers ?? "—"} />
          <Info label="Route Risk" value={risk?.riskLevel || selectedRoute?.predictedRiskLevel || "Unknown"} />
        </View>
        {selectedRoute?.routeGeometryAvailable && (
          <TouchableOpacity style={styles.mapButton} onPress={() => navigation.navigate("SafetyMap", { selectedRoute })}>
            <Ionicons name="map-outline" size={20} color="#FFFFFF" />
            <Text style={styles.mapButtonText}>View Route Map</Text>
          </TouchableOpacity>
        )}
      </Section>

      <Section icon="shield-checkmark-outline" title="Safety Check">
        <Text style={styles.safetyText}>Predicted risk: <Text style={styles.safetyStrong}>{risk?.riskLevel || "Unknown"}</Text></Text>
        <Text style={styles.safetyText}>Model confidence: <Text style={styles.safetyStrong}>{risk?.confidencePercent ?? "Unavailable"}{risk?.confidencePercent != null ? "%" : ""}</Text></Text>
        <Text style={styles.tip}>Drive according to current road and weather conditions. Take breaks on long journeys and keep emergency contacts available.</Text>
      </Section>

      {confirmed ? (
        <><View style={styles.confirmed}><Ionicons name="checkmark-circle" size={22} color="#15803D" /><Text style={styles.confirmedText}>Vehicle booking request is ready.</Text></View>{hotelContext&&<TouchableOpacity style={styles.returnButton} onPress={()=>navigation.navigate("HotelResults",{packageData:hotelContext.packageData,restoredSelection:hotelContext.selectedHotel,vehicleRequest:hotelContext.vehicleRequest,safetyPlan:{selectedVehicle,tripResult,vehicleRequest:hotelContext.vehicleRequest}})}><Ionicons name="bed-outline" size={20} color="#FFFFFF"/><Text style={styles.returnButtonText}>Return to Complete Hotel Plan</Text><Ionicons name="arrow-forward" size={19} color="#FFFFFF"/></TouchableOpacity>}</>
      ) : (
        <TouchableOpacity style={styles.confirmButton} onPress={() => setConfirmed(true)}><Text style={styles.confirmButtonText}>Book Vehicle</Text><Ionicons name="arrow-forward" size={20} color="#FFFFFF" /></TouchableOpacity>
      )}
      {!hotelContext&&<TouchableOpacity style={styles.itineraryButton} onPress={() => navigation.navigate("ItineraryHome")}><Ionicons name="map-outline" size={19} color={colors.primary} /><Text style={styles.itineraryText}>Add to Smart Itinerary</Text></TouchableOpacity>}
      <TouchableOpacity style={styles.changeButton} onPress={() => navigation.goBack()}><Text style={styles.changeText}>Change Vehicle</Text></TouchableOpacity>
    </ScrollView>
  );
}

function Section({ icon, title, children }) { return <View style={styles.card}><View style={styles.sectionHeader}><View style={styles.sectionIcon}><Ionicons name={icon} size={21} color={colors.primary} /></View><Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>; }
function Info({ label, value }) { return <View style={styles.info}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{String(value)}</Text></View>; }

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:"#F1E9D2"},content:{width:"100%",maxWidth:720,alignSelf:"center",padding:20,paddingBottom:50},hero:{backgroundColor:"#1C2A44",borderRadius:24,padding:24,marginBottom:16,borderWidth:1,borderColor:"rgba(216,154,31,.42)"},heroIcon:{width:52,height:52,borderRadius:17,backgroundColor:"#A15B33",alignItems:"center",justifyContent:"center",marginBottom:16},eyebrow:{color:"#D89A1F",fontSize:10,fontWeight:"900",letterSpacing:1.5},title:{color:"#FFFFFF",fontSize:29,fontWeight:"600",fontFamily:"serif",marginTop:6},subtitle:{color:"#E7DBBA",fontSize:14,lineHeight:21,marginTop:7},card:{backgroundColor:"#FBF7EC",borderWidth:1,borderColor:"#D7CAB0",borderRadius:20,padding:18,marginBottom:14,shadowColor:"#241F18",shadowOpacity:.08,shadowRadius:14,shadowOffset:{width:0,height:6}},sectionHeader:{flexDirection:"row",alignItems:"center",gap:10,marginBottom:16},sectionIcon:{width:39,height:39,borderRadius:12,backgroundColor:"#E7DBBA",alignItems:"center",justifyContent:"center"},sectionTitle:{color:colors.text,fontSize:17,fontWeight:"600",fontFamily:"serif"},vehicleName:{color:colors.text,fontSize:20,fontWeight:"600",fontFamily:"serif",marginBottom:14},routeTitle:{color:colors.text,fontSize:17,fontWeight:"600",fontFamily:"serif",marginBottom:14},infoGrid:{flexDirection:"row",flexWrap:"wrap",gap:10},info:{backgroundColor:"#F1E9D2",borderRadius:12,padding:12,minWidth:130,flexGrow:1,flexBasis:"45%"},infoLabel:{color:colors.cinnamon,fontSize:11,fontWeight:"700",textTransform:"uppercase",letterSpacing:.6},infoValue:{color:colors.text,fontSize:14,fontWeight:"800",marginTop:4},reason:{color:colors.muted,fontSize:13,lineHeight:20,marginTop:14},mapButton:{backgroundColor:colors.primary,borderRadius:13,padding:14,alignItems:"center",justifyContent:"center",flexDirection:"row",gap:8,marginTop:15},mapButtonText:{color:"#FFFFFF",fontWeight:"800"},safetyText:{color:colors.muted,fontSize:14,marginBottom:8},safetyStrong:{color:colors.text,fontWeight:"900"},tip:{backgroundColor:"#FFFBEB",color:"#92400E",borderRadius:12,padding:13,fontSize:12,lineHeight:18,marginTop:7},confirmButton:{height:56,borderRadius:16,backgroundColor:colors.primary,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:9},confirmButtonText:{color:"#FFFFFF",fontWeight:"900",fontSize:15},confirmed:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:9,backgroundColor:"#F0FDF4",borderRadius:16,padding:16},confirmedText:{color:"#166534",fontWeight:"800"},returnButton:{height:56,borderRadius:16,backgroundColor:colors.primaryDark,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,marginTop:11},returnButtonText:{color:"#FFFFFF",fontWeight:"900",fontSize:14},itineraryButton:{height:54,borderRadius:16,borderWidth:1,borderColor:colors.primary,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,marginTop:11},itineraryText:{color:colors.primary,fontWeight:"900"},changeButton:{alignItems:"center",padding:15,marginTop:3},changeText:{color:colors.muted,fontWeight:"800"}
});
