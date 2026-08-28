import React from "react";
import { useLocalSearchParams } from "expo-router";
import LandmarkChatScreen from "../screens/LandmarkChatScreen";

export default function LandmarkChatRoute() {
  const params = useLocalSearchParams();
  const landmarkContext = params.landmarkContext
    ? JSON.parse(params.landmarkContext as string)
    : params.landmarkName
    ? { landmark_name: params.landmarkName as string }
    : null;

  return <LandmarkChatScreen landmarkContext={landmarkContext} />;
}
