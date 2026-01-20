import { useMemo, memo, useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  BackHandler,
  useWindowDimensions,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { TabId } from "../components/BottomNav";
import { getT } from "../i18n";
import { useAppData } from "../context/AppDataContext";
import { useVk } from "../context/VkContext";
import { palette as defaultPalette, radius, spacing, tabAccents } from "../theme";
import { VkNode, DownloadItem } from "../types";

type AccentType = {
  accent: string;
  accentBright: string;
  accentMuted: string;
  gradient: [string, string];
  gradientBright: [string, string];
};

const stylesWithPalette = (p: typeof defaultPalette, a: AccentType, screenWidth: number = 400) => {
  const isLargeTablet = screenWidth > 900;
  const isTablet = screenWidth > 600;
  const numColumns = isLargeTablet ? 3 : isTablet ? 2 : 1;
  const gap = isLargeTablet ? spacing.md : spacing.sm;
  const availableWidth = screenWidth - (spacing.lg * 2);
  const itemWidth = (availableWidth - (gap * (numColumns - 1))) / numColumns;

  return StyleSheet.create({
    root: { flex: 1 },
    headerGradient: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
    headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    headerTitle: { fontSize: 24, fontWeight: "900", color: p.text },
    headerSubtitle: { fontSize: 12, fontWeight: "700", color: p.muted, marginTop: 2 },

    headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    pingBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: p.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, borderColor: `${p.border}50` },
    syncBtnSmall: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: a.accent, alignItems: "center", justifyContent: "center" },
    syncBtnDisabled: { opacity: 0.5 },
    searchBarContainer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, marginTop: spacing.xs },
    searchInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: p.surface,
      borderRadius: radius.md,
      paddingHorizontal: 15,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: `${p.border}50`,
    },
    searchInput: { flex: 1, color: p.text, fontSize: 15, fontWeight: "700" },
    clearBtn: { padding: 6 },
    breadcrumbs: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm, flexDirection: "row", alignItems: "center", overflow: "hidden" },
    breadcrumbScroll: { flex: 1, flexShrink: 1 },
    breadcrumbInner: { flexDirection: "row", alignItems: "center", paddingRight: spacing.sm },
    crumb: { flexDirection: "row", alignItems: "center", gap: 6, marginRight: 8, flexShrink: 0, backgroundColor: `${p.surface}`, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: `${p.border}50`, minHeight: 40 },
    crumbText: { color: p.muted, fontSize: 14, fontWeight: "700" },
    container: { flex: 1 },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs, gap: spacing.xs },
    statsRow: { flexDirection: "row", backgroundColor: p.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: `${a.accent}30`, alignItems: "center" },
    statItem: { flex: 1, alignItems: "center" },
    statValue: { color: a.accentBright, fontSize: 18, fontWeight: "900" },
    statLabel: { color: p.subtle, fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginTop: 2, textAlign: "center" },
    statDivider: { width: 1, height: 30, backgroundColor: `${p.border}50` },
    emptyCard: { backgroundColor: p.card, borderRadius: radius.lg, borderWidth: 1, borderColor: `${p.border}80`, padding: spacing.lg, gap: 10 },
    emptyTitle: { color: p.text, fontSize: 16, fontWeight: "900" },
    emptySubtitle: { color: p.muted, fontSize: 13, lineHeight: 18 },
    primaryCta: { marginTop: 4, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: a.accent, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
    primaryCtaText: { color: "#fff", fontWeight: "900" }, // OK: #fff sur fond accent coloré
    errorPill: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.lg, borderWidth: 1, borderColor: `${p.danger}55`, backgroundColor: `${p.danger}12` },
    errorText: { color: p.muted, fontWeight: "700", flex: 1 },
    infoPill: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.lg, borderWidth: 1, borderColor: `${a.accent}55`, backgroundColor: `${a.accent}12` },
    infoText: { color: p.muted, fontWeight: "700", flex: 1, fontSize: 12 },
    folderList: { flexDirection: "row", flexWrap: "wrap", gap: gap, marginBottom: spacing.lg },
    folderRow: {
      flexDirection: isTablet ? "column" : "row",
      alignItems: isTablet ? "flex-start" : "center",
      backgroundColor: p.card,
      borderRadius: radius.xl,
      paddingHorizontal: isTablet ? spacing.lg : spacing.xl,
      paddingVertical: isTablet ? spacing.lg : spacing.lg + 4,
      gap: isTablet ? spacing.md : spacing.lg,
      minHeight: isTablet ? 120 : 96,
      width: itemWidth,
      borderWidth: 1,
      borderColor: `${p.border}50`
    },
    folderRowIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: `${a.accent}15`, borderWidth: 1, borderColor: `${a.accent}30`, alignItems: "center", justifyContent: "center" },
    folderRowTitle: { flex: 1, color: p.text, fontSize: isTablet ? 14 : 16, fontWeight: "900" },
    searchCountRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: spacing.xs },
    searchCountText: { color: a.accentBright, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
    fileBox: { backgroundColor: p.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: `${p.border}50`, overflow: "hidden" },
    fileBoxHeader: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: `${p.border}80`,
      backgroundColor: p.surface,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    bulkBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: `${a.accent}15`, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm },
    bulkBtnText: { color: a.accentBright, fontSize: 11, fontWeight: "900" },
    fileBoxTitle: { color: p.text, fontWeight: "900", fontSize: 12 },
    fileList: { padding: spacing.lg, gap: spacing.md },
    fileRowContainer: { gap: 8, paddingVertical: 4 },
    fileRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
    fileText: { flex: 1, gap: 4 },
    fileTitle: { color: p.text, fontWeight: "800", fontSize: 13 },
    fileSub: { color: p.muted, fontWeight: "700", fontSize: 11 },
    fileActionsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    downloadControls: { flexDirection: "row", alignItems: "center" },
    miniActionBtn: { padding: 2 },
    fileAction: { backgroundColor: a.accent, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8 },
    fileActionDone: { backgroundColor: p.card, borderWidth: 1, borderColor: `${p.border}80` },
    fileActionText: { color: "#fff", fontWeight: "900", fontSize: 11 },
    splitAction: { flexDirection: "row", borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: `${p.border}80`, backgroundColor: p.surface },
    splitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, paddingHorizontal: 10, gap: 4 },
    splitBtnPrimary: { backgroundColor: `${a.accent}12` },
    splitBtnDanger: { backgroundColor: `${p.danger}08` },
    splitDivider: { width: 1, backgroundColor: `${p.border}80` },
    splitBtnText: { fontWeight: "900", fontSize: 10, textTransform: "uppercase" },
    progressContainer: { height: 14, backgroundColor: p.surface, borderRadius: 7, overflow: "hidden", marginTop: 2, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: `${p.border}50` },
    progressBar: { height: "100%" },
    progressText: { position: "absolute", width: "100%", textAlign: "center", fontSize: 9, fontWeight: "900", color: p.text },
    iconTile: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: p.surface, borderWidth: 1, borderColor: `${p.border}80`, alignItems: "center", justifyContent: "center" },
    loadingOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
    loadingCard: { backgroundColor: p.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: `${p.border}80`, padding: spacing.lg, alignItems: "center", gap: 10, minWidth: 200 },
    loadingText: { color: p.muted, fontWeight: "800" },
    loadingIndicator: { color: a.accentBright },
    stepsContainer: { gap: 6, marginVertical: 6 },
    stepText: { color: p.muted, fontSize: 13, lineHeight: 20, fontWeight: "600" },
  });
};

