import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Pressable, FlatList, ScrollView, StyleSheet, Text, View, Alert, ListRenderItemInfo, Platform, Animated, Easing, BackHandler, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
// Expo SDK 54+: pour garder `documentDirectory` + `readDirectoryAsync` on passe par l'API legacy.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import ReactNativeBlobUtil from "react-native-blob-util";

import { Section } from "../components/Section";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useAppData } from "../context/AppDataContext";
import { useVk } from "../context/VkContext";
import { getT } from "../i18n";
import { palette as defaultPalette, radius, spacing, tabAccents } from "../theme";
import * as FolderService from "../services/FolderService";
import { SafError, SafErrorType } from "../services/FolderService";

type LocalFile = {
  name: string;
  uri: string;
  size: number | null;
  modified: number | null;
  isDirectory: boolean;
};

const formatBytes = (bytes: number | null) => {
  if (!bytes || !Number.isFinite(bytes)) return "--";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  const digits = idx <= 1 ? 0 : 1;
  return `${val.toFixed(digits)} ${units[idx]}`;
};

type LibraryFileRowProps = {
  file: LocalFile;
  palette: typeof defaultPalette;
  styles: any;
  accentColor: string;
  onPress: (file: LocalFile) => void;
  onDelete: (file: LocalFile) => void;
  onShare: (file: LocalFile) => void;
};

const SkeletonRow = React.memo<{ styles: any, palette: typeof defaultPalette }>(({ styles, palette: p }) => {
  const op = React.useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(op, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(op, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [op]);

  return (
    <View style={styles.fileContainer}>
      <View style={[styles.fileRow, { borderColor: 'transparent', backgroundColor: `${p.surface}40` }]}>
        <Animated.View style={[styles.fileIcon, { opacity: op, backgroundColor: `${p.text}10`, borderWidth: 0 }]} />
        <View style={styles.fileText}>
          <Animated.View style={{ width: '60%', height: 16, backgroundColor: `${p.text}10`, borderRadius: 4, opacity: op, marginBottom: 6 }} />
          <Animated.View style={{ width: '30%', height: 12, backgroundColor: `${p.text}10`, borderRadius: 4, opacity: op }} />
        </View>
      </View>
    </View>
  );
});

const LibraryFileRow = React.memo<LibraryFileRowProps>(({ file: f, palette: p, styles, accentColor, onPress, onDelete, onShare }) => {
  const isGrid = styles.fileContainer.width !== undefined;

  return (
    <View style={styles.fileContainer}>
      <View style={styles.fileRow}>
        <Pressable
          style={({ pressed }) => [
            styles.fileRowInner,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => void onPress(f)}
        >
          <View style={[styles.fileIcon, f.isDirectory && { backgroundColor: `${p.primary}15`, borderColor: `${p.primary}30` }]}>
            <Ionicons
              name={f.isDirectory ? "folder" : (f.name.toLowerCase().endsWith(".pdf") ? "book-outline" : "document-text-outline")}
              size={18}
              color={f.isDirectory ? p.primary : (f.name.toLowerCase().endsWith(".pdf") ? p.primaryBright : p.muted)}
            />
          </View>
          <View style={styles.fileText}>
            <Text style={styles.fileName}>
              {f.name}
            </Text>
            <Text style={styles.fileMeta} numberOfLines={1}>
              {f.isDirectory ? "Dossier" : formatBytes(f.size)}
            </Text>
          </View>
        </Pressable>
        {!f.isDirectory && (
          <View style={styles.actionsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.deleteBtn,
                pressed && { opacity: 0.7 }
              ]}
              hitSlop={8}
              onPress={() => void onShare(f)}
            >
              <Ionicons name="share-social-outline" size={20} color={p.primaryBright} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.deleteBtn,
                { marginLeft: 4, borderColor: `${accentColor}50`, backgroundColor: `${accentColor}15` },
                pressed && { opacity: 0.7 }
              ]}
              hitSlop={8}
              onPress={() => void onDelete(f)}
            >
              <Ionicons name="trash-outline" size={20} color={accentColor} />
            </Pressable>
          </View>
        )}
        {f.isDirectory && (
          <Ionicons name="chevron-forward" size={18} color={p.subtle} style={{ marginLeft: 8 }} />
        )}
      </View>
    </View>
  );
});

