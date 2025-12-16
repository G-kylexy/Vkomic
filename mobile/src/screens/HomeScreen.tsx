import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { TabId } from "../components/BottomNav";
import { getT } from "../i18n";
import { useAppData } from "../context/AppDataContext";
import { useVk } from "../context/VkContext";
import { palette, radius, spacing } from "../theme";
import { VkNode } from "../types";

// Home (mobile) = Explorateur VK (même identité que la version PC).
// Rôle de cet écran :
// - synchroniser l’index VK (bouton "Synchroniser") ;
// - naviguer dans les dossiers VK (breadcrumbs + cartes de dossiers) ;
// - lancer des téléchargements réels sur les fichiers (bouton "Télécharger" → file gérée par AppDataContext) ;
// - afficher un état discret mais premium de la connexion VK (pastille + ping).
export const HomeScreen: React.FC<{ onNavigate?: (tab: TabId) => void }> = ({
  onNavigate,
}) => {
  const { token, status, language } = useVk();
  const t = getT(language);
  const {
    syncedData,
    navPath,
    currentNodes,
    currentFolder,
    isSyncing,
    isLoadingNode,
    error,
    searchQuery,
    setSearchQuery,
    syncRoot,
    openNode,
    goHome,
    goUp,
    addDownload,
    downloads,
  } = useAppData();

  const folderNodes = currentNodes.filter((n) => n.type !== "file");
  const fileNodes = currentNodes.filter((n) => n.type === "file");

  // Permet de retrouver l’éventuel téléchargement déjà lancé pour un fichier donné.
  const findDownloadState = (node: VkNode) => {
    if (!node.url) return null;
    return downloads.find((d) => d.url === node.url) ?? null;
  };

  // Icône "premium" pour les dossiers VK (catégories / séries).
  const renderFolderIcon = (node: VkNode) => {
    const kind = node.type === "category" ? "albums" : "folder";
    return (
      <View style={styles.iconTile}>
        <Ionicons name={kind as any} size={22} color={palette.primaryBright} />
      </View>
    );
  };

  // Icône de fichier selon l’extension (PDF, CBZ/CBR, archive, etc.).
  const renderFileIcon = (node: VkNode) => {
    const ext = (node.extension || "").toUpperCase();
    const icon =
      ext === "PDF"
        ? "document-text-outline"
        : ext === "CBZ" || ext === "CBR"
          ? "book-outline"
          : ext === "ZIP" || ext === "RAR" || ext === "7Z"
            ? "archive-outline"
            : "document-outline";
    return (
      <View style={[styles.iconTile, { backgroundColor: "#0b1220" }]}>
        <Ionicons name={icon as any} size={20} color={palette.muted} />
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {/* Header premium discret (branding VKomic + état VK/ping). */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Image
              source={require("../../assets/icon.png")}
              style={styles.brandIcon}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brandText}>VKomic</Text>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusPill}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: status.connected
                    ? palette.success
                    : palette.danger,
                },
              ]}
            />
            <Text style={styles.statusText}>
              {status.connected ? t.home.connected : t.home.disconnected}
            </Text>
            {typeof status.latencyMs === "number" && status.connected && (
              <Text style={styles.pingText}>{status.latencyMs}ms</Text>
            )}
          </View>
        </View>
      </View>

      {/* Barre de recherche + bouton de synchronisation VK. */}
      <View style={styles.actions}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color={palette.subtle} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t.browser.searchPlaceholder}
            placeholderTextColor={palette.subtle}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {Boolean(searchQuery) && (
            <Pressable onPress={() => setSearchQuery("")} style={styles.clearBtn}>
              <Ionicons name="close" size={16} color={palette.muted} />
            </Pressable>
          )}
        </View>

        <Pressable
          style={[styles.syncBtn, (isSyncing || !token) && styles.syncBtnDisabled]}
          onPress={() => void syncRoot()}
          disabled={isSyncing || !token}
        >
          <Ionicons
            name={isSyncing ? "refresh" : "sync"}
            size={16}
            color="#fff"
          />
          <Text style={styles.syncText}>
            {isSyncing ? t.browser.syncing : t.browser.sync}
          </Text>
        </Pressable>
      </View>

      {/* Breadcrumbs */}
      <View style={styles.breadcrumbs}>
        <Pressable style={styles.crumb} onPress={goHome}>
          <Ionicons name="home-outline" size={16} color={palette.muted} />
          <Text style={styles.crumbText}>{t.browser.home}</Text>
        </Pressable>
        {navPath.map((node, idx) => (
          <Pressable
            key={`${node.id}-${idx}`}
            style={styles.crumb}
            onPress={() => goUp(idx)}
          >
            <Ionicons name="chevron-forward" size={14} color={palette.subtle} />
            <Text style={styles.crumbText} numberOfLines={1}>
              {node.title}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {!token && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t.browser.noTokenTitle}</Text>
            <Text style={styles.emptySubtitle}>{t.browser.noTokenSubtitle}</Text>
            <Pressable
              style={styles.primaryCta}
              onPress={() => onNavigate?.("settings")}
            >
              <Ionicons name="settings-outline" size={16} color="#fff" />
              <Text style={styles.primaryCtaText}>{t.browser.goSettings}</Text>
            </Pressable>
          </View>
        )}

        {token && !syncedData && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t.browser.emptyTitle}</Text>
            <Text style={styles.emptySubtitle}>{t.browser.emptySubtitle}</Text>
            <Pressable style={styles.primaryCta} onPress={() => void syncRoot()}>
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={styles.primaryCtaText}>{t.browser.sync}</Text>
            </Pressable>
          </View>
        )}

        {error && (
          <View style={styles.errorPill}>
            <Ionicons name="alert-circle-outline" size={16} color={palette.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {syncedData && (
          <>
            {currentFolder && (
              <View style={styles.currentFolderRow}>
                <Ionicons name="folder-open-outline" size={16} color="#60a5fa" />
                <Text style={styles.currentFolderText} numberOfLines={1}>
                  {currentFolder.title}
                </Text>
              </View>
            )}

            {/* Folders grid (premium cards) */}
            {folderNodes.length > 0 && (
              <View style={styles.grid}>
                {folderNodes.map((node) => (
                  <Pressable
                    key={node.id}
                    style={styles.folderCard}
                    onPress={() => void openNode(node)}
                  >
                    <View style={styles.folderTopRow}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>VK</Text>
                      </View>
                      <View style={styles.badgeGhost}>
                        <Text style={styles.badgeGhostText}>DIR</Text>
                      </View>
                    </View>

                    <View style={styles.folderIconRow}>{renderFolderIcon(node)}</View>
                    <Text style={styles.folderTitle} numberOfLines={2}>
                      {node.title}
                    </Text>
                    <Text style={styles.folderMeta} numberOfLines={1}>
                      {(node.type || "folder").toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Files list */}
            {fileNodes.length > 0 && (
              <View style={styles.fileBox}>
                <View style={styles.fileBoxHeader}>
                  <Text style={styles.fileBoxTitle}>
                    {t.downloads.title} • {fileNodes.length}
                  </Text>
                </View>
                <View style={styles.fileList}>
                  {fileNodes.map((node) => {
                    const d = findDownloadState(node);
                    const statusLabel =
                      d?.status === "completed"
                        ? t.downloads.statusCompleted
                        : d?.status === "paused"
                          ? t.downloads.statusPaused
                          : d?.status === "downloading" || d?.status === "pending"
                            ? t.downloads.statusDownloading
                            : null;

                    return (
                      <View key={node.id} style={styles.fileRow}>
                        {renderFileIcon(node)}
                        <View style={styles.fileText}>
                          <Text style={styles.fileTitle} numberOfLines={2}>
                            {node.title}
                          </Text>
                          <Text style={styles.fileSub} numberOfLines={1}>
                            {node.extension || "FILE"}
                            {d?.status && statusLabel ? ` • ${statusLabel}` : ""}
                            {typeof d?.progress === "number" &&
                            d.status !== "completed"
                              ? ` • ${d.progress}%`
                              : ""}
                          </Text>
                        </View>
                        <Pressable
                          style={[
                            styles.fileAction,
                            d?.status === "completed" && styles.fileActionDone,
                          ]}
                          onPress={() => {
                            if (d?.status === "completed") {
                              onNavigate?.("library");
                            } else {
                              void addDownload(node);
                            }
                          }}
                          disabled={d?.status === "downloading" || d?.status === "pending"}
                        >
                          <Text style={styles.fileActionText}>
                            {d?.status === "completed"
                              ? t.browser.open
                              : t.browser.download}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </>
        )}

        {/* Spacer for bottom nav */}
        <View style={{ height: 90 }} />
      </ScrollView>

      {(isSyncing || isLoadingNode) && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#60a5fa" />
            <Text style={styles.loadingText}>{t.browser.loading}</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    overflow: "hidden",
  },
  brandIcon: {
    width: 18,
    height: 18,
  },
  brandText: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: `${palette.surface}CC`,
    borderWidth: 1,
    borderColor: `${palette.border}80`,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statusText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  pingText: {
    color: palette.subtle,
    fontSize: 12,
    fontWeight: "800",
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    gap: spacing.sm,
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    color: palette.text,
    fontWeight: "700",
  },
  clearBtn: {
    padding: 4,
  },
  syncBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.primary,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  syncBtnDisabled: {
    opacity: 0.5,
  },
  syncText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
  },
  breadcrumbs: {
    paddingHorizontal: spacing.lg,
    paddingTop: 2,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 8,
  },
  crumb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 140,
  },
  crumbText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  emptyCard: {
    backgroundColor: palette.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    padding: spacing.lg,
    gap: 10,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "900",
  },
  emptySubtitle: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryCta: {
    marginTop: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.primary,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryCtaText: {
    color: "#fff",
    fontWeight: "900",
  },
  errorPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${palette.danger}55`,
    backgroundColor: `${palette.danger}12`,
  },
  errorText: {
    color: palette.muted,
    fontWeight: "700",
    flex: 1,
  },
  currentFolderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  currentFolderText: {
    color: palette.text,
    fontWeight: "900",
    flex: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  folderCard: {
    width: "48%",
    backgroundColor: palette.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    padding: spacing.lg,
    gap: 10,
  },
  folderTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: {
    backgroundColor: palette.primary,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  badgeGhost: {
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeGhostText: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  folderIconRow: {
    alignItems: "center",
  },
  iconTile: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    alignItems: "center",
    justifyContent: "center",
  },
  folderTitle: {
    color: palette.text,
    fontWeight: "900",
    fontSize: 14,
    minHeight: 36,
  },
  folderMeta: {
    color: palette.subtle,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  fileBox: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    overflow: "hidden",
  },
  fileBoxHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: `${palette.border}80`,
    backgroundColor: palette.surface,
  },
  fileBoxTitle: {
    color: palette.text,
    fontWeight: "900",
    fontSize: 12,
  },
  fileList: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  fileRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  fileText: {
    flex: 1,
    gap: 4,
  },
  fileTitle: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 13,
  },
  fileSub: {
    color: palette.muted,
    fontWeight: "700",
    fontSize: 11,
  },
  fileAction: {
    backgroundColor: palette.primary,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fileActionDone: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: `${palette.border}80`,
  },
  fileActionText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  loadingCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    padding: spacing.lg,
    alignItems: "center",
    gap: 10,
    minWidth: 200,
  },
  loadingText: {
    color: palette.muted,
    fontWeight: "800",
  },
});
