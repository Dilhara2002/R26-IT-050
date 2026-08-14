import React from "react";
import { Text, View } from "react-native";
import Page, { sharedStyles as s } from "../src/components/shared/Page";
export default function Trips() { return <Page title="Trips" subtitle="Saved trips can be added when user accounts are introduced."><View style={s.card}><Text style={s.muted}>Your current trip remains available while this app session is open.</Text></View></Page>; }
