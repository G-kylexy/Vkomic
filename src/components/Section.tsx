import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { useVk } from "../context/VkContext";
import { radius, shadow, spacing } from "../theme";

interface SectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

// Wrapper conservant l'API existante, avec le nouveau rendu "case de BD".
export const Section: React.FC<SectionProps> = ({
  title,
  subtitle,
  children,
  style,
}) => {
  const { activePalette: palette } = useVk();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: palette.card,
          borderColor: `${palette.border}80`,
          borderWidth: 1,
          borderRadius: radius.lg,
        },
        shadow.card,
        style,
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: palette.muted }]}>{subtitle}</Text> : null}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.md,
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 13,
  },
  body: {
    gap: spacing.sm,
  },
});