type FolderRowProps = {
  node: VkNode;
  palette: typeof defaultPalette;
  accent: AccentType;
  styles: ReturnType<typeof stylesWithPalette>;
  onPress: (node: VkNode) => void | Promise<void>;
};

const FolderRow = memo<FolderRowProps>(({ node, palette: p, accent, styles, onPress }) => {
  const handlePress = useCallback(() => void onPress(node), [node, onPress]);
  const iconName = node.type === "category" ? "albums" : "folder-open";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.folderRow,
        pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir le dossier ${node.title}`}
      accessibilityHint="Appuyez pour voir le contenu"
    >
      <View style={styles.folderRowIcon}>
        <Ionicons name={iconName as any} size={20} color={accent.accentBright} />
      </View>
      <Text style={styles.folderRowTitle} numberOfLines={2}>{node.title}</Text>
      {/* Sur tablette on cache peut-être le chevron car c'est plus une carte */}
      {styles.folderRow.flexDirection === 'row' && <Ionicons name="chevron-forward" size={16} color={p.subtle} />}
    </Pressable>
  );
});

type FileRowProps = {
  node: VkNode;
  palette: typeof defaultPalette;
  accent: AccentType;
  styles: ReturnType<typeof stylesWithPalette>;
  download: DownloadItem | null;
  t: any;
  onDownload: (node: VkNode) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onOpen: (file: { uri: string; title: string }) => void;
  onNavigateLibrary: () => void;
};

const FileRow = memo<FileRowProps>(({
  node, palette: p, accent, styles, download: d, t, onDownload, onPause, onResume, onCancel, onOpen, onNavigateLibrary
}) => {
  const ext = (node.extension || "").toUpperCase();
  const fileTheme = useMemo(() => {
    const e = ext.toUpperCase();
    if (e === "PDF") return { icon: "document-text", color: "#f472b6", bg: "#f472b610" }; // Rose franc (Pink 400)
    if (e === "CBZ" || e === "CBR") return { icon: "book", color: "#8b5cf6", bg: "#8b5cf610" }; // Violet
    if (e === "ZIP" || e === "RAR" || e === "7Z") return { icon: "archive", color: "#f59e0b", bg: "#f59e0b10" }; // Amber
    if (["JPG", "JPEG", "PNG", "WEBP"].includes(e)) return { icon: "image", color: "#10b981", bg: "#10b98110" }; // Emerald
    return { icon: "document", color: p.muted, bg: p.surface };
  }, [ext, p]);

  return (
    <View style={styles.fileRowContainer}>
      <View style={styles.fileRow}>
        <View style={[styles.iconTile, { backgroundColor: fileTheme.bg, borderColor: `${fileTheme.color}30` }]}>
          <Ionicons name={fileTheme.icon as any} size={20} color={fileTheme.color} />
        </View>
        <View style={styles.fileText}>
          <Text style={styles.fileTitle} numberOfLines={2}>{node.title}</Text>
          <Text style={styles.fileSub} numberOfLines={1}>
            {node.extension || "FILE"}
          </Text>
        </View>

        <View style={styles.fileActionsRow}>
          {d?.status === "downloading" || d?.status === "pending" || d?.status === "paused" ? (
            <View style={styles.splitAction} accessibilityRole="toolbar">
              <Pressable
                style={({ pressed }) => [styles.splitBtn, styles.splitBtnPrimary, pressed && { opacity: 0.7 }]}
                onPress={() => d.status === "paused" ? onResume(d.id) : onPause(d.id)}
                accessibilityRole="button"
                accessibilityLabel={d.status === "paused" ? "Reprendre le téléchargement" : "Mettre en pause"}
              >
                <Ionicons
                  name={d.status === "paused" ? "play" : "pause"}
                  size={14}
                  color={accent.accentBright}
                />
                <Text style={[styles.splitBtnText, { color: accent.accentBright }]}>
                  {d.status === "paused" ? t.downloads.statusResume || "Reprendre" : "Pause"}
                </Text>
              </Pressable>
              <View style={styles.splitDivider} />
              <Pressable
                style={({ pressed }) => [styles.splitBtn, styles.splitBtnDanger, pressed && { opacity: 0.7 }]}
                onPress={() => onCancel(d.id)}
                accessibilityRole="button"
                accessibilityLabel="Annuler le téléchargement"
              >
                <Ionicons name="stop" size={14} color={p.danger} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[
                styles.fileAction,
                d?.status === "completed" && styles.fileActionDone,
                (d?.status === "error" || d?.status === "canceled") && { backgroundColor: p.muted }
              ]}
              onPress={() => {
                if (d?.status === "completed") {
                  if (node.extension?.toLowerCase() === "pdf" && d.path) {
                    // Add file:// prefix for Android raw paths
                    const fileUri = Platform.OS === "android" && !d.path.startsWith("file://")
                      ? `file://${d.path}`
                      : d.path;
                    onOpen({ uri: fileUri, title: node.title });
                  } else {
                    onNavigateLibrary();
                  }
                } else {
                  void onDownload(node);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={d?.status === "completed" ? `Ouvrir ${node.title}` : `Télécharger ${node.title}`}
            >
              <Text style={[styles.fileActionText, { color: p.background === "#F5F1E8" && d?.status !== "completed" ? p.text : "#fff" }]}>
                {d?.status === "completed" ? t.browser.open : t.browser.download}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {(d?.status === "downloading" || d?.status === "paused") && (
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${d.progress}%`, backgroundColor: accent.accentBright }]} />
          <Text style={styles.progressText}>{d.progress}%</Text>
        </View>
      )}
    </View>
  );
});

export const HomeScreen: React.FC<{ isActive?: boolean, onNavigate?: (tab: TabId) => void }> = ({
  isActive = false,
  onNavigate,
}) => {
  const { token, language, activePalette: p } = useVk();
  const { width: screenWidth } = useWindowDimensions();
  const t = getT(language);
  const accent = tabAccents.home;
  const styles = useMemo(() => stylesWithPalette(p, accent, screenWidth), [p, accent, screenWidth]);
  const {
    syncedData,
    navPath,
    currentNodes,
    isSyncing,
    isLoadingNode,
    error,
    searchQuery,
    setSearchQuery,
    hasFullSynced,
    openNode,
    goHome,
    goUp,
    refreshCurrent,
    syncAll,
    downloads,
    addDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    downloadAll,
    cancelAll,
    globalSearchNodes,
    setReadingFile,
  } = useAppData();

  // Ref to track navPath for BackHandler
  const navPathRef = useRef(navPath);
  navPathRef.current = navPath;

  // Ref pour auto-scroll du fil d'Ariane
  const breadcrumbScrollRef = useRef<ScrollView>(null);

  // Handle hardware back button
  useEffect(() => {
    if (!isActive) return;

    const backAction = () => {
      if (navPathRef.current.length > 0) {
        goUp(navPathRef.current.length - 1);
        return true; // Prevent app exit
      }
      return false; // Default behavior
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, [isActive, goUp]);



  const isSearching = searchQuery.trim().length > 0;
  const displayNodes = isSearching ? globalSearchNodes : currentNodes;
  const showIndexHint = isSearching && !hasFullSynced;
  const showSearchEmpty = isSearching && displayNodes.length === 0;

  const stats = useMemo(() => {
    let seriesCount = 0;

    const countSeries = (nodes: VkNode[]) => {
      nodes.forEach((n) => {
        if (n.type === "genre" || n.type === "series") seriesCount++;
        if (n.children && n.children.length > 0) {
          countSeries(n.children);
        }
      });
    };

    if (syncedData) countSeries(syncedData);
    return { indexed: seriesCount };
  }, [syncedData]);

  const downloadCounts = useMemo(() => {
    const downloaded = downloads.filter(d => d.status === "completed").length;
    const inProgress = downloads.filter(d =>
      ["downloading", "pending", "paused"].includes(d.status)
    ).length;
    return { downloaded, inProgress };
  }, [downloads]);

  const uniqueDisplayNodes = useMemo(() => {
    const seen = new Set<string>();
    return displayNodes.filter((node) => {
      if (seen.has(node.id)) return false;
      seen.add(node.id);
      return true;
    });
  }, [displayNodes]);

  const folderNodes = useMemo(
    () => uniqueDisplayNodes.filter((n: VkNode) => n.type !== "file"),
    [uniqueDisplayNodes],
  );
  const fileNodes = useMemo(
    () => uniqueDisplayNodes.filter((n: VkNode) => n.type === "file"),
    [uniqueDisplayNodes],
  );

  const findDownloadState = (node: VkNode) => {
    if (!node.url) return null;
    return downloads.find((d) => d.url === node.url) ?? null;
  };

  return (
    <View style={[styles.root, { backgroundColor: p.background }]}>
      <LinearGradient
        colors={accent.gradientBright}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>{t.nav.home || "Accueil"}</Text>
          </View>
          <View style={styles.headerActions}>
            {token && !isSyncing && (
              <Pressable
                style={styles.syncBtnSmall}
                onPress={() => void syncAll()}
                accessibilityRole="button"
                accessibilityLabel="Synchroniser"
              >
                <Ionicons name="sync" size={18} color="#fff" />
              </Pressable>
            )}
          </View>
        </View>
      </LinearGradient>

      <View style={styles.breadcrumbs}>
        <ScrollView
          ref={breadcrumbScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.breadcrumbScroll}
          contentContainerStyle={styles.breadcrumbInner}
          onContentSizeChange={() => {
            breadcrumbScrollRef.current?.scrollToEnd({ animated: true });
          }}
        >
          <TouchableOpacity
            style={styles.crumb}
            onPress={goHome}
            hitSlop={8}
            activeOpacity={0.6}
            delayPressIn={0}
          >
            <Ionicons name="apps-outline" size={16} color={p.muted} />
          </TouchableOpacity>
          {navPath.map((node: VkNode, idx: number) => {
            const isLast = idx === navPath.length - 1;
            return (
              <TouchableOpacity
                key={`${node.id}-${idx}`}
                style={styles.crumb}
                onPress={() => goUp(idx)}
                hitSlop={8}
                activeOpacity={0.6}
                delayPressIn={0}
              >
                {!isLast && <Ionicons name="chevron-forward" size={14} color={p.subtle} />}
                <Text style={styles.crumbText} numberOfLines={1} ellipsizeMode="tail">
                  {node.title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.searchBarContainer}>
        <View style={styles.searchInner}>
          <Ionicons name="search" size={18} color={p.muted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t.browser.searchPlaceholder || "Rechercher..."}
            placeholderTextColor={p.subtle}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Rechercher dans la bibliothèque"
            accessibilityHint="Entrez un terme pour rechercher des fichiers"
          />
          {Boolean(searchQuery) && (
            <Pressable onPress={() => setSearchQuery("")} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={18} color={p.muted} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {token && !navPath.length && !searchQuery && (
          <LinearGradient
            colors={[`${accent.accent}30`, `${p.surface}80`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.statsRow}
          >
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.indexed}</Text>
              <Text style={styles.statLabel}>{t.home.statsIndexed}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{downloadCounts.downloaded}</Text>
              <Text style={styles.statLabel}>{t.home.statsDownloaded}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{downloadCounts.inProgress}</Text>
              <Text style={styles.statLabel}>{t.home.statsInProgress || "En cours"}</Text>
            </View>
          </LinearGradient>
        )}

        {!token && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t.browser.noTokenTitle}</Text>
            <View style={styles.stepsContainer}>
              <Text style={styles.stepText}>{t.browser.setupStep1}</Text>
              <Text style={styles.stepText}>{t.browser.setupStep2}</Text>
              <Text style={styles.stepText}>{t.browser.setupStep3}</Text>
            </View>
            <Pressable style={styles.primaryCta} onPress={() => onNavigate?.("settings")}>
              <Ionicons name="settings-outline" size={16} color={p.background === "#F5F1E8" ? p.text : "#fff"} />
              <Text style={styles.primaryCtaText}>{t.browser.goSettings}</Text>
            </Pressable>
          </View>
        )}

        {token && !syncedData && !isSyncing && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t.browser.emptyTitle}</Text>
            <Text style={styles.emptySubtitle}>{t.browser.emptySubtitle}</Text>
            <Pressable
              style={styles.primaryCta}
              onPress={() => void syncAll()}
            >
              <Ionicons name="sync" size={16} color="#fff" />
              <Text style={styles.primaryCtaText}>{t.browser.sync || "Synchroniser"}</Text>
            </Pressable>
          </View>
        )}

        {error && (
          <View style={styles.errorPill}>
            <Ionicons name="alert-circle-outline" size={16} color={p.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {syncedData && (
          <>
            {searchQuery && (
              <View style={styles.searchCountRow}>
                <Ionicons name="search" size={12} color={p.primaryBright} />
                <Text style={styles.searchCountText}>
                  {displayNodes.length} {t.browser.results || "résultat(s)"}
                </Text>
              </View>
            )}

            {showIndexHint && (
              <View style={styles.infoPill}>
                <Ionicons name="information-circle-outline" size={14} color={p.primaryBright} />
                <Text style={styles.infoText}>{t.browser.searchIndexHint}</Text>
              </View>
            )}

            {showSearchEmpty && (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>{t.browser.searchEmptyTitle}</Text>
                <Text style={styles.emptySubtitle}>{t.browser.searchEmptySubtitle}</Text>
              </View>
            )}

            {folderNodes.length > 0 && (
              <View style={styles.folderList}>
                {folderNodes.map((node: VkNode) => (
                  <FolderRow key={node.id} node={node} palette={p} accent={accent} styles={styles} onPress={openNode} />
                ))}
              </View>
            )}

            {fileNodes.length > 0 && (
              <View style={styles.fileBox}>
                <View style={styles.fileBoxHeader}>
                  <Text style={styles.fileBoxTitle}>{fileNodes.length} {t.nav.downloads.toLowerCase()}</Text>
                  {(() => {
                    const isAnyFileActive = fileNodes.some(node => {
                      const d = findDownloadState(node);
                      return d && ['downloading', 'pending', 'paused'].includes(d.status);
                    });
                    return (
                      <Pressable
                        onPress={() => void (isAnyFileActive ? cancelAll() : downloadAll(fileNodes))}
                        style={({ pressed }) => [styles.bulkBtn, isAnyFileActive && { backgroundColor: `${p.danger}15` }, pressed && { opacity: 0.7 }]}
                      >
                        <Ionicons
                          name={isAnyFileActive ? "close-circle-outline" : "cloud-download-outline"}
                          size={14}
                          color={isAnyFileActive ? p.danger : p.primaryBright}
                        />
                        <Text style={[styles.bulkBtnText, isAnyFileActive && { color: p.danger }]}>
                          {isAnyFileActive ? "Tout annuler" : "Tout télécharger"}
                        </Text>
                      </Pressable>
                    );
                  })()}
                </View>
                <View style={styles.fileList}>
                  {fileNodes.map((node: VkNode) => (
                    <FileRow
                      key={node.id}
                      node={node}
                      palette={p}
                      accent={accent}
                      styles={styles}
                      download={findDownloadState(node)}
                      t={t}
                      onDownload={addDownload}
                      onPause={pauseDownload}
                      onResume={resumeDownload}
                      onCancel={cancelDownload}
                      onOpen={setReadingFile}
                      onNavigateLibrary={() => onNavigate?.("library")}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
        <View style={{ height: 90 }} />
      </ScrollView >

      {(isSyncing || isLoadingNode) && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={accent.accentBright} />
            <Text style={styles.loadingText}>{t.browser.loading}</Text>
          </View>
        </View>
      )}
    </View >
  );
};



