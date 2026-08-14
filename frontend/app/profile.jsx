import React from "react";
import { Text, View } from "react-native";
import Page, { sharedStyles as s } from "../src/components/shared/Page";
export default function Profile() { return <Page title="Profile" subtitle="Account support is intentionally deferred until a complete authentication system is designed."><View style={s.card}><Text style={s.muted}>You can use the complete planning flow without signing in.</Text></View></Page>; }