interface LibraryScreenProps {
  isActive?: boolean;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = ({ isActive = false }) => {
  const { language, activePalette: p, downloadPath } = useVk();
  const { width: screenWidth } = useWindowDimensions();
  const t = getT(language);
  const accent = tabAccents.library;
  const styles = useMemo(() => stylesWithPalette(p, accent, screenWidth), [p, accent, screenWidth]);

  const { getDownloadDirUri, deleteLocalFile, setReadingFile } = useAppData();

  const [files, setFiles] = useState<LocalFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string[]>([]); // Pile de dossiers relatifs
  const [deleteDialog, setDeleteDialog] = useState<{ visible: boolean; file: LocalFile | null }>({
    visible: false,
    file: null,
  });

  // Ref to track current path for BackHandler (avoids stale closure)
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;

  // Ref for breadcrumb auto-scroll to right
  const breadcrumbScrollRef = useRef<ScrollView>(null);

  // Handle hardware back button
  useEffect(() => {
    if (!isActive) return;

    const backAction = () => {
      if (currentPathRef.current.length > 0) {
        setCurrentPath(prev => prev.slice(0, -1));
        return true; // Prevent app exit
      }
      return false; // Default behavior
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, [isActive]);




  // rootUri must depend on downloadPath to update when settings change
  const rootUri = useMemo(() => getDownloadDirUri(), [getDownloadDirUri, downloadPath]);

  const dirUri = useMemo(() => {
    if (!rootUri) return null;
    return currentPath.length > 0 ? `${rootUri}${currentPath.join("/")}/` : rootUri;
  }, [rootUri, currentPath]);

  // Reset navigation path and clear files when root directory changes (e.g. from Settings)
  useEffect(() => {
    setCurrentPath([]);
    setFiles([]); // Clear list purely on root change
    // The change in dirUri (via rootUri) will trigger the refresh effect below
  }, [rootUri]);

  // Check if using SAF content:// URI
  const isSafUri = dirUri?.startsWith("content://") ?? false;

  // Get display name for the folder
  const folderDisplayName = useMemo(() => {
    if (!downloadPath) return "VKomic Downloads";
    return FolderService.getFolderDisplayName(downloadPath);
  }, [downloadPath]);

  const refresh = useCallback(async () => {
    if (!dirUri) {
      setError(t.library.errorNoStorage);
      return;
    }

    setIsLoading(true);
    // Note: We don't clear files here anymore to avoid flashing when switching tabs.
    // Files are cleared only when the root directory actually changes (see useEffect above).
    setError(null);
    try {
      // SAF: use FolderService to list files
      if (isSafUri) {
        // Step 1: Verify folder permissions are still valid
        const hasPermission = await FolderService.ensureFolderPermission(dirUri);
        if (!hasPermission) {
          setError(t.library.errorPermission);
          setFiles([]);
          return;
        }

        // Step 2: List files using FolderService.listFiles (INSTANT MODE - no sizes yet)
        const safFiles = await FolderService.listFiles(dirUri);

        // Step 3: Convert to LocalFile format immediately
        const entries: LocalFile[] = safFiles.map(f => ({
          name: f.name,
          uri: f.uri,
          size: f.size,
          modified: f.lastModified,
          isDirectory: f.isDirectory,
        }));

        // Sort: directories first, then by modification date (most recent first)
        entries.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return (b.modified ?? 0) - (a.modified ?? 0);
        });

        // Update UI immediately with unknown sizes
        setFiles(entries);
        setIsLoading(false); // Stop loading spinner

        // Step 4: Load metadata progressively in background
        // We do this in batches to avoid freezing UI
        const loadMetadata = async () => {
          // Only process files that have size 0 (unknown)
          const filesToUpdate = entries.filter(f => !f.isDirectory);
          if (filesToUpdate.length === 0) return;

          // Process batch by batch
          const BATCH_SIZE = 5;
          for (let i = 0; i < filesToUpdate.length; i += BATCH_SIZE) {
            const batch = filesToUpdate.slice(i, i + BATCH_SIZE);

            // Check if component is still mounted/valid (naive check via dirUri ref if needed, but here simple)
            // In a real app we would use a ref like isMounted

            const updates = await Promise.all(batch.map(async (file) => {
              try {
                const info = await FileSystem.getInfoAsync(file.uri);
                if (info.exists) {
                  return {
                    uri: file.uri,
                    size: (info as any).size || 0,
                    modified: (info as any).modificationTime || Date.now()
                  };
                }
              } catch (e) {
                // Ignore errors
              }
              return null;
            }));

            // Update state with new metadata
            setFiles(prev => {
              const next = [...prev];
              let changed = false;
              updates.forEach(update => {
                if (update) {
                  const idx = next.findIndex(f => f.uri === update.uri);
                  if (idx !== -1) {
                    next[idx] = { ...next[idx], size: update.size, modified: update.modified };
                    changed = true;
                  }
                }
              });
              return changed ? next : prev;
            });

            // Small pause to yield to UI thread
            await new Promise(r => setTimeout(r, 50));
          }
        };
        return;
      }



      // Android: use ReactNativeBlobUtil for public Downloads folder
      if (Platform.OS === "android" && !dirUri.startsWith("file://")) {
        const exists = await ReactNativeBlobUtil.fs.exists(dirUri);
        if (!exists) {
          // Create the directory if it doesn't exist
          try {
            await ReactNativeBlobUtil.fs.mkdir(dirUri);
          } catch { }
          setFiles([]);
          return;
        }

        const isDir = await ReactNativeBlobUtil.fs.isDir(dirUri);
        if (!isDir) {
          setFiles([]);
          return;
        }

        const names = await ReactNativeBlobUtil.fs.ls(dirUri);
        const entriesAndroid = await Promise.all(
          names.map(async (name) => {
            const filePath = `${dirUri}/${name}`;
            const isDirectory = await ReactNativeBlobUtil.fs.isDir(filePath);
            let size: number | null = null;
            let modified: number | null = null;

            if (!isDirectory) {
              try {
                const stat = await ReactNativeBlobUtil.fs.stat(filePath);
                size = typeof stat.size === "number" ? stat.size : null;
                modified = typeof stat.lastModified === "number" ? stat.lastModified : null;
              } catch { }
            }

            return {
              name,
              uri: filePath,
              isDirectory,
              size,
              modified,
            } as LocalFile;
          }),
        );

        // Trier : dossiers d'abord, puis par date de modif
        entriesAndroid.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return (b.modified ?? 0) - (a.modified ?? 0);
        });
        setFiles(entriesAndroid);
        return;
      }

      // iOS: use expo-file-system
      const info = await FileSystem.getInfoAsync(dirUri);
      if (!info.exists || !info.isDirectory) {
        setFiles([]);
        return;
      }

      const names = await FileSystem.readDirectoryAsync(dirUri);
      const entriesIos = await Promise.all(
        names.map(async (name) => {
          const uri = `${dirUri}${name}`;
          const finfo = await FileSystem.getInfoAsync(uri);

          return {
            name,
            uri,
            isDirectory: finfo.exists && finfo.isDirectory,
            size: finfo.exists && "size" in finfo && typeof finfo.size === "number" ? finfo.size : null,
            modified:
              finfo.exists && "modificationTime" in finfo && typeof finfo.modificationTime === "number"
                ? finfo.modificationTime
                : null,
          } as LocalFile;
        }),
      );

      // Trier : dossiers d'abord, puis par date de modif
      entriesIos.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return (b.modified ?? 0) - (a.modified ?? 0);
      });
      setFiles(entriesIos);
    } catch (error) {
      // Handle specific SAF errors
      if (error instanceof SafError) {
        switch (error.type) {
          case SafErrorType.PERMISSION_DENIED:
            setError(t.library.errorPermission);
            break;
          case SafErrorType.FOLDER_NOT_FOUND:
            setError("Dossier introuvable (clé USB débranchée ?)");
            break;
          default:
            setError(t.library.errorRead);
        }
      } else {
        setError(t.library.errorRead);
      }
    } finally {
      setIsLoading(false);
    }
  }, [dirUri, isSafUri, t.library.errorNoStorage, t.library.errorRead, t.library.errorPermission]);

  const onFilePress = useCallback(async (file: LocalFile) => {
    if (file.isDirectory) {
      setCurrentPath(prev => [...prev, file.name]);
      return;
    }

    const ext = file.name.toLowerCase().split('.').pop();

    // SAF content:// URIs need special handling
    // For Android raw paths, prefix with file:// for readers and sharing
    let fileUri = file.uri;
    if (Platform.OS === "android" && !file.uri.startsWith("file://") && !file.uri.startsWith("content://")) {
      fileUri = `file://${file.uri}`;
    }

    // For PDFs, use system viewer for SAF URIs, internal reader for local files
    if (ext === 'pdf') {
      try {
        if (file.uri.startsWith("content://")) {
          // SAF URIs: use system PDF viewer directly (no cache copy needed)
          const opened = await FolderService.openFile(file.uri);
          if (!opened) {
            Alert.alert("Erreur", "Aucune application PDF n'est installée.");
          }
        } else {
          // Local files: use internal reader
          setReadingFile({ uri: fileUri, title: file.name });
        }
      } catch (error) {
        if (error instanceof SafError && error.type === SafErrorType.NO_APP_AVAILABLE) {
          Alert.alert("Erreur", "Aucune application PDF n'est installée sur cet appareil.");
        } else if (error instanceof SafError) {
          Alert.alert("Erreur", error.message);
        } else {
          Alert.alert("Erreur", "Impossible d'ouvrir le fichier PDF.");
        }
      }
      return;
    }

    // For other files, try to open with system app
    try {
      if (file.uri.startsWith("content://")) {
        const opened = await FolderService.openFile(file.uri);
        if (opened) return;
      }
    } catch (error) {
      if (error instanceof SafError && error.type === SafErrorType.NO_APP_AVAILABLE) {
        Alert.alert(
          "Aucune application",
          "Aucune application n'est disponible pour ouvrir ce type de fichier."
        );
        return;
      }
    }

    // Fallback to sharing
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert("Partage", "Le partage n'est pas disponible sur cet appareil.");
        return;
      }
      await Sharing.shareAsync(fileUri, {
        UTI: "public.data",
        mimeType: "application/octet-stream",
        dialogTitle: `Ouvrir ${file.name}`,
      });
    } catch (e) {
      console.error("Failed to share file", e);
    }
  }, [setReadingFile]);

  const onDeletePress = useCallback((file: LocalFile) => {
    setDeleteDialog({ visible: true, file });
  }, []);

  const confirmDelete = useCallback(async () => {
    const file = deleteDialog.file;
    if (!file) return;

    // Supprimer immédiatement du state local pour un feedback instantané
    setFiles(prev => prev.filter(f => f.uri !== file.uri));
    setDeleteDialog({ visible: false, file: null });

    try {
      // Supprimer le fichier en arrière-plan
      if (file.uri.startsWith("content://")) {
        await FolderService.deleteFile(file.uri);
      } else {
        await deleteLocalFile(file.uri);
      }
    } catch (e) {
      // En cas d'erreur, restaurer le fichier dans la liste et afficher l'erreur
      setFiles(prev => [...prev, file].sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return (b.modified ?? 0) - (a.modified ?? 0);
      }));
      Alert.alert("Erreur", "Impossible de supprimer le fichier.");
    }
  }, [deleteDialog.file, deleteLocalFile]);

  const onSharePress = useCallback(async (file: LocalFile) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert("Partage", "Le partage n'est pas disponible sur cet appareil.");
        return;
      }

      const ext = file.name.toLowerCase().split('.').pop();
      const mimeType = ext === 'pdf' ? 'application/pdf'
        : ext === 'cbz' ? 'application/x-cbz'
          : ext === 'cbr' ? 'application/x-cbr'
            : 'application/octet-stream';

      let fileUri = file.uri;

      // For SAF content:// URIs on Android, copy to temp first (expo-sharing doesn't handle SAF well)
      if (Platform.OS === "android" && file.uri.startsWith("content://")) {
        const tempPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/share_${Date.now()}_${file.name}`;
        const copied = await FolderService.copySafToLocal(file.uri, tempPath);
        if (!copied) {
          Alert.alert("Erreur", "Impossible de préparer le fichier pour le partage.");
          return;
        }
        fileUri = `file://${tempPath}`;
      } else if (Platform.OS === "android" && !file.uri.startsWith("file://")) {
        fileUri = `file://${file.uri}`;
      }

      await Sharing.shareAsync(fileUri, {
        UTI: "public.data",
        mimeType: mimeType,
        dialogTitle: `Partager ${file.name}`,
      });
    } catch (e) {
      console.error("Failed to share file", e);
      Alert.alert("Erreur", "Impossible de partager le fichier.");
    }
  }, []);

  // Refresh on mount or when directory changes
  useEffect(() => {
    if (isActive) {
      void refresh();
    }
  }, [refresh, dirUri, isActive]);

  const totalSize = useMemo(() => {
    const bytes = files.reduce((acc, f) => acc + (f.size || 0), 0);
    return formatBytes(bytes);
  }, [files]);

  const renderItem = useCallback(({ item: f }: ListRenderItemInfo<LocalFile>) => (
    <LibraryFileRow
      file={f}
      palette={p}
      styles={styles}
      accentColor={accent.accent}
      onPress={onFilePress}
      onDelete={onDeletePress}
      onShare={onSharePress}
    />
  ), [p, styles, accent, onFilePress, onDeletePress, onSharePress]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={accent.gradientBright}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>{t.nav.library || "Bibliothèque"}</Text>
            <Text style={styles.headerSubtitle}>{folderDisplayName}</Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name="library" size={22} color={accent.accentBright} />
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{files.length}</Text>
            <Text style={styles.statLabel}>{t.library.statsFiles}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalSize}</Text>
            <Text style={styles.statLabel}>{t.library.statsTotal}</Text>
          </View>
          <View style={styles.statDivider} />
          <Pressable
            style={({ pressed }) => [
              styles.refreshBtnCompact,
              pressed && { opacity: 0.7 },
              isLoading && { opacity: 0.5 }
            ]}
            onPress={() => void refresh()}
            disabled={isLoading}
          >
            <Ionicons
              name={isLoading ? "sync" : "refresh-outline"}
              size={18}
              color={accent.accentBright}
            />
          </Pressable>
          <View style={styles.statDivider} />
          <Pressable
            style={({ pressed }) => [
              styles.refreshBtnCompact,
              pressed && { opacity: 0.7 }
            ]}
            onPress={() => {
              if (dirUri) {
                FolderService.openFileLocation(dirUri).then(opened => {
                  if (!opened) {
                    Alert.alert("Information", "Impossible d'ouvrir le dossier directement. Veuillez utiliser votre gestionnaire de fichiers.");
                  }
                });
              }
            }}
          >
            <Ionicons name="folder-open-outline" size={18} color={accent.accentBright} />
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {currentPath.length > 0 && (
          <View style={styles.breadcrumbContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.breadcrumbBar}
              ref={breadcrumbScrollRef}
              onContentSizeChange={() => {
                breadcrumbScrollRef.current?.scrollToEnd({ animated: true });
              }}
            >
              <Pressable style={styles.breadcrumbItem} onPress={() => setCurrentPath([])}>
                <Ionicons name="home-outline" size={16} color={p.muted} />
              </Pressable>
              {currentPath.map((name, idx) => (
                <React.Fragment key={`${name}-${idx}`}>
                  <Ionicons name="chevron-forward" size={14} color={p.subtle} style={{ marginHorizontal: 2 }} />
                  <Pressable
                    style={styles.breadcrumbItem}
                    onPress={() => setCurrentPath(currentPath.slice(0, idx + 1))}
                    disabled={idx === currentPath.length - 1}
                  >
                    <Text
                      style={[styles.breadcrumbText, idx === currentPath.length - 1 && { color: p.text }]}
                    >
                      {name}
                    </Text>
                  </Pressable>
                </React.Fragment>
              ))}
            </ScrollView>
          </View>
        )}

        {error && (
          <View style={styles.errorPill}>
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={p.danger}
            />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Section title={t.library.folderTitle} style={{ paddingHorizontal: 4 }}>
          {files.length === 0 ? (
            isLoading ? null : (
              <View style={styles.empty}>
                <View style={[styles.emptyIcon, { width: 80, height: 80, borderRadius: 40, backgroundColor: `${accent.accent}10`, borderWidth: 0 }]}>
                  <Ionicons
                    name="library-outline"
                    size={40}
                    color={accent.accent}
                  />
                </View>
                <Text style={[styles.emptyText, { fontSize: 16, color: p.text, marginTop: 16 }]}>{t.library.empty || "Aucun fichier trouvé"}</Text>
                <Text style={[styles.subtitle, { textAlign: 'center', maxWidth: '80%', marginTop: 8 }]}>
                  Vos fichiers PDF, CBZ et CBR apparaîtront ici.
                </Text>
              </View>
            )
          ) : (
            <FlatList
              data={files}
              keyExtractor={(f) => f.uri}
              renderItem={renderItem}
              scrollEnabled={false}
              key={screenWidth > 900 ? 'grid3' : screenWidth > 600 ? 'grid2' : 'list'}
              numColumns={screenWidth > 900 ? 3 : screenWidth > 600 ? 2 : 1}
              contentContainerStyle={styles.list}
              columnWrapperStyle={screenWidth > 600 ? { gap: screenWidth > 900 ? spacing.md : spacing.sm } : undefined}
              removeClippedSubviews={true}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
            />
          )}

          {isLoading && files.length === 0 && (
            <View style={styles.list}>
              <SkeletonRow styles={styles} palette={p} />
              <SkeletonRow styles={styles} palette={p} />
              <SkeletonRow styles={styles} palette={p} />
            </View>
          )}
        </Section>

        <View style={{ height: 90 }} />
      </ScrollView>

      {/* Dialog de confirmation pour la suppression */}
      <ConfirmDialog
        visible={deleteDialog.visible}
        onClose={() => setDeleteDialog({ visible: false, file: null })}
        onConfirm={confirmDelete}
        title="Supprimer le fichier ?"
        message={`Voulez-vous vraiment supprimer "${deleteDialog.file?.name || ""}" ? Cette action est irréversible.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        icon="trash"
        palette={p}
        accent={accent.accent}
      />
    </View>
  );
};

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
    container: {
      flex: 1,
      backgroundColor: p.background,
    },
    content: {
      paddingHorizontal: 12, // Réduit le padding gauche pour décaler l'interface
      paddingVertical: spacing.lg,
      paddingBottom: spacing.xl,
      gap: spacing.lg,
    },
    headerGradient: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },
    headerTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: "900",
      color: p.text,
    },
    headerSubtitle: {
      fontSize: 12,
      fontWeight: "700",
      color: p.muted,
      marginTop: 2,
    },
    headerIcon: {
      width: 42,
      height: 42,
      borderRadius: radius.md,
      backgroundColor: `${a.accent}20`,
      borderWidth: 1,
      borderColor: `${a.accent}40`,
      alignItems: "center",
      justifyContent: "center",
    },
    statsRow: {
      flexDirection: "row",
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: `${a.accent}30`,
      alignItems: "center",
    },
    statItem: {
      flex: 1,
      alignItems: "center",
    },
    statValue: {
      color: a.accentBright,
      fontSize: 20,
      fontWeight: "900",
    },
    statLabel: {
      color: p.subtle,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      marginTop: 2,
      textAlign: "center",
    },
    statDivider: {
      width: 1,
      height: 30,
      backgroundColor: `${p.border}50`,
    },
    header: {
      backgroundColor: p.surface,
      borderColor: `${p.border}80`,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      gap: 6,
    },
    title: {
      color: p.text,
      fontSize: 22,
      fontWeight: "900",
    },
    subtitle: {
      color: p.muted,
      fontSize: 13,
      lineHeight: 18,
    },
    list: {
      gap: spacing.sm,
    },
    fileContainer: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: spacing.xs,
    },
    fileRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: p.card,
      borderRadius: radius.xl,
      paddingVertical: spacing.md,
      paddingLeft: 0,
      paddingRight: 4,
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: `${p.border}50`,
      minHeight: 80,
      overflow: 'hidden',
    },
    fileRowInner: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      flexShrink: 1,
      minWidth: 0,
    },
    actionsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexShrink: 0, // Ne jamais rétrécir les boutons
    },
    fileIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: `${p.text}08`,
      borderWidth: 1,
      borderColor: `${p.border}50`,
      alignItems: "center",
      justifyContent: "center",
    },
    fileText: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
      gap: 2,
    },
    fileName: {
      color: p.text,
      fontSize: 14,
      fontWeight: "900",
    },
    fileMeta: {
      color: p.muted,
      fontSize: 11,
      fontWeight: "700",
    },

    deleteBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: `${p.surface}80`,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: `${p.border}80`,
    },
    refreshBtnCompact: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      backgroundColor: `${a.accent}10`,
      alignItems: "center",
      justifyContent: "center",
    },
    breadcrumbContainer: {
      marginBottom: spacing.xs,
      borderRadius: radius.md,
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: `${p.border}50`,
      overflow: 'hidden',
    },
    breadcrumbBar: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.sm,
      paddingRight: spacing.xl,
      minWidth: '100%',
    },
    breadcrumbItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 4,
    },
    breadcrumbText: {
      color: p.muted,
      fontSize: 13,
      fontWeight: "700",
    },
    errorPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: `${p.danger}55`,
      backgroundColor: `${p.danger}12`,
    },
    errorText: {
      color: p.muted,
      fontWeight: "700",
      flex: 1,
    },
    empty: {
      alignItems: "center",
      paddingVertical: spacing.xl,
      gap: spacing.sm,
    },
    emptyIcon: {
      width: 60,
      height: 60,
      borderRadius: radius.lg,
      backgroundColor: `${a.accent}10`,
      borderWidth: 1,
      borderColor: `${a.accent}25`,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.sm,
    },
    emptyText: {
      color: p.subtle,
      fontSize: 13,
      fontWeight: "700",
    },
  });
};
