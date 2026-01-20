import React, { useEffect, useRef, useState } from "react";
import { LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, View, Alert, FlatList, useWindowDimensions, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { useAppData } from "../context/AppDataContext";
import { useVk } from "../context/VkContext";
import * as FolderService from "../services/FolderService";
import { getT } from "../i18n";
import { palette as defaultPalette, radius, spacing, tabAccents } from "../theme";
import { DownloadItem } from "../types";
import { ConfirmDialog } from "../components/ConfirmDialog";

type AccentType = {
  accent: string;
  accentBright: string;
  accentMuted: string;
  gradient: [string, string];
  gradientBright: [string, string];
};

interface DownloadCardProps {
  item: DownloadItem;
  palette: typeof defaultPalette;
  accent: AccentType;
  t: any;
  styles: any;
  pause: (id: string) => void;
  resume: (id: string) => void;
  cancel: (id: string) => void;
  retry: (id: string) => void;
  onLire: (item: DownloadItem) => void;
  onDossier: () => void;
}

const DownloadCard = React.memo<DownloadCardProps>(({
  item, palette: p, accent: a, t, styles, pause, resume, cancel, retry, onLire, onDossier
}) => {
  const getStatusChip = () => {
    switch (item.status) {
      case "completed":
        return { text: t.downloads.statusCompleted, color: p.success, icon: "checkmark-done" };
      case "paused":
        return { text: t.downloads.statusPaused, color: p.warning, icon: "pause" };
      case "downloading":
        return { text: t.downloads.statusDownloading, color: a.accentBright, icon: "cloud-download" };
      case "pending":
        return { text: "En attente", color: a.accent, icon: "time-outline" };
      case "canceled":
        return { text: t.downloads.statusCanceled, color: p.subtle, icon: "close-circle" };
      case "error":
      default:
        return { text: t.downloads.statusError, color: p.danger, icon: "alert-circle" };
    }
  };

  const chip = getStatusChip();
  const progressValue = Math.max(0, Math.min(item.progress || 0, 100));
  const isActive = ["downloading", "pending", "paused"].includes(item.status);
  const cardColors =
    item.status === "completed"
      ? [`${p.success}33`, `${p.card}`]
      : item.status === "error"
        ? [`${p.danger}33`, `${p.card}`]
        : item.status === "paused"
          ? [`${p.warning}26`, `${p.surface}`]
          : ["downloading", "pending"].includes(item.status)
            ? [`${a.accent}33`, `${p.card}`]
            : [`${p.surface}`, `${p.card}`];

  return (
    <View style={styles.cardContainer}>
      <LinearGradient
        colors={cardColors as any}
        style={styles.card}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardTitleRow}>
            <View style={[styles.typeIcon, { backgroundColor: `${chip.color}15` }]}>
              <Ionicons name={chip.icon as any} size={18} color={chip.color} />
            </View>
            <View style={styles.titleCol}>
              <Text style={styles.cardTitle} numberOfLines={styles.cardContainer.width ? 2 : 1}>{item.title}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>{(item.extension || "FILE").toUpperCase()}</Text>
                <Text style={styles.metaDivider}>•</Text>
                <Text style={styles.metaText}>{item.size || "Size unknown"}</Text>
                {!styles.cardContainer.width && item.speed && (
                  <>
                    <Text style={styles.metaDivider}>•</Text>
                    <Text style={[styles.metaText, { color: a.accentBright }]}>{item.speed}</Text>
                  </>
                )}
              </View>
              {styles.cardContainer.width && item.speed && (
                <Text style={[styles.metaText, { color: a.accentBright, marginTop: 2 }]}>{item.speed}</Text>
              )}
            </View>
          </View>
        </View>

        {isActive && (
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressStatus}>{chip.text}</Text>
              <Text style={styles.progressPct}>{progressValue}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <LinearGradient
                colors={[a.accentBright, a.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${progressValue}%` }]}
              />
            </View>
          </View>
        )}

        {!isActive && item.status === 'completed' && (
          <View style={styles.statusBadge}>
            <Ionicons name="checkmark-circle" size={14} color={p.success} />
            <Text style={[styles.statusBadgeText, { color: p.success }]}>{t.downloads.statusCompleted}</Text>
          </View>
        )}

        {item.status === 'error' && (
          <View style={styles.statusBadge}>
            <Ionicons name="alert-circle" size={14} color={p.danger} />
            <Text style={[styles.statusBadgeText, { color: p.danger }]}>{t.downloads.statusError}</Text>
          </View>
        )}

        {item.status === 'canceled' && (
          <View style={styles.statusBadge}>
            <Ionicons name="close-circle" size={14} color={p.subtle} />
            <Text style={[styles.statusBadgeText, { color: p.subtle }]}>{t.downloads.statusCanceled}</Text>
          </View>
        )}

        <View style={styles.cardActions}>
          {item.status === "downloading" || item.status === "pending" ? (
            <View style={styles.actionGroup}>
              <Pressable style={[styles.miniBtn, styles.accentBtn]} onPress={() => pause(item.id)}>
                <Ionicons name="pause" size={18} color={a.accentBright} />
              </Pressable>
              <Pressable style={[styles.miniBtn, styles.dangerBtn]} onPress={() => cancel(item.id)}>
                <Ionicons name="close" size={18} color="#fff" />
              </Pressable>
            </View>
          ) : item.status === "paused" ? (
            <View style={styles.actionGroup}>
              <Pressable style={[styles.miniBtn, styles.accentBtn]} onPress={() => resume(item.id)}>
                <Ionicons name="play" size={18} color={a.accentBright} />
              </Pressable>
              <Pressable style={[styles.miniBtn, styles.dangerBtn]} onPress={() => cancel(item.id)}>
                <Ionicons name="close" size={18} color="#fff" />
              </Pressable>
            </View>
          ) : item.status === "completed" ? (
            <View style={styles.actionGroup}>
              {item.extension?.toLowerCase() === 'pdf' && item.path ? (
                <Pressable
                  style={[styles.openFileBtn, { backgroundColor: `${p.primaryBright}15`, borderColor: `${p.primaryBright}40` }]}
                  onPress={() => onLire(item)}
                >
                  <Ionicons name="book-outline" size={16} color={p.primaryBright} />
                  <Text style={[styles.openFileText, { color: p.primaryBright }]}>Lire</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.openFileBtn, { backgroundColor: `${a.accent}15`, borderColor: `${a.accent}40` }]}
                onPress={() => onDossier()}
              >
                <Ionicons name="folder-open-outline" size={16} color={a.accentBright} />
                <Text style={[styles.openFileText, { color: a.accentBright }]}>Dossier</Text>
              </Pressable>
            </View>
          ) : (item.status === "error" || item.status === "canceled") ? (
            <Pressable style={styles.retryBtn} onPress={() => retry(item.id)}>
              <Ionicons name="refresh" size={16} color={p.text} />
              <Text style={[styles.retryText, { color: p.text }]}>{t.downloads.actionRetry}</Text>
            </Pressable>
          ) : null}
        </View>
      </LinearGradient >
    </View >
  );
});

export const DownloadsScreen: React.FC = () => {
  const { language, activePalette: p } = useVk();
  const { width: screenWidth } = useWindowDimensions();
  const t = getT(language);
  const accent = tabAccents.downloads;
  const styles = React.useMemo(() => stylesWithPalette(p, accent, screenWidth), [p, accent, screenWidth]);
  const {
    downloads,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    setReadingFile,
    clearDownloads,
  } = useAppData();

  // État pour le dialogue de confirmation
  const [clearDialog, setClearDialog] = useState(false);

  // Memoize handlers to prevent checking unnecessary re-renders
  const handleLire = React.useCallback(async (item: DownloadItem) => {
    if (!item.path) {
      Alert.alert("Erreur", "Fichier introuvable");
      return;
    }

    try {
      console.log("DownloadsScreen: Opening PDF with internal reader:", item.path);
      setReadingFile({ uri: item.path, title: item.title });
    } catch (error: any) {
      console.error("DownloadsScreen: Error opening file:", error);
      Alert.alert("Erreur", "Impossible d'ouvrir le lecteur interne.");
    }
  }, [setReadingFile]);

  const handleDossier = React.useCallback(async (item: DownloadItem) => {
    if (!item.path) {
      Alert.alert("Erreur", "Fichier introuvable");
      return;
    }

    if (Platform.OS === "android") {
      try {
        const folderUri = FolderService.getParentFolderUri(item.path);
        const opened = await FolderService.openFileLocation(folderUri);
        if (!opened) {
          Alert.alert("Erreur", "Impossible d'ouvrir le dossier.");
        }
      } catch (e) {
        console.log("Opening folder failed:", e);
        Alert.alert("Erreur", "Impossible d'ouvrir le dossier.");
      }
    } else {
      Alert.alert("Info", "Les fichiers sont stockés dans le dossier Documents de l'application.");
    }
  }, []);

  const renderItem = React.useCallback(({ item }: { item: DownloadItem }) => (
    <DownloadCard
      item={item}
      palette={p}
      accent={accent}
      t={t}
      styles={styles}
      pause={pauseDownload}
      resume={resumeDownload}
      cancel={cancelDownload}
      retry={retryDownload}
      onLire={handleLire}
      onDossier={() => handleDossier(item)}
    />
  ), [p, accent, t, styles, pauseDownload, resumeDownload, cancelDownload, retryDownload, handleLire, handleDossier]);

  // Tri par priorité de statut (ordre UX optimisé)
  // 1. En cours - élément dynamique principal
  // 2. Erreur - nécessite une action immédiate
  // 3. En attente - va s'activer automatiquement
  // 4. En pause - décision utilisateur, moins urgent
  // 5. Terminé - intérêt réduit
  // 6. Annulé - le moins prioritaire
  const statusPriority: Record<string, number> = {
    downloading: 0,
    error: 1,
    pending: 2,
    paused: 3,
    completed: 4,
    canceled: 5,
  };

  const sortedDownloads = React.useMemo(() => {
    return [...downloads].sort((a, b) => {
      const priorityA = statusPriority[a.status] ?? 99;
      const priorityB = statusPriority[b.status] ?? 99;
      if (priorityA !== priorityB) return priorityA - priorityB;
      // À priorité égale, trier par date de création (plus récent d'abord)
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  }, [downloads]);

  const completedCount = downloads.filter((d) => d.status === "completed").length;
  const inProgressCount = downloads.filter((d) => ["downloading", "pending", "paused"].includes(d.status)).length;
  const totalCount = downloads.length;

  const prevCountRef = useRef(downloads.length);

  useEffect(() => {
    if (downloads.length !== prevCountRef.current) {
      if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      prevCountRef.current = downloads.length;
    }
  }, [downloads.length]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={accent.gradientBright}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{t.downloads.title}</Text>
            <Text style={styles.headerSubtitle}>{totalCount} {t.nav.downloads.toLowerCase()}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {downloads.length > 0 && (
              <TouchableOpacity
                onPress={() => setClearDialog(true)}
                style={{
                  padding: 8,
                  backgroundColor: `${accent.accent}20`,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: `${accent.accent}40`,
                }}
              >
                <Ionicons name="trash-outline" size={20} color={accent.accentBright} />
              </TouchableOpacity>
            )}
            <View style={styles.headerIcon}>
              <Ionicons name="cloud-download" size={22} color={accent.accentBright} />
            </View>
          </View>
        </View>

        <LinearGradient
          colors={[`${accent.accent}18`, `${p.surface}E6`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statsRow}
        >
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{completedCount}</Text>
            <Text style={styles.statLabel}>{t.downloads.statusCompleted}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{inProgressCount}</Text>
            <Text style={styles.statLabel}>{t.downloads.statusInProgress}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalCount}</Text>
            <Text style={styles.statLabel}>{t.nav.downloads}</Text>
          </View>
        </LinearGradient>
      </LinearGradient>

      <View style={styles.container}>
        {downloads.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="cloud-download-outline" size={48} color={accent.accentBright} />
            </View>
            <Text style={styles.emptyTitle}>{t.downloads.emptyTitle}</Text>
            <Text style={styles.emptyText}>{t.downloads.emptySubtitle}</Text>
          </View>
        ) : (
          <FlatList
            data={sortedDownloads}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            key={screenWidth > 900 ? 'grid3' : screenWidth > 600 ? 'grid2' : 'list'}
            numColumns={screenWidth > 900 ? 3 : screenWidth > 600 ? 2 : 1}
            columnWrapperStyle={screenWidth > 600 ? { gap: screenWidth > 900 ? spacing.lg : spacing.md } : undefined}
            ListHeaderComponent={
              downloads.every(d => d.status === 'completed') ? (
                <View style={styles.allCompletedBanner}>
                  <Ionicons name="checkmark-circle" size={24} color={p.success} />
                  <Text style={styles.allCompletedText}>{t.downloads.statusCompleted}</Text>
                </View>
              ) : null
            }
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={true}
            initialNumToRender={8}
            maxToRenderPerBatch={5}
            windowSize={5}
            // getItemLayout removed because items have variable height (progress bar, error message, etc.)
            ListFooterComponent={<View style={{ height: 100 }} />}
            style={{ flex: 1 }}
          />
        )}
      </View>

      {/* Dialog de confirmation pour effacer l'historique */}
      <ConfirmDialog
        visible={clearDialog}
        onClose={() => setClearDialog(false)}
        onConfirm={() => {
          clearDownloads();
          setClearDialog(false);
        }}
        title="Effacer l'historique"
        message="Voulez-vous supprimer tous les téléchargements de la liste ?"
        confirmText="Effacer"
        cancelText="Annuler"
        icon="trash"
        palette={p}
        accent={accent.accent}
      />
    </View>
  );
};

const stylesWithPalette = (p: typeof defaultPalette, a: AccentType, screenWidth: number = 400) => {
  const isLargeTablet = screenWidth > 900;
  const isTablet = screenWidth > 600;
  const numColumns = isLargeTablet ? 3 : isTablet ? 2 : 1;
  const gap = isLargeTablet ? spacing.lg : spacing.md;
  const availableWidth = screenWidth - (spacing.lg * 2);
  const itemWidth = (availableWidth - (gap * (numColumns - 1))) / numColumns;

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: p.background },
    headerGradient: { paddingTop: spacing.lg, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    headerTitle: { color: p.text, fontSize: 24, fontWeight: "900" },
    headerSubtitle: { color: p.muted, fontSize: 13, fontWeight: "700" },
    headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    headerIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: `${a.accent}20`, borderWidth: 1, borderColor: `${a.accent}40`, alignItems: "center", justifyContent: "center" },
    headerAction: { width: 40, height: 40, borderRadius: 20, backgroundColor: `${p.danger}15`, alignItems: "center", justifyContent: "center" },
    statsRow: { marginTop: spacing.md, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: `${a.accent}30`, flexDirection: "row", alignItems: "center" },
    statItem: { flex: 1, alignItems: "center" },
    statValue: { color: a.accentBright, fontSize: 18, fontWeight: "900" },
    statLabel: { color: p.subtle, fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginTop: 2, textAlign: "center" },
    statDivider: { width: 1, height: 30, backgroundColor: `${p.border}50` },
    container: { flex: 1 },
    content: { paddingHorizontal: spacing.lg },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 60, gap: 12 },
    emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: `${a.accent}12`, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: `${a.accent}30` },
    emptyTitle: { color: p.text, fontSize: 18, fontWeight: "900" },
    emptyText: { color: p.muted, textAlign: "center", fontSize: 14, fontWeight: "700", opacity: 0.8 },
    list: { paddingHorizontal: spacing.lg, gap: spacing.md },
    cardContainer: {
      borderRadius: radius.lg,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: `${p.border}50`,
      width: itemWidth,
      marginBottom: isTablet ? spacing.md : 0,
    },
    card: { padding: spacing.md, flex: 1 },
    cardTop: { flexDirection: "row", alignItems: "center" },
    cardTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
    typeIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    titleCol: { flex: 1, gap: 2 },
    cardTitle: { color: p.text, fontWeight: "900", fontSize: 14 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    metaText: { color: p.muted, fontSize: 11, fontWeight: "800" },
    metaDivider: { color: p.subtle, fontSize: 10 },
    progressSection: { marginTop: spacing.md, gap: 8 },
    progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    progressStatus: { color: p.text, fontSize: 11, fontWeight: "800" },
    progressPct: { color: a.accentBright, fontSize: 11, fontWeight: "900" },
    progressTrack: { height: 6, backgroundColor: `${p.border}50`, borderRadius: 3, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 3 },
    statusBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
    statusBadgeText: { fontSize: 11, fontWeight: "900" },
    cardActions: { marginTop: spacing.sm, flexDirection: "row", justifyContent: "flex-end" },
    actionGroup: { flexDirection: "row", gap: 8 },
    miniBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: p.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: `${p.border}80` },
    accentBtn: { backgroundColor: `${a.accent}20`, borderColor: `${a.accent}50` },
    dangerBtn: { backgroundColor: p.danger, borderColor: p.danger },
    retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: p.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: `${p.border}80` },
    retryText: { color: p.text, fontSize: 11, fontWeight: "900" },
    openFileBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    openFileText: {
      fontSize: 12,
      fontWeight: "900",
    },
    allCompletedBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: `${p.success}15`, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: `${p.success}30`, marginBottom: spacing.md },
    allCompletedText: { color: p.success, fontSize: 16, fontWeight: "900" },
  });
};
