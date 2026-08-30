import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import API from "../services/api";
import {
  formatAvailableTime,
  itineraryRequestError,
  parseAvailableTime,
  validateItineraryForm,
} from "../services/itineraryValidation";
import MapPicker from "../components/MapPicker";
import { colors } from "../src/styles/colors";

const MAP_PREVIEW = { latitude: 7.2906, longitude: 80.6337 };
const CENTRAL_PROVINCE_BOUNDS = {
  minLatitude: 6.7,
  maxLatitude: 8.05,
  minLongitude: 80.4,
  maxLongitude: 81.0,
};
const LOCATION_TIMEOUT_MS = 8000;
const AVAILABLE_INTERESTS = [
  "History", "Nature", "Wildlife", "Culture", "Adventure", "City", "Beach", "Religion",
];

const isSupportedStartingPoint = (latitude, longitude) =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= CENTRAL_PROVINCE_BOUNDS.minLatitude &&
  latitude <= CENTRAL_PROVINCE_BOUNDS.maxLatitude &&
  longitude >= CENTRAL_PROVINCE_BOUNDS.minLongitude &&
  longitude <= CENTRAL_PROVINCE_BOUNDS.maxLongitude;

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new Error("location_timeout")),
      timeoutMs
    );
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

export default function HomeScreen({ navigation }) {
  const [preferences, setPreferences] = useState([]);
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radius, setRadius] = useState("");
  const [loading, setLoading] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationMessage, setLocationMessage] = useState(
    "Demo viewport: Kandy, Central Province. This is for display only; select a point, enter coordinates, or use device location."
  );
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState(null);
  const latitudeRef = useRef(null);
  const longitudeRef = useRef(null);
  const hoursRef = useRef(null);
  const radiusRef = useRef(null);

  const parsedLatitude = Number(String(latitude).trim());
  const parsedLongitude = Number(String(longitude).trim());
  const hasCoordinatePair =
    String(latitude).trim() !== "" &&
    String(longitude).trim() !== "" &&
    Number.isFinite(parsedLatitude) &&
    parsedLatitude >= -90 &&
    parsedLatitude <= 90 &&
    Number.isFinite(parsedLongitude) &&
    parsedLongitude >= -180 &&
    parsedLongitude <= 180;
  const mapLatitude = hasCoordinatePair ? parsedLatitude : MAP_PREVIEW.latitude;
  const mapLongitude = hasCoordinatePair ? parsedLongitude : MAP_PREVIEW.longitude;
  const interpretedTime = useMemo(() => {
    try { return formatAvailableTime(parseAvailableTime(hours, minutes)); }
    catch { return ""; }
  }, [hours, minutes]);

  const clearError = (field) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setRequestError(null);
  };

  const selectMapLocation = (nextLatitude, nextLongitude) => {
    if (!isSupportedStartingPoint(Number(nextLatitude), Number(nextLongitude))) {
      setLocationMessage(
        "That map point is outside the Central Province prototype area. Select a point within the Kandy, Matale, or Nuwara Eliya area."
      );
      return;
    }
    setLatitude(Number(nextLatitude).toFixed(6));
    setLongitude(Number(nextLongitude).toFixed(6));
    clearError("latitude");
    clearError("longitude");
    setLocationMessage("Map point selected. Decimal coordinates are shown below.");
  };

  const detectDeviceLocation = async () => {
    if (locationLoading) return;
    setLocationLoading(true);
    setLocationMessage("Checking device location… You can keep using the map and coordinate fields.");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationMessage(
          "Location permission was not granted. Select a Central Province point on the map or enter coordinates manually."
        );
        return;
      }
      const position = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        LOCATION_TIMEOUT_MS
      );
      const detectedLatitude = Number(position?.coords?.latitude);
      const detectedLongitude = Number(position?.coords?.longitude);
      if (!isSupportedStartingPoint(detectedLatitude, detectedLongitude)) {
        setLocationMessage(
          "Device location is outside the Central Province prototype area and was not accepted. Your existing coordinates were kept; select a valid map point or enter coordinates manually."
        );
        return;
      }
      setLatitude(detectedLatitude.toFixed(6));
      setLongitude(detectedLongitude.toFixed(6));
      clearError("latitude");
      clearError("longitude");
      setLocationMessage("Device location accepted within the Central Province prototype area.");
    } catch (error) {
      setLocationMessage(
        error?.message === "location_timeout"
          ? "Device location took too long and was not used. Select a point on the map or enter coordinates manually."
          : "Device location was unavailable. Select a point on the map or enter coordinates manually."
      );
    } finally {
      setLocationLoading(false);
    }
  };

  const togglePreference = (item) => {
    if (loading) return;
    setPreferences((current) => current.includes(item)
      ? current.filter((value) => value !== item)
      : [...current, item]);
    clearError("preferences");
  };

  const focusFirstInvalidField = (field) => {
    const refs = { latitude: latitudeRef, longitude: longitudeRef, time: hoursRef, radius: radiusRef };
    refs[field]?.current?.focus?.();
  };

  const handleGenerate = async () => {
    if (loading) return;
    const validation = validateItineraryForm({
      preferences, hours, minutes, latitude, longitude, radius,
    });
    if (!validation.valid) {
      setErrors(validation.errors);
      setRequestError({
        title: "Check your trip details",
        message: "Correct the highlighted field and try again. Your other entries have been kept.",
      });
      focusFirstInvalidField(validation.firstInvalidField);
      return;
    }
    if (!isSupportedStartingPoint(validation.values.latitude, validation.values.longitude)) {
      const scopeMessage =
        "Starting coordinates must be within the Central Province prototype area covering Kandy, Matale, and Nuwara Eliya.";
      setErrors((current) => ({
        ...current,
        latitude: scopeMessage,
        longitude: scopeMessage,
      }));
      setRequestError({ title: "Choose a supported starting point", message: scopeMessage });
      focusFirstInvalidField("latitude");
      return;
    }
    setErrors({});
    setRequestError(null);
    setLoading(true);
    try {
      const payload = {
        preferences: validation.values.preferences,
        max_time_minutes: validation.values.totalMinutes,
        current_lat: validation.values.latitude,
        current_lon: validation.values.longitude,
        ...(validation.values.radiusKm === null ? {} : { radius_km: validation.values.radiusKm }),
      };
      const response = await API.post("/optimize", payload);
      if (response.data?.status === "success" && response.data?.data) {
        navigation.navigate("ItineraryResult", {
          data: response.data.data,
          persistence: response.data.persistence,
        });
        return;
      }
      setRequestError({
        title: "No feasible itinerary found",
        message: response.data?.message || "The bounded verified catalogue could not produce a route for these constraints.",
      });
    } catch (error) {
      setRequestError(itineraryRequestError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>SMART ITINERARY · CENTRAL PROVINCE</Text>
        <Text style={styles.title}>Plan a realistic day around what you enjoy</Text>
        <Text style={styles.subtitle}>
          Choose a start, interests, time budget, and optional travel radius. The planner uses a bounded catalogue of 40 source-traced places.
        </Text>
      </View>

      <View style={styles.card}>
        <StepHeader number="1" title="Starting location">
          Required · Tap the map or enter decimal latitude and longitude, for example 7.290600 and 80.633700.
        </StepHeader>
        <View style={styles.mapContainer}>
          <MapPicker
            lat={mapLatitude}
            lon={mapLongitude}
            hasSelection={hasCoordinatePair}
            onSelect={selectMapLocation}
            onReady={() => setMapLoading(false)}
          />
          {mapLoading || locationLoading ? (
            <View pointerEvents="none" style={styles.mapStatusOverlay}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.mapStatusText}>
                {mapLoading ? "Loading map…" : "Checking device location…"}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.locationMessage}>{locationMessage}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: locationLoading }}
          disabled={locationLoading}
          onPress={detectDeviceLocation}
          style={({ pressed }) => [
            styles.locationButton,
            locationLoading && styles.disabledButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.locationButtonText}>
            {locationLoading ? "Checking device location…" : "Use device location"}
          </Text>
        </Pressable>
        <View style={styles.inputRow}>
          <Field label="Latitude" error={errors.latitude} style={styles.inputColumn}>
            <TextInput
              ref={latitudeRef}
              accessibilityLabel="Starting latitude"
              value={latitude}
              onChangeText={(value) => { setLatitude(value); clearError("latitude"); }}
              placeholder="7.290600"
              placeholderTextColor={colors.muted}
              keyboardType="numbers-and-punctuation"
              editable={!loading}
              style={[styles.input, errors.latitude && styles.inputError]}
            />
          </Field>
          <Field label="Longitude" error={errors.longitude} style={styles.inputColumn}>
            <TextInput
              ref={longitudeRef}
              accessibilityLabel="Starting longitude"
              value={longitude}
              onChangeText={(value) => { setLongitude(value); clearError("longitude"); }}
              placeholder="80.633700"
              placeholderTextColor={colors.muted}
              keyboardType="numbers-and-punctuation"
              editable={!loading}
              style={[styles.input, errors.longitude && styles.inputError]}
            />
          </Field>
        </View>
      </View>

      <View style={styles.card}>
        <StepHeader number="2" title="Interests">
          Required · Select at least one. These categories feed the relevance classifier; they are not free-text search.
        </StepHeader>
        <View style={styles.chips} accessibilityRole="group" accessibilityLabel="Travel interests">
          {AVAILABLE_INTERESTS.map((item) => {
            const selected = preferences.includes(item);
            return (
              <Pressable
                key={item}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled: loading }}
                disabled={loading}
                onPress={() => togglePreference(item)}
                style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {selected ? "✓ " : "+ "}{item}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {errors.preferences ? <Text style={styles.fieldError}>{errors.preferences}</Text> : null}
      </View>

      <View style={styles.card}>
        <StepHeader number="3" title="Available time">
          Required · Enter whole hours and minutes. Minutes must be 0–59; total time must be greater than zero and no more than 24 hours.
        </StepHeader>
        <View style={styles.inputRow}>
          <Field label="Hours" style={styles.inputColumn}>
            <TextInput
              ref={hoursRef}
              accessibilityLabel="Available whole hours"
              value={hours}
              onChangeText={(value) => { setHours(value); clearError("time"); }}
              placeholder="4"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={2}
              editable={!loading}
              style={[styles.input, errors.time && styles.inputError]}
            />
          </Field>
          <Field label="Minutes" style={styles.inputColumn}>
            <TextInput
              accessibilityLabel="Available minutes from zero to fifty-nine"
              value={minutes}
              onChangeText={(value) => { setMinutes(value); clearError("time"); }}
              placeholder="30"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={2}
              editable={!loading}
              style={[styles.input, errors.time && styles.inputError]}
            />
          </Field>
        </View>
        {errors.time ? <Text style={styles.fieldError}>{errors.time}</Text> : null}
        {interpretedTime ? (
          <Text accessibilityLiveRegion="polite" style={styles.interpretedTime}>Planner time budget: {interpretedTime}</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <StepHeader number="4" title="Travel radius">
          Optional · 0.1–100 km from your start. A smaller radius narrows candidates; leave blank for the planner’s time-based radius.
        </StepHeader>
        <Field label="Maximum radius (km)" error={errors.radius}>
          <TextInput
            ref={radiusRef}
            accessibilityLabel="Optional maximum travel radius in kilometres"
            value={radius}
            onChangeText={(value) => { setRadius(value); clearError("radius"); }}
            placeholder="For example, 15"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            editable={!loading}
            style={[styles.input, errors.radius && styles.inputError]}
          />
        </Field>
      </View>

      {requestError ? (
        <View accessibilityLiveRegion="assertive" style={styles.errorBanner}>
          <Text style={styles.errorTitle}>{requestError.title}</Text>
          <Text style={styles.errorMessage}>{requestError.message}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityHint="Creates a feasible route from the verified Central Province catalogue"
        accessibilityState={{ disabled: loading, busy: loading }}
        disabled={loading}
        onPress={handleGenerate}
        style={({ pressed }) => [styles.generateButton, loading && styles.disabledButton, pressed && styles.pressed]}
      >
        {loading ? <ActivityIndicator color="#FFFFFF" /> : null}
        <View style={styles.generateCopy}>
          <Text style={styles.generateTitle}>{loading ? "Building your itinerary…" : "Generate Smart Itinerary"}</Text>
          <Text style={styles.generateSubtext}>
            {loading ? "Selecting a feasible stop set and ordering the route" : "Your entries stay here if a correction is needed"}
          </Text>
        </View>
      </Pressable>
      <Text style={styles.scopeNote}>
        Planning note: travel uses estimated straight-line distance, not live traffic or real-road routing. Safety evidence is handled separately by the existing Safety Analyzer.
      </Text>
    </ScrollView>
  );
}

function StepHeader({ number, title, children }) {
  return (
    <View style={styles.stepHeader}>
      <Text style={styles.stepNumber}>{number}</Text>
      <View style={styles.stepCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.helperText}>{children}</Text>
      </View>
    </View>
  );
}

function Field({ label, error, children, style }) {
  return (
    <View style={style}>
      <Text style={styles.inputLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 820, alignSelf: "center", padding: 20, paddingBottom: 50 },
  hero: { backgroundColor: colors.primaryDark, borderRadius: 25, padding: 25, marginBottom: 16, borderWidth: 1, borderColor: "rgba(216,154,31,.42)" },
  eyebrow: { color: colors.turmeric, fontSize: 10, fontWeight: "900", letterSpacing: 1.3, marginBottom: 10 },
  title: { color: "#F1E9D2", fontSize: 31, lineHeight: 38, fontWeight: "600", fontFamily: "serif", maxWidth: 720 },
  subtitle: { color: colors.backgroundDeep, fontSize: 14, lineHeight: 22, marginTop: 10, maxWidth: 760 },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: colors.border, elevation: 2 },
  stepHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16 },
  stepNumber: { width: 34, height: 34, borderRadius: 17, textAlign: "center", backgroundColor: colors.backgroundDeep, color: colors.cinnamon, fontWeight: "900", fontSize: 16, marginRight: 12, paddingTop: 7 },
  stepCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: "600", fontFamily: "serif" },
  helperText: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 4 },
  mapContainer: { height: 260, width: "100%", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundDeep },
  mapStatusOverlay: { position: "absolute", left: 12, right: 12, bottom: 12, padding: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.94)", flexDirection: "row", alignItems: "center", justifyContent: "center" },
  mapStatusText: { color: "#1E3A5F", fontWeight: "700", marginLeft: 8 },
  locationMessage: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 9, marginBottom: 12 },
  locationButton: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", backgroundColor: colors.backgroundDeep, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, marginBottom: 12 },
  locationButtonText: { color: colors.primary, fontWeight: "900" },
  inputRow: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  inputColumn: { flexGrow: 1, flexBasis: 220, minWidth: 0, paddingHorizontal: 5, marginBottom: 8 },
  inputLabel: { color: colors.cinnamon, fontSize: 12, fontWeight: "800", marginBottom: 7 },
  input: { width: "100%", minHeight: 52, backgroundColor: colors.backgroundDeep, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 15 },
  inputError: { borderColor: "#DC2626", backgroundColor: "#FEF2F2" },
  fieldError: { color: "#B91C1C", fontSize: 13, lineHeight: 19, fontWeight: "700", marginTop: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", margin: -4 },
  chip: { minHeight: 44, justifyContent: "center", backgroundColor: colors.backgroundDeep, borderWidth: 1, borderColor: colors.border, borderRadius: 22, paddingHorizontal: 15, paddingVertical: 10, margin: 4 },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 14, fontWeight: "800" },
  chipTextSelected: { color: "#FFFFFF" },
  interpretedTime: { color: "#166534", backgroundColor: "#F0FDF4", borderRadius: 10, padding: 10, fontWeight: "800", marginTop: 4 },
  errorBanner: { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5", borderWidth: 1, borderRadius: 16, padding: 15, marginBottom: 14 },
  errorTitle: { color: "#991B1B", fontSize: 16, fontWeight: "900" },
  errorMessage: { color: "#B91C1C", lineHeight: 20, marginTop: 4 },
  generateButton: { minHeight: 58, backgroundColor: colors.primary, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  generateCopy: { marginLeft: 10, flexShrink: 1, alignItems: "center" },
  generateTitle: { color: "#FFFFFF", fontSize: 17, lineHeight: 22, fontWeight: "900", textAlign: "center" },
  generateSubtext: { color: colors.backgroundDeep, fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: 2 },
  disabledButton: { opacity: 0.58 },
  pressed: { opacity: 0.78 },
  scopeNote: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 14, paddingHorizontal: 8 },
});
