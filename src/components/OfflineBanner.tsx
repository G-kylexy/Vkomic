import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useVk } from "../context/VkContext";

export const OfflineBanner: React.FC = () => {
  const { isOffline, activePalette: p } = useVk();

  if (!isOffline) return null;

  return (
    <View style={[styles.banner, { backgroundColor: p.warning }]}>
      <Ionicons name="cloud-offline" size={16} color="#000" />
      <Text style={styles.text}>Mode hors-ligne</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  text: {
    color: "#000",
    fontSize: 12,
    fontWeight: "800",
  },
});
