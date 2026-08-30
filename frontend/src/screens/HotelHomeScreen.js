import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { generateTourismPackage } from "../../services/tourism/tourismApi";
import { colors } from "../styles/colors";

const examples = [
  "Luxury hotel in Kandy with nature activities",
  "Budget hotel in Ella with adventure activities",
  "Beach hotel in Galle with family activities",
];
const vehicleCategories = ["All", "Economy", "Sedan", "SUV", "Van", "MUV", "Luxury"];

const isoDateFromToday = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export default function HotelHomeScreen({ navigation }) {
  const [prompt, setPrompt] = useState("");
  const [stay, setStay] = useState({
    checkInDate: isoDateFromToday(7),
    checkOutDate: isoDateFromToday(10),
    adults: "2",
    roomQuantity: "1",
  });
  const [loading, setLoading] = useState(false);
  const [includeVehicle, setIncludeVehicle] = useState(false);
  const [startLocation, setStartLocation] = useState("");
  const [totalBudget, setTotalBudget] = useState("");
  const [passengers, setPassengers] = useState("");
  const [vehicleCategory, setVehicleCategory] = useState("All");

  const updateStay = (field, value) => setStay((current) => ({ ...current, [field]: value }));

  const generate = async () => {
    if (!prompt.trim()) {
      Alert.alert("Travel request required", "Tell us what kind of stay and activities you are looking for.");
      return;
    }
    if (includeVehicle && (!startLocation.trim() || Number(totalBudget) <= 0 || Number(passengers) <= 0)) {
      Alert.alert("Vehicle details required", "Enter your starting location, total trip budget and passenger count.");
      return;
    }
    try {
      setLoading(true);
      const adults = Number(stay.adults);
      const roomQuantity = Number(stay.roomQuantity);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(stay.checkInDate) || !/^\d{4}-\d{2}-\d{2}$/.test(stay.checkOutDate)) {
        Alert.alert("Invalid dates", "Enter check-in and check-out dates as YYYY-MM-DD.");
        return;
      }
      if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(roomQuantity) || roomQuantity < 1) {
        Alert.alert("Invalid guests", "Adults and rooms must be positive whole numbers.");
        return;
      }
      const data = await generateTourismPackage(prompt.trim(), {
        checkInDate: stay.checkInDate,
        checkOutDate: stay.checkOutDate,
        adults,
        roomQuantity,
      });
      navigation.navigate("HotelResults", {
        packageData: data,
        prompt: prompt.trim(),
        vehicleRequest: includeVehicle ? {
          enabled: true,
          startLocation: startLocation.trim(),
          totalBudget: Number(totalBudget),
          passengers: Number(passengers),
          preferredCategory: vehicleCategory === "All" ? "" : vehicleCategory,
        } : { enabled: false },
      });
    } catch (error) {
      Alert.alert("Unable to build package", error?.message || "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return <ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <View style={s.hero}>
      <View style={s.badge}><Ionicons name="sparkles" size={14} color={colors.turmeric}/><Text style={s.badgeText}>GRAPH RAG TRAVEL AI</Text></View>
      <Text style={s.title}>Find a stay that fits your journey.</Text>
      <Text style={s.subtitle}>Describe your ideal Sri Lankan trip. CeylonGo will match hotels, activities, food preferences and trip duration.</Text>
    </View>

    <View style={s.card}>
      <View style={s.cardHeader}><View style={s.iconBox}><Ionicons name="bed-outline" size={27} color={colors.cinnamon}/></View><View><Text style={s.cardTitle}>Hotels & Activities</Text><Text style={s.cardSub}>Personalized travel package builder</Text></View></View>
      <Text style={s.label}>Your travel request</Text>
      <View style={s.inputWrap}><TextInput value={prompt} onChangeText={setPrompt} multiline textAlignVertical="top" placeholder="e.g. I want a deluxe hotel in Kandy with vegetarian food and nature activities for three days" placeholderTextColor="#8B8172" style={s.input}/><Ionicons name="search-outline" size={21} color={colors.cinnamon} style={s.searchIcon}/></View>
      <Text style={s.quickLabel}>STAY DETAILS FOR LIVE ROOM PRICES</Text>
      <View style={s.stayGrid}>
        <StayField label="Check-in" value={stay.checkInDate} onChangeText={(value)=>updateStay("checkInDate",value)} placeholder="YYYY-MM-DD"/>
        <StayField label="Check-out" value={stay.checkOutDate} onChangeText={(value)=>updateStay("checkOutDate",value)} placeholder="YYYY-MM-DD"/>
        <StayField label="Adults" value={stay.adults} onChangeText={(value)=>updateStay("adults",value)} keyboardType="number-pad"/>
        <StayField label="Rooms" value={stay.roomQuantity} onChangeText={(value)=>updateStay("roomQuantity",value)} keyboardType="number-pad"/>
      </View>
      <Text style={s.quickLabel}>QUICK IDEAS</Text>
      <View style={s.chips}>{examples.map(item=><Pressable key={item} style={s.chip} onPress={()=>setPrompt(item)}><Text style={s.chipText}>{item}</Text></Pressable>)}</View>

      <View style={s.vehicleSection}>
        <View style={s.vehicleHeading}><View style={s.vehicleHeadingIcon}><Ionicons name="car-sport-outline" size={22} color={colors.primary}/></View><View style={s.vehicleHeadingCopy}><Text style={s.vehicleTitle}>Include a vehicle?</Text><Text style={s.vehicleSub}>Optional safe route and vehicle planning</Text></View></View>
        <View style={s.toggleRow}>
          <Pressable style={[s.toggle,!includeVehicle&&s.toggleActive]} onPress={()=>setIncludeVehicle(false)}><Ionicons name="bed-outline" size={18} color={!includeVehicle?"#F1E9D2":colors.muted}/><Text style={[s.toggleText,!includeVehicle&&s.toggleTextActive]}>No, stay only</Text></Pressable>
          <Pressable style={[s.toggle,includeVehicle&&s.toggleActive]} onPress={()=>setIncludeVehicle(true)}><Ionicons name="car-outline" size={18} color={includeVehicle?"#F1E9D2":colors.muted}/><Text style={[s.toggleText,includeVehicle&&s.toggleTextActive]}>Yes, add vehicle</Text></Pressable>
        </View>
        {includeVehicle&&<View style={s.vehicleFields}>
          <Text style={s.fieldLabel}>Starting location</Text><TextInput style={s.fieldInput} value={startLocation} onChangeText={setStartLocation} placeholder="e.g. Colombo" placeholderTextColor="#8B8172"/>
          <View style={s.fieldRow}><View style={s.fieldHalf}><Text style={s.fieldLabel}>Total trip budget (LKR)</Text><TextInput style={s.fieldInput} value={totalBudget} onChangeText={setTotalBudget} keyboardType="numeric" placeholder="100000" placeholderTextColor="#8B8172"/></View><View style={s.fieldHalf}><Text style={s.fieldLabel}>Passengers</Text><TextInput style={s.fieldInput} value={passengers} onChangeText={setPassengers} keyboardType="numeric" placeholder="4" placeholderTextColor="#8B8172"/></View></View>
          <Text style={s.fieldLabel}>Preferred vehicle</Text><View style={s.categoryRow}>{vehicleCategories.map(category=><Pressable key={category} style={[s.category,vehicleCategory===category&&s.categoryActive]} onPress={()=>setVehicleCategory(category)}><Text style={[s.categoryText,vehicleCategory===category&&s.categoryTextActive]}>{category}</Text></Pressable>)}</View>
          <View style={s.vehicleNote}><Ionicons name="information-circle-outline" size={18} color={colors.cinnamon}/><Text style={s.vehicleNoteText}>After choosing a hotel, CeylonGo will calculate a safer route, recommend vehicles and deduct the selected vehicle cost from this total budget.</Text></View>
        </View>}
      </View>
      <Pressable style={({pressed})=>[s.button,pressed&&s.pressed,loading&&s.disabled]} onPress={generate} disabled={loading}>
        {loading?<><ActivityIndicator color="#F1E9D2"/><Text style={s.buttonText}>Building your package...</Text></>:<><Text style={s.buttonText}>{includeVehicle?"Build Hotel & Vehicle Plan":"Generate Smart Package"}</Text><Ionicons name="arrow-forward" size={20} color="#F1E9D2"/></>}
      </Pressable>
    </View>

    <View style={s.features}>
      <Feature icon="business-outline" title="Hotel Match" text="Matches location, category, grade and food."/>
      <Feature icon="leaf-outline" title="Activity Match" text="Finds suitable experiences near each stay."/>
      <Feature icon="git-network-outline" title="Graph Intelligence" text="Uses connected tourism knowledge, not plain search."/>
    </View>
  </ScrollView>;
}

function Feature({icon,title,text}) { return <View style={s.feature}><View style={s.featureIcon}><Ionicons name={icon} size={22} color={colors.primary}/></View><View style={s.featureCopy}><Text style={s.featureTitle}>{title}</Text><Text style={s.featureText}>{text}</Text></View></View>; }

function StayField({label,...props}) { return <View style={s.stayField}><Text style={s.stayLabel}>{label}</Text><TextInput {...props} style={s.stayInput} placeholderTextColor="#8B8172"/></View>; }

const s=StyleSheet.create({
  page:{flex:1,backgroundColor:colors.background},content:{width:"100%",maxWidth:820,alignSelf:"center",padding:20,paddingBottom:48},
  hero:{backgroundColor:colors.primaryDark,borderRadius:26,padding:26,marginBottom:16,borderWidth:1,borderColor:"rgba(216,154,31,.42)",shadowColor:colors.text,shadowOpacity:.15,shadowRadius:18,shadowOffset:{width:0,height:8}},
  badge:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:7,backgroundColor:"rgba(255,255,255,.1)",borderRadius:20,paddingHorizontal:11,paddingVertical:7},badgeText:{color:colors.backgroundDeep,fontSize:10,fontWeight:"900",letterSpacing:1.2},
  title:{color:"#F1E9D2",fontSize:34,lineHeight:41,fontFamily:"serif",fontWeight:"600",marginTop:18,maxWidth:590},subtitle:{color:colors.backgroundDeep,fontSize:15,lineHeight:23,marginTop:10,maxWidth:620},
  card:{backgroundColor:colors.card,borderRadius:23,padding:20,borderWidth:1,borderColor:colors.border,shadowColor:colors.text,shadowOpacity:.09,shadowRadius:15,shadowOffset:{width:0,height:6}},cardHeader:{flexDirection:"row",alignItems:"center",gap:12,marginBottom:22},iconBox:{width:52,height:52,borderRadius:16,backgroundColor:"#F2DFCF",alignItems:"center",justifyContent:"center"},cardTitle:{color:colors.text,fontSize:21,fontFamily:"serif",fontWeight:"600"},cardSub:{color:colors.muted,fontSize:12,marginTop:3},
  label:{color:colors.cinnamon,fontSize:11,fontWeight:"900",letterSpacing:.9,marginBottom:8,textTransform:"uppercase"},inputWrap:{height:155,backgroundColor:colors.backgroundDeep,borderRadius:17,borderWidth:1,borderColor:colors.border,position:"relative"},input:{flex:1,padding:16,paddingRight:48,color:colors.text,fontSize:15,lineHeight:22},searchIcon:{position:"absolute",top:15,right:15},quickLabel:{color:colors.cinnamon,fontSize:10,fontWeight:"900",letterSpacing:1.1,marginTop:18,marginBottom:9},chips:{flexDirection:"row",flexWrap:"wrap",gap:8},chip:{backgroundColor:colors.backgroundDeep,borderWidth:1,borderColor:colors.border,borderRadius:18,paddingHorizontal:12,paddingVertical:9},chipText:{color:colors.primaryDark,fontSize:12,fontWeight:"700"},vehicleSection:{borderTopWidth:1,borderTopColor:colors.border,marginTop:22,paddingTop:20},vehicleHeading:{flexDirection:"row",alignItems:"center",gap:11},vehicleHeadingIcon:{width:43,height:43,borderRadius:13,backgroundColor:colors.backgroundDeep,alignItems:"center",justifyContent:"center"},vehicleHeadingCopy:{flex:1},vehicleTitle:{color:colors.text,fontFamily:"serif",fontWeight:"600",fontSize:18},vehicleSub:{color:colors.muted,fontSize:11,marginTop:3},toggleRow:{flexDirection:"row",gap:8,marginTop:14},toggle:{flex:1,minHeight:46,borderRadius:13,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundDeep,flexDirection:"row",gap:7,alignItems:"center",justifyContent:"center",paddingHorizontal:8},toggleActive:{backgroundColor:colors.primary,borderColor:colors.primary},toggleText:{color:colors.muted,fontSize:12,fontWeight:"800"},toggleTextActive:{color:"#F1E9D2"},vehicleFields:{marginTop:17},fieldLabel:{color:colors.cinnamon,fontSize:10,fontWeight:"900",letterSpacing:.6,textTransform:"uppercase",marginBottom:7,marginTop:11},fieldInput:{height:52,backgroundColor:colors.backgroundDeep,borderWidth:1,borderColor:colors.border,borderRadius:13,paddingHorizontal:14,color:colors.text,fontSize:14},fieldRow:{flexDirection:"row",gap:10},fieldHalf:{flex:1},categoryRow:{flexDirection:"row",flexWrap:"wrap",gap:7},category:{paddingHorizontal:11,paddingVertical:8,borderRadius:18,backgroundColor:colors.backgroundDeep,borderWidth:1,borderColor:colors.border},categoryActive:{backgroundColor:colors.primaryDark,borderColor:colors.primaryDark},categoryText:{color:colors.muted,fontSize:11,fontWeight:"700"},categoryTextActive:{color:"#F1E9D2"},vehicleNote:{flexDirection:"row",gap:8,backgroundColor:"#F5E7BE",borderRadius:12,padding:11,marginTop:15},vehicleNoteText:{flex:1,color:colors.muted,fontSize:10,lineHeight:16},
  stayGrid:{flexDirection:"row",flexWrap:"wrap",gap:9},stayField:{minWidth:145,flexGrow:1,flexBasis:"46%"},stayLabel:{color:colors.muted,fontSize:11,fontWeight:"700",marginBottom:5},stayInput:{height:45,backgroundColor:colors.backgroundDeep,borderWidth:1,borderColor:colors.border,borderRadius:12,paddingHorizontal:12,color:colors.text,fontSize:13},
  button:{minHeight:58,backgroundColor:colors.primary,marginTop:22,borderRadius:16,flexDirection:"row",gap:10,alignItems:"center",justifyContent:"center"},buttonText:{color:"#F1E9D2",fontWeight:"900",fontSize:15},pressed:{opacity:.8},disabled:{opacity:.65},features:{gap:11,marginTop:15},feature:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:18,padding:15,flexDirection:"row",alignItems:"center",gap:12},featureIcon:{width:42,height:42,borderRadius:13,backgroundColor:colors.backgroundDeep,alignItems:"center",justifyContent:"center"},featureCopy:{flex:1},featureTitle:{color:colors.text,fontFamily:"serif",fontWeight:"600",fontSize:16},featureText:{color:colors.muted,fontSize:12,lineHeight:18,marginTop:3}
});
