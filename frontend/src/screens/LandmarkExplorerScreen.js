import React, { useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { recognizeLandmark } from "../api/landmarkApi";
import { colors } from "../styles/colors";

const detailKeys = ["Basic Info", "History", "Cultural Significance", "Opening Hours", "Ticket Info", "Best Time to Visit", "Things to do", "Nearby Hotels", "Nearby Attractions", "Transport Options", "Accessibility", "Duration"];

export default function LandmarkExplorerScreen() {
  const [asset, setAsset] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const chooseImage = async () => {
    const picker = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (!picker.canceled && picker.assets?.[0]) {
      setAsset(picker.assets[0]);
      setResult(null);
      setError("");
    }
  };

  const identify = async () => {
    if (!asset) return;
    try {
      setLoading(true); setError("");
      setResult(await recognizeLandmark(asset));
    } catch (err) {
      setError(err.message || "Could not identify this landmark.");
    } finally { setLoading(false); }
  };

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <View style={styles.hero}><View style={styles.badge}><Ionicons name="camera" size={15} color="#FCD34D"/><Text style={styles.badgeText}>AI LANDMARK DISCOVERY</Text></View><Text style={styles.title}>See it. Scan it.{"\n"}<Text style={styles.accent}>Discover its story.</Text></Text><Text style={styles.subtitle}>Upload a photo of a Sri Lankan landmark to identify it and uncover helpful visitor information.</Text></View>
    <View style={styles.card}>
      <TouchableOpacity style={styles.upload} onPress={chooseImage}>{asset?<Image source={{uri:asset.uri}} style={styles.preview}/>:<><View style={styles.uploadIcon}><Ionicons name="image-outline" size={34} color={colors.primary}/></View><Text style={styles.uploadTitle}>Choose a landmark photo</Text><Text style={styles.uploadText}>Select a clear JPG or PNG image</Text></>}</TouchableOpacity>
      <TouchableOpacity style={[styles.identify,(!asset||loading)&&styles.disabled]} onPress={identify} disabled={!asset||loading}>{loading?<ActivityIndicator color="#FFFFFF"/>:<><Ionicons name="sparkles" size={19} color="#FFFFFF"/><Text style={styles.identifyText}>Identify Landmark</Text></>}</TouchableOpacity>
      {!!error&&<View style={styles.error}><Ionicons name="alert-circle" size={19} color="#B91C1C"/><Text style={styles.errorText}>{error}</Text></View>}
    </View>
    {result&&<View style={styles.resultCard}><Text style={styles.eyebrow}>LANDMARK IDENTIFIED</Text><Text style={styles.landmark}>{result.landmark}</Text><Text style={styles.confidence}>{Math.round(Number(result.confidence||0)*100)}% recognition confidence</Text>{detailKeys.filter(key=>result[key]).map(key=><View style={styles.detail} key={key}><Text style={styles.detailLabel}>{key}</Text><Text style={styles.detailText}>{result[key]}</Text></View>)}</View>}
  </ScrollView>;
}

const styles=StyleSheet.create({page:{flex:1,backgroundColor:colors.background},content:{width:"100%",maxWidth:820,alignSelf:"center",padding:20,paddingBottom:50},hero:{backgroundColor:colors.primaryDark,borderRadius:26,padding:26,marginBottom:16,borderWidth:1,borderColor:"rgba(216,154,31,.42)"},badge:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:7,backgroundColor:"rgba(255,255,255,.12)",borderRadius:20,paddingHorizontal:11,paddingVertical:7},badgeText:{color:"#E7DBBA",fontSize:10,fontWeight:"900",letterSpacing:1.2},title:{color:"#FFFFFF",fontSize:31,lineHeight:38,fontWeight:"600",fontFamily:"serif",marginTop:18},accent:{color:"#D89A1F"},subtitle:{color:"#E7DBBA",fontSize:14,lineHeight:22,marginTop:10},card:{backgroundColor:"#FBF7EC",borderRadius:22,padding:18,borderWidth:1,borderColor:colors.border,shadowColor:"#241F18",shadowOpacity:.09,shadowRadius:16,shadowOffset:{width:0,height:7}},upload:{minHeight:230,borderRadius:18,borderWidth:1.5,borderStyle:"dashed",borderColor:"#C9B98F",backgroundColor:"#E7DBBA",alignItems:"center",justifyContent:"center",overflow:"hidden"},preview:{width:"100%",height:260,resizeMode:"cover"},uploadIcon:{width:66,height:66,borderRadius:22,backgroundColor:"#F1E9D2",alignItems:"center",justifyContent:"center"},uploadTitle:{color:colors.text,fontSize:16,fontWeight:"600",fontFamily:"serif",marginTop:14},uploadText:{color:colors.muted,fontSize:12,marginTop:5},identify:{height:56,borderRadius:16,backgroundColor:colors.primary,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:9,marginTop:14},disabled:{opacity:.5},identifyText:{color:"#FFFFFF",fontSize:15,fontWeight:"900"},error:{flexDirection:"row",gap:8,backgroundColor:"#FEF2F2",borderRadius:13,padding:13,marginTop:12},errorText:{color:"#B91C1C",flex:1,fontSize:13},resultCard:{backgroundColor:"#FBF7EC",borderRadius:22,padding:20,borderWidth:1,borderColor:colors.border,marginTop:16},eyebrow:{color:colors.cinnamon,fontSize:10,fontWeight:"900",letterSpacing:1.3},landmark:{color:colors.text,fontSize:25,fontWeight:"600",fontFamily:"serif",marginTop:6},confidence:{color:"#15803D",fontSize:12,fontWeight:"800",backgroundColor:"#F0FDF4",alignSelf:"flex-start",paddingHorizontal:10,paddingVertical:6,borderRadius:20,marginTop:9,marginBottom:8},detail:{paddingVertical:14,borderTopWidth:1,borderTopColor:colors.border},detailLabel:{color:colors.cinnamon,fontSize:12,fontWeight:"900",marginBottom:5},detailText:{color:colors.muted,fontSize:14,lineHeight:21}});
