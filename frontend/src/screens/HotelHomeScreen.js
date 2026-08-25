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

export default function HotelHomeScreen({ navigation }) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!prompt.trim()) {
      Alert.alert("Travel request required", "Tell us what kind of stay and activities you are looking for.");
      return;
    }
    try {
      setLoading(true);
      const data = await generateTourismPackage(prompt.trim());
      navigation.navigate("HotelResults", { packageData: data, prompt: prompt.trim() });
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
      <Text style={s.quickLabel}>QUICK IDEAS</Text>
      <View style={s.chips}>{examples.map(item=><Pressable key={item} style={s.chip} onPress={()=>setPrompt(item)}><Text style={s.chipText}>{item}</Text></Pressable>)}</View>
      <Pressable style={({pressed})=>[s.button,pressed&&s.pressed,loading&&s.disabled]} onPress={generate} disabled={loading}>
        {loading?<><ActivityIndicator color="#F1E9D2"/><Text style={s.buttonText}>Building your package...</Text></>:<><Text style={s.buttonText}>Generate Smart Package</Text><Ionicons name="arrow-forward" size={20} color="#F1E9D2"/></>}
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

const s=StyleSheet.create({
  page:{flex:1,backgroundColor:colors.background},content:{width:"100%",maxWidth:820,alignSelf:"center",padding:20,paddingBottom:48},
  hero:{backgroundColor:colors.primaryDark,borderRadius:26,padding:26,marginBottom:16,borderWidth:1,borderColor:"rgba(216,154,31,.42)",shadowColor:colors.text,shadowOpacity:.15,shadowRadius:18,shadowOffset:{width:0,height:8}},
  badge:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:7,backgroundColor:"rgba(255,255,255,.1)",borderRadius:20,paddingHorizontal:11,paddingVertical:7},badgeText:{color:colors.backgroundDeep,fontSize:10,fontWeight:"900",letterSpacing:1.2},
  title:{color:"#F1E9D2",fontSize:34,lineHeight:41,fontFamily:"serif",fontWeight:"600",marginTop:18,maxWidth:590},subtitle:{color:colors.backgroundDeep,fontSize:15,lineHeight:23,marginTop:10,maxWidth:620},
  card:{backgroundColor:colors.card,borderRadius:23,padding:20,borderWidth:1,borderColor:colors.border,shadowColor:colors.text,shadowOpacity:.09,shadowRadius:15,shadowOffset:{width:0,height:6}},cardHeader:{flexDirection:"row",alignItems:"center",gap:12,marginBottom:22},iconBox:{width:52,height:52,borderRadius:16,backgroundColor:"#F2DFCF",alignItems:"center",justifyContent:"center"},cardTitle:{color:colors.text,fontSize:21,fontFamily:"serif",fontWeight:"600"},cardSub:{color:colors.muted,fontSize:12,marginTop:3},
  label:{color:colors.cinnamon,fontSize:11,fontWeight:"900",letterSpacing:.9,marginBottom:8,textTransform:"uppercase"},inputWrap:{height:155,backgroundColor:colors.backgroundDeep,borderRadius:17,borderWidth:1,borderColor:colors.border,position:"relative"},input:{flex:1,padding:16,paddingRight:48,color:colors.text,fontSize:15,lineHeight:22},searchIcon:{position:"absolute",top:15,right:15},quickLabel:{color:colors.cinnamon,fontSize:10,fontWeight:"900",letterSpacing:1.1,marginTop:18,marginBottom:9},chips:{flexDirection:"row",flexWrap:"wrap",gap:8},chip:{backgroundColor:colors.backgroundDeep,borderWidth:1,borderColor:colors.border,borderRadius:18,paddingHorizontal:12,paddingVertical:9},chipText:{color:colors.primaryDark,fontSize:12,fontWeight:"700"},
  button:{minHeight:58,backgroundColor:colors.primary,marginTop:22,borderRadius:16,flexDirection:"row",gap:10,alignItems:"center",justifyContent:"center"},buttonText:{color:"#F1E9D2",fontWeight:"900",fontSize:15},pressed:{opacity:.8},disabled:{opacity:.65},features:{gap:11,marginTop:15},feature:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:18,padding:15,flexDirection:"row",alignItems:"center",gap:12},featureIcon:{width:42,height:42,borderRadius:13,backgroundColor:colors.backgroundDeep,alignItems:"center",justifyContent:"center"},featureCopy:{flex:1},featureTitle:{color:colors.text,fontFamily:"serif",fontWeight:"600",fontSize:16},featureText:{color:colors.muted,fontSize:12,lineHeight:18,marginTop:3}
});
