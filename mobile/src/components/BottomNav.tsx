import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getT } from "../i18n";
import { useVk } from "../context/VkContext";
import { useAppData } from "../context/AppDataContext";
import { palette, radius, spacing } from "../theme";

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
  const { language } = useVk();
  const t = getT(language);
  const { downloads } = useAppData();

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

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
            activeOpacity={0.85}
          >
            <Ionicons
              name={ICONS[tab.id]}
              size={22}
              color={isActive ? "#fff" : palette.muted}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
            {tab.id === "downloads" && effectiveDownloadsCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{effectiveDownloadsCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: `${palette.surface}E6`,
    borderTopWidth: 1,
    borderTopColor: `${palette.border}90`,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
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
    backgroundColor: palette.primary,
  },
  label: {
    marginTop: 4,
    fontSize: 12,
    color: palette.muted,
    fontWeight: "600",
  },
  labelActive: {
    color: "#fff",
  },
  badge: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.md,
    backgroundColor: palette.success,
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
