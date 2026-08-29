import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../styles/colors";
import { getVehiclePricing, updateVehiclePricing } from "../api/adminApi";

const today = () => new Date().toISOString().slice(0, 10);

export default function AdminPricingScreen({ user, token, onLogout }) {
  const [vehicles, setVehicles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ baseHireCharge: "", rentalPricePerKm: "", source: "", effectiveDate: today() });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setLoading(true); setVehicles(await getVehiclePricing(token)); }
    catch (error) { Alert.alert("Unable to load pricing", error.response?.data?.message || error.message); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const edit = (vehicle) => {
    setSelected(vehicle);
    setForm({
      baseHireCharge: String(vehicle.baseHireCharge), rentalPricePerKm: String(vehicle.rentalPricePerKm),
      source: vehicle.verified ? vehicle.source : "", effectiveDate: vehicle.effectiveDate ? String(vehicle.effectiveDate).slice(0, 10) : today(),
    });
  };
  const save = async () => {
    if (!(Number(form.baseHireCharge) > 0) || !(Number(form.rentalPricePerKm) > 0) || !form.source.trim()) {
      return Alert.alert("Missing information", "Enter positive rates and the verified provider/source.");
    }
    try {
      setSaving(true);
      await updateVehiclePricing(token, selected.vehicleName, { ...form, baseHireCharge: Number(form.baseHireCharge), rentalPricePerKm: Number(form.rentalPricePerKm) });
      setSelected(null); await load(); Alert.alert("Pricing updated", "New trips will use this verified rate.");
    } catch (error) { Alert.alert("Update failed", error.response?.data?.message || error.message); }
    finally { setSaving(false); }
  };

  const query = search.trim().toLowerCase();
  const filteredVehicles = vehicles.filter((vehicle) => !query || [
    vehicle.vehicleName,
    vehicle.category,
    vehicle.source,
    vehicle.verified ? "verified" : "baseline",
  ].some((value) => String(value || "").toLowerCase().includes(query)));

  return <ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <View style={s.top}><View><Text style={s.eyebrow}>ADMIN PORTAL</Text><Text style={s.title}>Vehicle pricing</Text><Text style={s.subtitle}>Signed in as {user?.email}</Text></View><TouchableOpacity style={s.logout} onPress={onLogout}><Ionicons name="log-out-outline" size={19} color={colors.cinnamon}/><Text style={s.logoutText}>Sign out</Text></TouchableOpacity></View>
    <View style={s.notice}><Ionicons name="shield-checkmark" size={22} color={colors.primary}/><Text style={s.noticeText}>Only verified rates saved here override the research dataset. Every update records its source and effective date.</Text></View>
    {selected && <View style={s.editor}><View style={s.editorHead}><Text style={s.editorTitle}>{selected.vehicleName}</Text><TouchableOpacity onPress={() => setSelected(null)}><Ionicons name="close" size={24} color={colors.muted}/></TouchableOpacity></View>
      <View style={s.fields}><Field label="Base hire charge (LKR)" value={form.baseHireCharge} onChangeText={(v)=>setForm({...form,baseHireCharge:v})} keyboardType="numeric"/><Field label="Rate per km (LKR)" value={form.rentalPricePerKm} onChangeText={(v)=>setForm({...form,rentalPricePerKm:v})} keyboardType="numeric"/><Field label="Verified source / provider" value={form.source} onChangeText={(v)=>setForm({...form,source:v})} placeholder="Example: ABC Car Rentals"/><Field label="Effective date (YYYY-MM-DD)" value={form.effectiveDate} onChangeText={(v)=>setForm({...form,effectiveDate:v})}/></View>
      <TouchableOpacity style={s.save} onPress={save} disabled={saving}>{saving?<ActivityIndicator color="#F1E9D2"/>:<><Ionicons name="save-outline" size={20} color="#F1E9D2"/><Text style={s.saveText}>Save verified rate</Text></>}</TouchableOpacity>
    </View>}
    <View style={s.sectionRow}><View><Text style={s.sectionTitle}>All vehicle models</Text>{!loading&&<Text style={s.resultCount}>{filteredVehicles.length} of {vehicles.length} vehicles</Text>}</View><TouchableOpacity onPress={load}><Ionicons name="refresh" size={21} color={colors.primary}/></TouchableOpacity></View>
    <View style={s.searchWrap}><Ionicons name="search-outline" size={21} color={colors.muted}/><TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search vehicle, category or source..." placeholderTextColor="#8B8172" autoCapitalize="none" autoCorrect={false}/>{search.length>0&&<TouchableOpacity onPress={()=>setSearch("")} accessibilityLabel="Clear search"><Ionicons name="close-circle" size={21} color={colors.muted}/></TouchableOpacity>}</View>
    {loading?<ActivityIndicator color={colors.primary} size="large"/>:filteredVehicles.length===0?<View style={s.empty}><Ionicons name="search-outline" size={30} color={colors.muted}/><Text style={s.emptyTitle}>No vehicles found</Text><Text style={s.emptyText}>Try a different vehicle name, category or source.</Text></View>:filteredVehicles.map((vehicle)=><TouchableOpacity key={vehicle.vehicleName} style={s.card} onPress={()=>edit(vehicle)}>
      <View style={s.cardCopy}><View style={s.nameRow}><Text style={s.name}>{vehicle.vehicleName}</Text><View style={[s.badge,vehicle.verified&&s.badgeVerified]}><Text style={[s.badgeText,vehicle.verified&&s.badgeTextVerified]}>{vehicle.verified?"VERIFIED":"BASELINE"}</Text></View></View><Text style={s.meta}>{vehicle.category} · {vehicle.source}</Text><Text style={s.rate}>LKR {Number(vehicle.baseHireCharge).toLocaleString()} base + LKR {Number(vehicle.rentalPricePerKm).toLocaleString()}/km</Text></View><Ionicons name="create-outline" size={22} color={colors.cinnamon}/>
    </TouchableOpacity>)}
  </ScrollView>;
}
function Field({label,...props}){return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput style={s.input} placeholderTextColor="#94A3B8" {...props}/></View>}
const s=StyleSheet.create({page:{flex:1,backgroundColor:colors.background},content:{width:"100%",maxWidth:920,alignSelf:"center",padding:22,paddingBottom:50},top:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:18},eyebrow:{fontSize:10,fontWeight:"900",letterSpacing:2,color:colors.cinnamon},title:{fontSize:30,fontWeight:"600",fontFamily:"serif",color:colors.text,marginTop:4},subtitle:{fontSize:12,color:colors.muted,marginTop:4},logout:{flexDirection:"row",gap:7,alignItems:"center",padding:11,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:12},logoutText:{color:colors.cinnamon,fontWeight:"800"},notice:{flexDirection:"row",gap:12,backgroundColor:colors.backgroundDeep,borderWidth:1,borderColor:"#C9B98F",borderRadius:16,padding:16,marginBottom:18},noticeText:{flex:1,color:colors.muted,lineHeight:20,fontSize:13},editor:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:20,padding:19,marginBottom:22},editorHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:15},editorTitle:{fontSize:20,fontWeight:"700",fontFamily:"serif",color:colors.text,flex:1},fields:{flexDirection:"row",flexWrap:"wrap",gap:12},field:{flexGrow:1,flexBasis:"45%",minWidth:230},label:{fontSize:10,fontWeight:"900",letterSpacing:.7,color:colors.cinnamon,marginBottom:7,textTransform:"uppercase"},input:{height:50,borderRadius:12,backgroundColor:colors.backgroundDeep,borderWidth:1,borderColor:colors.border,paddingHorizontal:14,color:colors.text},save:{height:52,borderRadius:13,backgroundColor:colors.primaryDark,alignItems:"center",justifyContent:"center",flexDirection:"row",gap:9,marginTop:16},saveText:{color:"#F1E9D2",fontWeight:"800"},sectionRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:12},sectionTitle:{fontSize:20,fontWeight:"600",fontFamily:"serif",color:colors.text},resultCount:{fontSize:11,color:colors.muted,marginTop:3},searchWrap:{height:54,flexDirection:"row",alignItems:"center",gap:10,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:15,paddingHorizontal:16,marginBottom:15},searchInput:{flex:1,height:"100%",fontSize:14,color:colors.text,outlineStyle:"none"},empty:{alignItems:"center",backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:16,padding:32},emptyTitle:{fontSize:16,fontWeight:"800",color:colors.text,marginTop:9},emptyText:{fontSize:12,color:colors.muted,marginTop:5,textAlign:"center"},card:{flexDirection:"row",alignItems:"center",gap:14,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:16,padding:16,marginBottom:10},cardCopy:{flex:1},nameRow:{flexDirection:"row",alignItems:"center",gap:9,flexWrap:"wrap"},name:{fontWeight:"800",fontSize:15,color:colors.text},badge:{backgroundColor:"#F5E7BE",borderRadius:10,paddingHorizontal:7,paddingVertical:3},badgeVerified:{backgroundColor:"#DDEADF"},badgeText:{fontSize:8,fontWeight:"900",color:colors.warning},badgeTextVerified:{color:colors.primary},meta:{fontSize:11,color:colors.muted,marginTop:5},rate:{fontSize:13,color:colors.primary,fontWeight:"700",marginTop:7}});
