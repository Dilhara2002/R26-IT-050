import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { sendLandmarkChatMessage } from "../services/landmarkService";
import { colors } from "../src/styles/colors";

const QUICK_PROMPTS = [
  "👗 Dress code & rules",
  "🎟️ Foreigner ticket prices",
  "⏰ Opening hours & best time",
  "🏛️ History & significance",
  "🍽️ Nearby restaurants & food",
  "🏨 Nearby hotels",
];

const displayMessage = (text) => String(text || "").replace(/\*\*/g, "");

export default function LandmarkChatScreen({ landmarkContext, onBack, navigation, route }) {
  const context = landmarkContext || route?.params?.landmarkContext;
  const activeLandmark = context?.landmark_name || context?.class_id?.replace(/_/g, " ") || "";

  const initialBotMessage = activeLandmark
    ? `Ayubowan! 🙏 I'm your AI Tour Guide for **${activeLandmark}**.\n\nAsk me anything about ticket prices, dress codes, historical background, or nearby places!`
    : "Ayubowan! 🙏 I'm your Sri Lankan AI Tour Guide.\n\nAsk me about any landmark, travel etiquette, ticket prices, or recommended places to visit!";

  const [messages, setMessages] = useState([
    {
      id: "1",
      role: "assistant",
      text: initialBotMessage,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef(null);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (navigation && navigation.goBack) {
      navigation.goBack();
    }
  };

  const handleSend = async (textToSend) => {
    const query = (textToSend || inputText).trim();
    if (!query || loading) return;

    const userMsg = {
      id: Date.now().toString(),
      role: "user",
      text: query,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setLoading(true);

    try {
      // Build history for context
      const history = messages.slice(-6).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        text: m.text,
      }));

      const res = await sendLandmarkChatMessage(query, activeLandmark, history);

      const botMsg = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: res.reply || "I'm here to help with your visit to Sri Lankan landmarks!",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: "⚠️ " + (err.message || "Couldn't reach the tour guide service. Please check your connection."),
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, loading]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            onPress={handleBack}
          >
            <Text style={styles.backBtnText}>← Back</Text>
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>AI Tour Guide</Text>
            {activeLandmark ? (
              <View style={styles.landmarkChip}>
                <Text style={styles.landmarkChipText}>📍 {activeLandmark}</Text>
              </View>
            ) : (
              <Text style={styles.headerSub}>Sri Lanka Travel Companion</Text>
            )}
          </View>
          <View style={{ width: 60 }} />
        </View>

        {/* Suggested Chips */}
        <View style={styles.chipsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
            {QUICK_PROMPTS.map((prompt, index) => (
              <Pressable
                key={index}
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                onPress={() => handleSend(prompt.replace(/^[^\w\s]+/, "").trim())}
              >
                <Text style={styles.chipText}>{prompt}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Message Stream */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
        >
          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.messageRow,
                msg.role === "user" ? styles.userRow : styles.botRow,
              ]}
            >
              {msg.role === "assistant" && (
                <View style={styles.botAvatar}>
                  <Text style={styles.botAvatarText}>🤖</Text>
                </View>
              )}
              <View
                style={[
                  styles.bubble,
                  msg.role === "user" ? styles.userBubble : styles.botBubble,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    msg.role === "user" ? styles.userText : styles.botText,
                  ]}
                >
                  {displayMessage(msg.text)}
                </Text>
                <Text
                  style={[
                    styles.timeText,
                    msg.role === "user" ? styles.userTime : styles.botTime,
                  ]}
                >
                  {msg.time}
                </Text>
              </View>
            </View>
          ))}

          {loading && (
            <View style={[styles.messageRow, styles.botRow]}>
              <View style={styles.botAvatar}>
                <Text style={styles.botAvatarText}>🤖</Text>
              </View>
              <View style={[styles.bubble, styles.botBubble, styles.loadingBubble]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingText}>Tour guide is typing...</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder={
              activeLandmark
                ? `Ask about ${activeLandmark}...`
                : "Ask about any landmark..."
            }
            placeholderTextColor={colors.muted}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={() => handleSend()}
            returnKeyType="send"
            multiline={false}
          />
          <Pressable
            style={({ pressed }) => [
              styles.sendBtn,
              !inputText.trim() && styles.sendBtnDisabled,
              pressed && styles.pressed,
            ]}
            onPress={() => handleSend()}
            disabled={!inputText.trim() || loading}
          >
            <Text style={styles.sendBtnIcon}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    backgroundColor: colors.primaryDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    elevation: 4,
  },
  backBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  backBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  headerSub: {
    color: colors.backgroundDeep,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  landmarkChip: {
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 3,
  },
  landmarkChipText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  // Quick Chips
  chipsContainer: {
    backgroundColor: colors.backgroundDeep,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 8,
  },
  chipsScroll: {
    paddingHorizontal: 14,
    gap: 8,
  },
  chip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    color: colors.cinnamon,
    fontWeight: "700",
    fontSize: 12,
  },

  // Message Stream
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 14,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  userRow: {
    justifyContent: "flex-end",
  },
  botRow: {
    justifyContent: "flex-start",
  },
  botAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.backgroundDeep,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  botAvatarText: {
    fontSize: 18,
  },

  // Bubble
  bubble: {
    maxWidth: "80%",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 1,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  botBubble: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },

  messageText: {
    fontSize: 14,
    lineHeight: 21,
  },
  userText: {
    color: "#FFFFFF",
    fontWeight: "500",
  },
  botText: {
    color: colors.text,
  },
  timeText: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  userTime: {
    color: colors.backgroundDeep,
  },
  botTime: {
    color: colors.muted,
  },

  // Input Bar
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cinnamon,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: {
    backgroundColor: colors.border,
  },
  sendBtnIcon: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.75,
  },
});
