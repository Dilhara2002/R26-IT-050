import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { predictLandmark } from "../services/landmarkService";
import { colors } from "../src/styles/colors";

//  Helpers
function openGoogleMaps(gpsCoordinates) {
  if (!gpsCoordinates) return;
  const cleaned = gpsCoordinates
    .replace(/°\s*[NSEW]/g, "")
    .replace(/\s+/g, "")
    .trim();
  const url = `https://www.google.com/maps/search/?api=1&query=${cleaned}`;
  Linking.openURL(url).catch(() =>
    Alert.alert("Error", "Cannot open Google Maps.")
  );
}

//  Sub-components
function InfoRow({ label, value }) {
  if (!value || value.trim() === "") return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function SectionCard({ icon, title, children }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionIcon}>{icon}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

//  Main Screen
export default function LandmarkScannerScreen({ onBack, onOpenChat, navigation }) {
  const [imageUri, setImageUri]   = useState(null);
  const [imageAsset, setImageAsset] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (navigation && navigation.goBack) {
      navigation.goBack();
    }
  };

  const handleOpenChat = (customContext = null) => {
    const context = customContext || result?.metadata || (result?.class_id ? { landmark_name: result.class_id.replace(/_/g, " ") } : {});
    if (onOpenChat) {
      onOpenChat(context);
    } else if (navigation && navigation.navigate) {
      navigation.navigate("LandmarkChat", { landmarkContext: context });
    }
  };

  // Pick image from camera
  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Camera access is needed to scan landmarks.");
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!picked.canceled && picked.assets?.length > 0) {
      const asset = picked.assets[0];
      setImageUri(asset.uri);
      setImageAsset(asset);
      setResult(null);
    }
  };

  // Pick image from gallery
  const handleGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Gallery access is needed.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!picked.canceled && picked.assets?.length > 0) {
      const asset = picked.assets[0];
      setImageUri(asset.uri);
      setImageAsset(asset);
      setResult(null);
    }
  };

  // Run prediction
  const handleAnalyze = async () => {
    if (!imageAsset) {
      Alert.alert("No image", "Please take a photo or choose from gallery first.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await predictLandmark(imageAsset);
      setResult(data);
    } catch (err) {
      Alert.alert(
        "Recognition Failed",
        err.message || "Cannot connect to server. Make sure Wi-Fi is on and the AI service is running."
      );
    } finally {
      setLoading(false);
    }
  };

  // Reset
  const handleReset = () => {
    setImageUri(null);
    setImageAsset(null);
    setResult(null);
  };

  const meta = result?.metadata || {};

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      {/* ── Header ── */}
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          {(onBack || (navigation && navigation.goBack)) && (
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
              onPress={handleBack}
            >
              <Text style={styles.backBtnText}>← Back</Text>
            </Pressable>
          )}
          <View style={styles.heroRightActions}>
            <Pressable
              style={({ pressed }) => [styles.chatGuideBtn, pressed && styles.pressed]}
              onPress={() => handleOpenChat()}
            >
              <Text style={styles.chatGuideBtnText}>💬 AI Tour Guide</Text>
            </Pressable>
            <Text style={styles.aiBadge}>✦ AI Vision</Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>Landmark Scanner</Text>
        <Text style={styles.heroSubtitle}>
          Point at any Sri Lankan landmark and let AI identify it instantly.
        </Text>
      </View>

      {/* Image picker area */}
      <View style={styles.card}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.previewImage} />
        ) : (
          <View style={styles.placeholderBox}>
            <Text style={styles.placeholderIcon}>📷</Text>
            <Text style={styles.placeholderText}>No image selected</Text>
            <Text style={styles.placeholderSub}>
              Take a photo or choose from your gallery
            </Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          <Pressable
            style={({ pressed }) => [styles.pickBtn, pressed && styles.pressed]}
            onPress={handleCamera}
          >
            <Text style={styles.pickBtnText}>📸 Camera</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.pickBtn, styles.pickBtnSecondary, pressed && styles.pressed]}
            onPress={handleGallery}
          >
            <Text style={[styles.pickBtnText, styles.pickBtnTextSecondary]}>
              🖼️ Gallery
            </Text>
          </Pressable>
        </View>

        {imageUri && !loading && (
          <Pressable
            style={({ pressed }) => [styles.analyzeBtn, pressed && styles.pressed]}
            onPress={handleAnalyze}
          >
            <Text style={styles.analyzeBtnText}>Identify Landmark</Text>
            <Text style={styles.analyzeBtnIcon}>🔍</Text>
          </Pressable>
        )}

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Analyzing image with AI...</Text>
          </View>
        )}
      </View>

      {/* Result */}
      {result && result.unrecognized && (
        <View style={styles.unrecognizedCard}>
          <Text style={styles.unrecognizedIcon}>🧐</Text>
          <Text style={styles.unrecognizedTitle}>Not Sure What This Is</Text>
          <Text style={styles.unrecognizedText}>
            {result.message || "We couldn't confidently recognize a landmark in this photo."}
          </Text>
          <Text style={styles.unrecognizedHint}>
            Make sure the landmark is well-lit and clearly visible in the frame, then try again.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.resetBtn, styles.resetBtnPrimary, pressed && styles.pressed]}
            onPress={handleReset}
          >
            <Text style={[styles.resetBtnText, styles.resetBtnTextPrimary]}>Take Another Photo</Text>
          </Pressable>
        </View>
      )}

      {result && !result.unrecognized && (
        <>
          {/* Confidence badge */}
          <View style={styles.resultHero}>
            <View style={styles.confidenceBadge}>
              <Text style={styles.confidenceLabel}>Confidence</Text>
              <Text style={styles.confidenceValue}>{result.confidence}%</Text>
            </View>
            <View style={styles.resultTitleArea}>
              <Text style={styles.resultTitle}>
                {meta.landmark_name || result.class_id.replace(/_/g, " ")}
              </Text>
              {meta.category !== "" && (
                <Text style={styles.resultCategory}>{meta.category}</Text>
              )}
              {meta.province_district !== "" && (
                <Text style={styles.resultLocation}>
                  📍 {meta.province_district}
                </Text>
              )}
            </View>
          </View>

          {/* Action Buttons Row */}
          <View style={styles.actionButtonsRow}>
            {meta.gps_coordinates !== "" && (
              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.mapsBtn, pressed && styles.pressed]}
                onPress={() => openGoogleMaps(meta.gps_coordinates)}
              >
                <Text style={styles.actionBtnText}>🗺️ Maps</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [styles.actionBtn, styles.chatActionBtn, pressed && styles.pressed]}
              onPress={() => handleOpenChat()}
            >
              <Text style={styles.actionBtnText}>💬 Chat Guide</Text>
            </Pressable>
          </View>

          {/* About */}
          {meta.description !== "" && (
            <SectionCard icon="📜" title="About">
              <Text style={styles.bodyText}>{meta.description}</Text>
            </SectionCard>
          )}

          {/* History */}
          {meta.history !== "" && (
            <SectionCard icon="🏛️" title="History">
              <Text style={styles.bodyText}>{meta.history}</Text>
              <InfoRow label="Built By"   value={meta.built_by} />
              <InfoRow label="Period"     value={meta.year_built} />
              <InfoRow label="Significance" value={meta.significance} />
            </SectionCard>
          )}

          {/* Visitor info */}
          <SectionCard icon="ℹ️" title="Visitor Information">
            <InfoRow label="Opening Hours"     value={meta.opening_hours} />
            <InfoRow label="Visit Duration"    value={meta.visit_duration} />
            <InfoRow label="Ticket (Foreign)"  value={meta.ticket_price} />
            <InfoRow label="Best Time"         value={meta.best_time_to_visit} />
            <InfoRow label="Main Attractions"  value={meta.main_attractions} />
          </SectionCard>

          {/* Nearby */}
          {(meta.nearby_hotels !== "" || meta.nearby_restaurants !== "" || meta.nearby_attractions !== "") && (
            <SectionCard icon="🏨" title="Nearby">
              <InfoRow label="Hotels"      value={meta.nearby_hotels} />
              <InfoRow label="Restaurants" value={meta.nearby_restaurants} />
              <InfoRow label="Attractions" value={meta.nearby_attractions} />
            </SectionCard>
          )}

          {/* AI engine badge */}
          <Text style={styles.engineBadge}>
            Powered by: {result.engine}
          </Text>

          {/* Scan again button */}
          <Pressable
            style={({ pressed }) => [styles.resetBtn, pressed && styles.pressed]}
            onPress={handleReset}
          >
            <Text style={styles.resetBtnText}>Scan Another Landmark</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

//  Styles
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 48, maxWidth: 800, alignSelf: "center", width: "100%" },

  // Header
  hero: { backgroundColor: colors.primaryDark, borderRadius: 28, padding: 26, marginBottom: 18, borderWidth: 1, borderColor: "rgba(216,154,31,0.42)" },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  heroRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chatGuideBtn: {
    backgroundColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  chatGuideBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 12,
  },
  backBtn: {
    backgroundColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  backBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },
  aiBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.18)",
    color: "#FFFFFF",
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, fontWeight: "800",
  },
  heroTitle:    { fontSize: 32, fontWeight: "900", color: "#FFFFFF", marginBottom: 8 },
  heroSubtitle: { color: "#E7DBBA", lineHeight: 22, fontSize: 14 },

  // Image card
  card: {
    backgroundColor: colors.card, borderRadius: 24,
    padding: 18, marginBottom: 16, borderWidth: 1, borderColor: colors.border,
  },
  previewImage: {
    width: "100%", height: 240, borderRadius: 16, marginBottom: 14,
  },
  placeholderBox: {
    height: 200, borderRadius: 16, backgroundColor: colors.backgroundDeep,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1.5, borderColor: "#C9B98F",
    borderStyle: "dashed", marginBottom: 14,
  },
  placeholderIcon: { fontSize: 48, marginBottom: 10 },
  placeholderText: { fontSize: 16, fontWeight: "800", color: colors.text },
  placeholderSub:  { color: colors.muted, fontSize: 12, marginTop: 4 },

  buttonRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  pickBtn: {
    flex: 1, backgroundColor: colors.primary,
    borderRadius: 16, paddingVertical: 14,
    alignItems: "center",
  },
  pickBtnSecondary: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.primary },
  pickBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
  pickBtnTextSecondary: { color: colors.primary },

  analyzeBtn: {
    backgroundColor: colors.cinnamon, borderRadius: 18,
    paddingVertical: 18, flexDirection: "row",
    justifyContent: "center", alignItems: "center", gap: 8,
  },
  analyzeBtnText: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  analyzeBtnIcon: { fontSize: 18 },

  loadingBox: { alignItems: "center", paddingVertical: 20 },
  loadingText: { marginTop: 10, color: colors.muted, fontWeight: "600", fontSize: 13 },

  // Result hero
  resultHero: {
    backgroundColor: colors.primaryDark, borderRadius: 24,
    padding: 20, marginBottom: 12,
    flexDirection: "row", alignItems: "flex-start", gap: 16,
  },
  confidenceBadge: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 16, padding: 12, alignItems: "center", minWidth: 72,
  },
  confidenceLabel: { color: colors.backgroundDeep, fontSize: 10, fontWeight: "700" },
  confidenceValue: { color: "#FFFFFF", fontSize: 26, fontWeight: "900" },
  resultTitleArea: { flex: 1 },
  resultTitle:     { fontSize: 20, fontWeight: "900", color: "#FFFFFF", marginBottom: 4 },
  resultCategory:  { color: "#F5D98F", fontWeight: "700", fontSize: 12, marginBottom: 2 },
  resultLocation:  { color: colors.backgroundDeep, fontSize: 13, fontWeight: "600" },

  // Action Buttons Row (Maps & Chat)
  actionButtonsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 14,
  },
  mapsBtn: {
    backgroundColor: colors.primary,
  },
  chatActionBtn: {
    backgroundColor: colors.cinnamon,
  },

  // Section cards
  sectionCard: {
    backgroundColor: colors.card, borderRadius: 22,
    padding: 18, marginBottom: 12, borderWidth: 1, borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: "row", alignItems: "center",
    marginBottom: 12, gap: 8,
  },
  sectionIcon:  { fontSize: 22 },
  sectionTitle: { fontSize: 17, fontWeight: "900", color: colors.text },
  bodyText:     { color: colors.muted, lineHeight: 22, fontSize: 14, marginBottom: 10 },

  infoRow:      { flexDirection: "row", gap: 8, marginBottom: 8 },
  infoLabel:    { fontWeight: "800", color: colors.cinnamon, fontSize: 12, minWidth: 110 },
  infoValue:    { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18 },

  // Engine badge
  engineBadge: {
    textAlign: "center", color: colors.muted,
    fontSize: 11, marginBottom: 14, fontStyle: "italic",
  },

  // Reset button
  resetBtn: {
    borderWidth: 2, borderColor: colors.primary,
    borderRadius: 18, paddingVertical: 16,
    alignItems: "center", marginTop: 4,
  },
  resetBtnText: { color: colors.primary, fontWeight: "900", fontSize: 15 },
  
  // Unrecognized
  unrecognizedCard: {
    backgroundColor: "#FFF1F2", borderRadius: 24, padding: 24,
    alignItems: "center", marginBottom: 16,
    borderWidth: 2, borderColor: "#FECDD3",
  },
  unrecognizedIcon: { fontSize: 48, marginBottom: 12 },
  unrecognizedTitle: { fontSize: 22, fontWeight: "900", color: "#BE123C", marginBottom: 8 },
  unrecognizedText: { fontSize: 15, color: "#881337", textAlign: "center", marginBottom: 6 },
  unrecognizedHint: { fontSize: 13, color: "#9F1239", textAlign: "center", marginBottom: 20 },
  resetBtnPrimary: {
    backgroundColor: "#E11D48", borderColor: "#E11D48", borderWidth: 0, paddingHorizontal: 24,
  },
  resetBtnTextPrimary: { color: "#FFFFFF" },

  pressed: { opacity: 0.72 },
});
