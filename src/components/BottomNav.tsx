import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { getT } from "../i18n";
import { useVk } from "../context/VkContext";
import { useAppData } from "../context/AppDataContext";
import { radius, spacing, tabAccents } from "../theme";

type TabId = "home" | "library" | "downloads" | "settings";

// Association "onglet -> icône" (Ionicons) pour reproduire une navigation type app mobile.
const ICONS: Record<TabId, keyof typeof Ionicons.glyphMap> = {
  home: "cloud-outline", // Home = navigateur VK (distant)
  library: "library-outline", // Bibliothèque = fichiers locaux
  downloads: "download-outline",
  settings: "settings-outline",
};

interface BottomNavProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  downloadsCount?: number;
}

// Barre de navigation fixe en bas (remplace la sidebar desktop).
// - `activeTab`: onglet sélectionné
// - `downloadsCount`: badge optionnel pour indiquer une file de téléchargements
export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  downloadsCount,
}) => {
  const { language, activePalette: palette } = useVk();
  const t = getT(language);
  const { downloads, goHome, setSearchQuery } = useAppData();

  const effectiveDownloadsCount =
    typeof downloadsCount === "number"
      ? downloadsCount
      : downloads.filter((d) => ["pending", "downloading", "paused"].includes(d.status))
        .length;

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "home", label: t.nav.home },
    { id: "library", label: t.nav.library },
    { id: "downloads", label: t.nav.downloads },
    { id: "settings", label: t.nav.settings },
  ];

  const barColors = [`${palette.surface}F2`, `${palette.background}FA`] as const;
  const activeAccent = tabAccents[activeTab];
  const activeColors = [activeAccent.accentMuted, activeAccent.accent] as const;

  return (
    <LinearGradient
      colors={barColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { borderTopColor: `${palette.border}90`, borderTopWidth: 1 }]}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <Pressable
            key={tab.id}
            style={[
              styles.tab,
              { borderRadius: radius.md },
              isActive && styles.tabActive
            ]}
            onPress={() => {
              if (isActive && tab.id === "home") {
                goHome();
                setSearchQuery("");
              }
              setActiveTab(tab.id);
            }}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isActive }}
            accessibilityHint={`Aller à ${tab.label}`}
          >
            {isActive && (
              <LinearGradient
                colors={activeColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.activeGlow, { borderRadius: radius.md }]}
              />
            )}
            <Ionicons
              name={ICONS[tab.id]}
              size={22}
              color={isActive ? "#fff" : palette.muted}
            />
            {isActive && (
              <Text
                style={[styles.label, { color: isActive ? "#fff" : palette.muted }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {tab.label}
              </Text>
            )}
            {tab.id === "downloads" && effectiveDownloadsCount > 0 && (
              <View style={[styles.badge, { backgroundColor: palette.success }]}>
                <Text style={styles.badgeText}>{effectiveDownloadsCount}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    position: "relative",
  },
  tabActive: {
    overflow: "hidden",
  },
  activeGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.md,
  },
  label: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    maxWidth: "100%",
  },
  labelActive: {
    color: "#fff",
  },
  badge: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.md,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
});

export type { TabId };
