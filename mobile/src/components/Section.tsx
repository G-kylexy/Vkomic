import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { palette, radius, spacing, shadow } from "../theme";

// Carte "section" réutilisable (style proche desktop: surface + border + shadow).
// Sert à structurer les écrans (titre, sous-titre, contenu).
interface SectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export const Section: React.FC<SectionProps> = ({
  title,
  subtitle,
  children,
  style,
}) => {
  return (
    <View style={[styles.container, shadow.card, style]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.md,
    gap: 4,
  },
  title: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    color: palette.muted,
    fontSize: 13,
  },
  body: {
    gap: spacing.sm,
  },
});
