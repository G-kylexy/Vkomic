import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
// Expo SDK 54+: pour garder `documentDirectory` + `readDirectoryAsync` on passe par l'API legacy.
import * as FileSystem from "expo-file-system/legacy";

import { Section } from "../components/Section";
import { useAppData } from "../context/AppDataContext";
import { useVk } from "../context/VkContext";
import { getT } from "../i18n";
import { palette, radius, spacing } from "../theme";

type LocalFile = {
  name: string;
  uri: string;
  size: number | null;
  modified: number | null;
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

// Bibliothèque locale (mobile) — vraie lecture du dossier de téléchargement interne (documentDirectory).
// Sur Android/iOS, on ne peut pas lister librement le stockage comme Electron: on expose donc les fichiers
// que l'app a téléchargés dans son sandbox.
export const LibraryScreen: React.FC = () => {
  const { language, downloadPath } = useVk();
  const t = getT(language);
  const { getDownloadDirUri } = useAppData();

  const [files, setFiles] = useState<LocalFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirUri = useMemo(() => getDownloadDirUri(), [getDownloadDirUri]);

  const refresh = useCallback(async () => {
    if (!dirUri) {
      setError(t.library.errorNoStorage);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const info = await FileSystem.getInfoAsync(dirUri);
      if (!info.exists || !info.isDirectory) {
        setFiles([]);
        return;
      }

      const names = await FileSystem.readDirectoryAsync(dirUri);
      const entries = await Promise.all(
        names.map(async (name) => {
          const uri = `${dirUri}${name}`;
          const finfo = await FileSystem.getInfoAsync(uri);
          if (!finfo.exists || finfo.isDirectory) {
            return { name, uri, size: null, modified: null } as LocalFile;
          }
          return {
            name,
            uri,
            size: typeof finfo.size === "number" ? finfo.size : null,
            modified:
              typeof finfo.modificationTime === "number"
                ? finfo.modificationTime
                : null,
          } as LocalFile;
        }),
      );

      entries.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
      setFiles(entries);
    } catch {
      setError(t.library.errorRead);
    } finally {
      setIsLoading(false);
    }
  }, [dirUri, t.library.errorNoStorage, t.library.errorRead]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t.library.title}</Text>
        <Text style={styles.subtitle}>{t.library.subtitle}</Text>
      </View>

      <Section title={t.library.folderTitle} subtitle={t.library.folderSubtitle}>
        <View style={styles.pathRow}>
          <Ionicons name="folder-open-outline" size={18} color={palette.muted} />
          <Text style={styles.pathText} numberOfLines={1}>
            {downloadPath}
          </Text>
        </View>
        <View style={styles.pathRow}>
          <Ionicons name="lock-closed-outline" size={16} color={palette.subtle} />
          <Text style={styles.pathHint} numberOfLines={2}>
            {dirUri ?? "--"}
          </Text>
        </View>

        <Pressable style={styles.refreshBtn} onPress={() => void refresh()}>
          <Ionicons
            name={isLoading ? "refresh" : "refresh-outline"}
            size={16}
            color={palette.text}
          />
          <Text style={styles.refreshText}>
            {isLoading ? t.browser.loading : t.library.refresh}
          </Text>
        </Pressable>
      </Section>

      {error && (
        <View style={styles.errorPill}>
          <Ionicons
            name="alert-circle-outline"
            size={16}
            color={palette.danger}
          />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Section title={t.library.recentTitle} subtitle={t.library.recentSubtitle}>
        {files.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons
              name="file-tray-outline"
              size={22}
              color={palette.subtle}
            />
            <Text style={styles.emptyText}>{t.library.empty}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {files.map((f) => (
              <View key={f.uri} style={styles.fileRow}>
                <View style={styles.fileIcon}>
                  <Ionicons
                    name="document-text-outline"
                    size={18}
                    color={palette.muted}
                  />
                </View>
                <View style={styles.fileText}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {f.name}
                  </Text>
                  <Text style={styles.fileMeta} numberOfLines={1}>
                    {formatBytes(f.size)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Section>

      <View style={styles.note}>
        <Text style={styles.noteText}>{t.library.note}</Text>
      </View>

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
  header: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    gap: 6,
  },
  title: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "900",
  },
  subtitle: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  pathRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pathText: {
    color: palette.text,
    fontWeight: "800",
    flex: 1,
  },
  pathHint: {
    color: palette.subtle,
    fontWeight: "700",
    flex: 1,
    fontSize: 12,
  },
  refreshBtn: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    paddingVertical: 10,
  },
  refreshText: {
    color: palette.text,
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
  empty: {
    alignItems: "center",
    paddingVertical: 10,
    gap: 8,
  },
  emptyText: {
    color: palette.muted,
    fontWeight: "800",
  },
  list: {
    gap: spacing.sm,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 6,
  },
  fileIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: "#0b1220",
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    alignItems: "center",
    justifyContent: "center",
  },
  fileText: {
    flex: 1,
    gap: 2,
  },
  fileName: {
    color: palette.text,
    fontWeight: "800",
  },
  fileMeta: {
    color: palette.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  note: {
    borderRadius: radius.lg,
    backgroundColor: `${palette.border}40`,
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    padding: spacing.lg,
  },
  noteText: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
});
