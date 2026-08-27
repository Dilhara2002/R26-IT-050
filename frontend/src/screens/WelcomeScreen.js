import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function WelcomeScreen({ onLogin, onRegister }) {
  return <View style={s.page}>
    <StatusBar barStyle="light-content" /><View style={s.glow} />
    <View style={s.content}>
      <View style={s.brandRow}><Image source={require("../../assets/ceylongo-logo.png")} style={s.logo} resizeMode="contain" accessibilityLabel="CeylonGo logo"/><Text style={s.brand}>Ceylon<Text style={s.accent}>Go</Text></Text></View>
      <View>
        <View style={s.pill}><Ionicons name="sparkles" size={15} color="#FCD34D" /><Text style={s.pillText}>AI-POWERED TRAVEL COMPANION</Text></View>
        <Text style={s.title}>Discover Sri Lanka,{"\n"}<Text style={s.accent}>your way.</Text></Text>
        <Text style={s.subtitle}>Plan smarter journeys, find unforgettable stays and travel with confidence — all in one place.</Text>
        <View style={s.stats}><Stat value="4" label="Smart tools" /><View style={s.line} /><Stat value="24/7" label="Travel support" /><View style={s.line} /><Stat value="100%" label="Sri Lankan" /></View>
      </View>
      <View style={s.actions}>
        <TouchableOpacity style={s.primary} onPress={onRegister}><Text style={s.primaryText}>Create an account</Text><Ionicons name="arrow-forward" size={20} color="#1C2A44" /></TouchableOpacity>
        <TouchableOpacity style={s.secondary} onPress={onLogin}><Text style={s.secondaryText}>I already have an account</Text></TouchableOpacity>
        <Text style={s.terms}>By continuing, you agree to our Terms & Privacy Policy.</Text>
      </View>
    </View>
  </View>;
}
const Stat = ({ value, label }) => <View><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>;
const s = StyleSheet.create({
  page:{flex:1,backgroundColor:"#1C2A44",overflow:"hidden"},glow:{position:"absolute",width:390,height:390,borderRadius:195,backgroundColor:"#3E6650",opacity:.5,top:-170,right:-140},
  content:{flex:1,width:"100%",maxWidth:760,alignSelf:"center",paddingHorizontal:26,paddingVertical:28,justifyContent:"space-between"},brandRow:{flexDirection:"row",alignItems:"center",gap:10},logo:{width:64,height:64},brand:{color:"#F1E9D2",fontSize:24,fontWeight:"700",fontFamily:"serif"},accent:{color:"#D89A1F"},
  pill:{alignSelf:"flex-start",flexDirection:"row",gap:8,backgroundColor:"rgba(241,233,210,.08)",borderWidth:1,borderColor:"rgba(216,154,31,.35)",paddingHorizontal:13,paddingVertical:8,borderRadius:30},pillText:{color:"#E7DBBA",fontWeight:"800",letterSpacing:1.3,fontSize:10},title:{color:"#F1E9D2",fontSize:48,lineHeight:55,fontWeight:"600",fontFamily:"serif",marginTop:22,letterSpacing:-1},subtitle:{color:"#E7DBBA",fontSize:17,lineHeight:27,marginTop:18,maxWidth:570},stats:{flexDirection:"row",alignItems:"center",marginTop:32,gap:20},statValue:{color:"#D89A1F",fontSize:20,fontWeight:"800"},statLabel:{color:"#C9B98F",fontSize:11,marginTop:3,letterSpacing:.5},line:{width:1,height:35,backgroundColor:"rgba(241,233,210,.18)"},
  actions:{gap:12},primary:{height:58,borderRadius:16,backgroundColor:"#D89A1F",flexDirection:"row",alignItems:"center",justifyContent:"center",gap:10},primaryText:{color:"#1C2A44",fontWeight:"800",fontSize:16},secondary:{height:56,borderRadius:16,borderWidth:1,borderColor:"rgba(241,233,210,.35)",alignItems:"center",justifyContent:"center"},secondaryText:{color:"#F1E9D2",fontWeight:"700",fontSize:15},terms:{color:"#C9B98F",textAlign:"center",fontSize:10,marginTop:5}
});
