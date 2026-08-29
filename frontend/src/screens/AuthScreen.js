import React, { useState } from "react";
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../styles/colors";

export default function AuthScreen({ mode, onSubmit, onBack, onSwitch }) {
  const register = mode === "register";
  const admin = mode === "adminLogin";
  const [name,setName]=useState(""), [email,setEmail]=useState(""), [password,setPassword]=useState(""), [confirm,setConfirm]=useState(""), [visible,setVisible]=useState(false), [error,setError]=useState(""), [loading,setLoading]=useState(false);
  const submit=async()=>{ if(register&&!name.trim())return setError("Please enter your full name."); if(!/^\S+@\S+\.\S+$/.test(email.trim()))return setError("Please enter a valid email address."); if(password.length<6)return setError("Password must contain at least 6 characters."); if(register&&password!==confirm)return setError("Passwords do not match."); try{setError("");setLoading(true);await onSubmit({name,email:email.trim(),password,register});}catch(e){setError(e.message||"Sign in failed.");}finally{setLoading(false);} };
  return <ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <TouchableOpacity style={s.back} onPress={onBack}><Ionicons name="arrow-back" size={22} color={colors.text}/></TouchableOpacity>
    <View style={s.brand}>
      <Image source={require("../../assets/ceylongo-logo.png")} style={s.logo} resizeMode="contain" accessibilityLabel="CeylonGo logo" />
      <Text style={s.title}>{register?"Start your journey":admin?"Administrator access":"Welcome back"}</Text>
      <Text style={s.subtitle}>{register?"Create your CeylonGo account and explore smarter.":admin?"Sign in with the protected administrator account to manage verified vehicle rates.":"Sign in to continue planning your Sri Lankan adventure."}</Text>
    </View>
    <View style={s.form}>
      {register&&<Field label="Full name" icon="person-outline" value={name} onChangeText={setName} placeholder="Your full name"/>}
      <Field label="Email address" icon="mail-outline" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none"/>
      <View><Text style={s.label}>Password</Text><View style={s.inputWrap}><Ionicons name="lock-closed-outline" size={20} color={colors.muted}/><TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="At least 6 characters" placeholderTextColor="#94A3B8" secureTextEntry={!visible}/><TouchableOpacity onPress={()=>setVisible(!visible)}><Ionicons name={visible?"eye-off-outline":"eye-outline"} size={21} color={colors.muted}/></TouchableOpacity></View></View>
      {register&&<Field label="Confirm password" icon="shield-checkmark-outline" value={confirm} onChangeText={setConfirm} placeholder="Enter password again" secureTextEntry={!visible}/>} 
      {!!error&&<View style={s.error}><Ionicons name="alert-circle" size={18} color="#B91C1C"/><Text style={s.errorText}>{error}</Text></View>}
      {!register&&!admin&&<TouchableOpacity><Text style={s.forgot}>Forgot password?</Text></TouchableOpacity>}
      <TouchableOpacity style={s.submit} onPress={submit} disabled={loading}><Text style={s.submitText}>{loading?"Please wait...":register?"Create account":"Sign in"}</Text><Ionicons name="arrow-forward" size={20} color="#fff"/></TouchableOpacity>
    </View>
    {!admin&&<View style={s.switchRow}><Text style={s.switchText}>{register?"Already have an account?":"New to CeylonGo?"}</Text><TouchableOpacity onPress={onSwitch}><Text style={s.switchLink}>{register?" Sign in":" Create account"}</Text></TouchableOpacity></View>}
  </ScrollView>;
}
function Field({label,icon,...props}){return <View><Text style={s.label}>{label}</Text><View style={s.inputWrap}><Ionicons name={icon} size={20} color={colors.muted}/><TextInput style={s.input} placeholderTextColor="#94A3B8" {...props}/></View></View>}
const s=StyleSheet.create({page:{flex:1,backgroundColor:colors.background},content:{width:"100%",maxWidth:540,alignSelf:"center",padding:24,paddingBottom:50},back:{width:44,height:44,borderRadius:14,backgroundColor:colors.card,alignItems:"center",justifyContent:"center",marginBottom:6,borderWidth:1,borderColor:colors.border},brand:{alignItems:"center",marginBottom:26},logo:{width:172,height:172},title:{color:colors.text,fontSize:34,fontWeight:"600",fontFamily:"serif",marginTop:2,textAlign:"center"},subtitle:{color:colors.muted,fontSize:15,lineHeight:23,marginTop:8,textAlign:"center",maxWidth:430},form:{gap:18,backgroundColor:colors.card,borderRadius:22,borderWidth:1,borderColor:colors.border,padding:20,elevation:2,shadowColor:colors.text,shadowOffset:{width:0,height:4},shadowOpacity:.1,shadowRadius:8},label:{fontSize:11,fontWeight:"800",letterSpacing:.8,color:colors.cinnamon,marginBottom:8,textTransform:"uppercase"},inputWrap:{height:56,borderRadius:14,backgroundColor:colors.backgroundDeep,borderWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",paddingHorizontal:16,gap:11},input:{flex:1,height:"100%",fontSize:15,color:colors.text},forgot:{color:colors.cinnamon,fontWeight:"700",textAlign:"right",marginTop:-5},error:{flexDirection:"row",gap:8,padding:12,borderRadius:12,backgroundColor:"#FEF2F2"},errorText:{color:"#B91C1C",fontSize:13,flex:1},submit:{height:58,borderRadius:15,backgroundColor:colors.primaryDark,alignItems:"center",justifyContent:"center",flexDirection:"row",gap:10},submitText:{color:"#F1E9D2",fontSize:16,fontWeight:"800"},switchRow:{flexDirection:"row",justifyContent:"center",marginTop:28},switchText:{color:colors.muted},switchLink:{color:colors.cinnamon,fontWeight:"800"}});
