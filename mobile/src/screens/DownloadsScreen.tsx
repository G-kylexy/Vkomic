import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Section } from "../components/Section";
import { useAppData } from "../context/AppDataContext";
import { useVk } from "../context/VkContext";
import { getT } from "../i18n";
import { palette, radius, spacing } from "../theme";
import { DownloadItem } from "../types";

// Écran Téléchargements (mobile).
// Objectif :
// - afficher la file de téléchargements réelle (AppDataContext + expo-file-system) ;
// - suivre la progression, la vitesse estimée, le statut (en cours / en pause / terminé) ;
// - exposer des actions simples : pause / reprise / annuler / réessayer / vider l’historique.
export const DownloadsScreen: React.FC = () => {
  const { language } = useVk();
  const t = getT(language);
  const {
    downloads,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    clearDownloads,
  } = useAppData();

  // Transforme l'état métier d'un téléchargement en un badge (texte + couleur) pour l'UI.
  const statusChip = (item: DownloadItem) => {
    switch (item.status) {
      case "completed":
        return { text: t.downloads.statusCompleted, color: palette.success };
      case "paused":
        return { text: t.downloads.statusPaused, color: palette.warning };
      case "downloading":
      case "pending":
        return { text: t.downloads.statusDownloading, color: palette.primaryBright };
      case "canceled":
        return { text: t.downloads.statusCanceled, color: palette.subtle };
      case "error":
      default:
        return { text: t.downloads.statusError, color: palette.danger };
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Section title={t.downloads.title} subtitle={t.downloads.subtitle}>
        {/* Cas où aucun téléchargement n’a encore été lancé. */}
        {downloads.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cloud-download-outline" size={26} color={palette.subtle} />
            <Text style={styles.emptyTitle}>{t.downloads.emptyTitle}</Text>
            <Text style={styles.emptyText}>
              {t.downloads.emptySubtitle}
            </Text>
          </View>
        ) : (
          // Liste des téléchargements avec progression et actions.
          <View style={styles.list}>
            {downloads.map((item) => {
              const chip = statusChip(item);
              const progressValue = Math.max(0, Math.min(item.progress || 0, 100));
              const showProgress =
                item.status === "downloading" ||
                item.status === "paused" ||
                item.status === "pending";

              return (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <View style={[styles.chip, { borderColor: `${chip.color}55` }]}>
                        <View style={[styles.chipDot, { backgroundColor: chip.color }]} />
                        <Text style={[styles.chipText, { color: chip.color }]}>
                          {chip.text}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.meta}>
                      {(item.extension || "FILE").toUpperCase()}
                      {item.size ? ` • ${item.size}` : ""}
                      {item.speed ? ` • ${item.speed}` : ""}
                      {showProgress ? ` • ${progressValue}%` : ""}
                    </Text>
                  </View>

                  {showProgress && (
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${progressValue}%`,
                            backgroundColor:
                              item.status === "paused"
                                ? palette.warning
                                : palette.primary,
                          },
                        ]}
                      />
                    </View>
                  )}

                  <View style={styles.actionsRow}>
                    {item.status === "downloading" || item.status === "pending" ? (
                      <>
                        <Pressable
                          style={styles.actionBtn}
                          onPress={() => void pauseDownload(item.id)}
                        >
                          <Ionicons name="pause" size={16} color={palette.text} />
                          <Text style={styles.actionText}>{t.downloads.actionPause}</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.actionBtn, styles.dangerBtn]}
                          onPress={() => void cancelDownload(item.id)}
                        >
                          <Ionicons name="close" size={16} color="#fff" />
                          <Text style={[styles.actionText, { color: "#fff" }]}>
                            {t.downloads.actionCancel}
                          </Text>
                        </Pressable>
                      </>
                    ) : item.status === "paused" ? (
                      <>
                        <Pressable
                          style={styles.actionBtn}
                          onPress={() => void resumeDownload(item.id)}
                        >
                          <Ionicons name="play" size={16} color={palette.text} />
                          <Text style={styles.actionText}>{t.downloads.actionResume}</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.actionBtn, styles.dangerBtn]}
                          onPress={() => void cancelDownload(item.id)}
                        >
                          <Ionicons name="close" size={16} color="#fff" />
                          <Text style={[styles.actionText, { color: "#fff" }]}>
                            {t.downloads.actionCancel}
                          </Text>
                        </Pressable>
                      </>
                    ) : item.status === "error" || item.status === "canceled" ? (
                      <Pressable
                        style={styles.actionBtn}
                        onPress={() => void retryDownload(item.id)}
                      >
                        <Ionicons name="refresh" size={16} color={palette.text} />
                        <Text style={styles.actionText}>{t.downloads.actionRetry}</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.completedRow}>
                        <Ionicons name="checkmark-circle" size={18} color={palette.success} />
                        <Text style={styles.completedText}>{t.downloads.statusCompleted}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

            <Pressable style={styles.clearBtn} onPress={() => void clearDownloads()}>
              <Ionicons name="trash-outline" size={16} color={palette.danger} />
              <Text style={styles.clearText}>{t.downloads.clearList}</Text>
            </Pressable>
          </View>
        )}
      </Section>

      <View style={{ height: 90 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  empty: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 18,
  },
  emptyTitle: {
    color: palette.text,
    fontWeight: "900",
    fontSize: 16,
  },
  emptyText: {
    color: palette.muted,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 18,
  },
  list: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    padding: spacing.lg,
    gap: 10,
  },
  cardTop: {
    gap: 6,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    color: palette.text,
    fontWeight: "900",
    fontSize: 14,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#0b1220",
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  chipText: {
    fontWeight: "900",
    fontSize: 11,
  },
  meta: {
    color: palette.muted,
    fontWeight: "700",
    fontSize: 11,
  },
  progressTrack: {
    height: 7,
    backgroundColor: `${palette.border}80`,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dangerBtn: {
    backgroundColor: palette.danger,
    borderColor: `${palette.danger}AA`,
  },
  actionText: {
    color: palette.text,
    fontWeight: "900",
    fontSize: 12,
  },
  completedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  completedText: {
    color: palette.muted,
    fontWeight: "900",
  },
  clearBtn: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${palette.danger}55`,
    backgroundColor: `${palette.danger}10`,
  },
  clearText: {
    color: palette.danger,
    fontWeight: "900",
  },
});
