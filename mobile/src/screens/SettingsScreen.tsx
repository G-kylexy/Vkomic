import React, { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { Section } from "../components/Section";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { VkAuthModal } from "../components/VkAuthModal";
import { useVk } from "../context/VkContext";
import { useAppData } from "../context/AppDataContext";
import { getT, Language } from "../i18n";
import { radius, spacing, tabAccents } from "../theme";
import { pickFolder, getFolderDisplayName } from "../services/FolderService";

// Écran Paramètres (mobile).
export const SettingsScreen: React.FC = () => {
  const {
    token,
    setToken,
    groupId,
    setGroupId,
    topicId,
    setTopicId,
    language,
    setLanguage,
    autoSync,
    setAutoSync,
    downloadPath,
    setDownloadPath,
    activePalette: palette,
    showAuthModal,
    setShowAuthModal,
    handleAuthSuccess,
    logout,
  } = useVk();

  const { resetLibrary, clearCache } = useAppData();

  const t = getT(language);
  const accent = tabAccents.settings;

  // États locaux pour tous les paramètres modifiables
  const [localToken, setLocalToken] = useState(token);
  const [localGroupId, setLocalGroupId] = useState(groupId);
  const [localTopicId, setLocalTopicId] = useState(topicId);
  const [saved, setSaved] = useState(false);

  // États pour les dialogues de confirmation
  const [folderDialog, setFolderDialog] = useState<{ visible: boolean; folderName: string; folderUri: string }>({
    visible: false,
    folderName: "",
    folderUri: "",
  });
  const [resetDialog, setResetDialog] = useState(false);

  // Vérifier si quelque chose a changé
  const hasChanges = localToken !== token || localGroupId !== groupId || localTopicId !== topicId;

  // Sync localToken when context token changes (e.g. via deep link or auth modal)
  React.useEffect(() => {
    setLocalToken(token);
  }, [token]);

  const handleTokenChange = (text: string) => {
    // Check if pasted text is a VK OAuth URL
    if (text.includes("access_token=")) {
      try {
        const match = text.match(/access_token=([^&]+)/);
        if (match && match[1]) {
          setLocalToken(match[1]);
          return;
        }
      } catch (e) {
        // Fallback to normal text
      }
    }
    setLocalToken(text);
  };

  const handleSaveAll = async () => {
    if (localToken !== token) void setToken(localToken);
    if (localGroupId !== groupId) {
      void setGroupId(localGroupId);
      void clearCache();
    }
    if (localTopicId !== topicId) {
      void setTopicId(localTopicId);
      void clearCache();
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const resetGroupArgsLocal = () => {
    setLocalGroupId("203785966");
    setLocalTopicId("47515406");
  };

  const openAuth = async () => {
    const url = "https://oauth.vk.com/authorize?client_id=2685278&scope=offline,docs,groups,wall&redirect_uri=https://oauth.vk.com/blank.html&display=page&response_type=token&revoke=1";
    await WebBrowser.openBrowserAsync(url);
  };


  const setLang = (next: Language) => {
    void setLanguage(next);
  };

  const handlePickFolder = async () => {
    try {
      const folder = await pickFolder();
      if (folder) {
        // Ouvrir le dialogue de confirmation
        setFolderDialog({
          visible: true,
          folderName: getFolderDisplayName(folder.uri),
          folderUri: folder.uri,
        });
      }
    } catch (error) {
      console.error("Error picking folder:", error);
      Alert.alert("Erreur", "Impossible de sélectionner le dossier");
    }
  };

  const confirmFolderChange = async () => {
    if (folderDialog.folderUri) {
      await setDownloadPath(folderDialog.folderUri);
    }
    setFolderDialog({ visible: false, folderName: "", folderUri: "" });
  };

  const handleResetDatabase = () => {
    setResetDialog(true);
  };

  const confirmResetDatabase = async () => {
    await clearCache();
    await resetLibrary();
    setResetDialog(false);
  };



  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <LinearGradient
        colors={accent.gradientBright}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.headerTitle, { color: palette.text }]}>{t.nav.settings || "Paramètres"}</Text>
            <Text style={[styles.headerSubtitle, { color: palette.muted }]}>{t.settings.headerSubtitle}</Text>
          </View>
          <View style={[styles.headerIcon, { backgroundColor: `${accent.accent}20`, borderColor: `${accent.accent}40` }]}>
            <Ionicons name="settings" size={22} color={accent.accentBright} />
          </View>
        </View>
      </LinearGradient>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Section title={t.settings.connectionTitle}>
          {/* OAuth Login Button */}
          {!token ? (
            <Pressable
              style={[styles.vkLoginBtn, { backgroundColor: "#4C75A3" }]}
              onPress={() => setShowAuthModal(true)}
            >
              <Ionicons name="logo-vk" size={24} color="#fff" />
              <Text style={styles.vkLoginText}>Se connecter avec VK</Text>
            </Pressable>
          ) : (
            <View style={[styles.connectedBanner, { backgroundColor: `${palette.success}15`, borderColor: `${palette.success}40` }]}>
              <Ionicons name="checkmark-circle" size={20} color={palette.success} />
              <Text style={[styles.connectedText, { color: palette.success }]}>Connecté à VK</Text>
              <Pressable
                style={[styles.logoutBtn, { backgroundColor: `${palette.danger}15`, borderColor: `${palette.danger}40` }]}
                onPress={logout}
              >
                <Ionicons name="log-out-outline" size={16} color={palette.danger} />
                <Text style={[styles.logoutText, { color: palette.danger }]}>Déconnexion</Text>
              </Pressable>
            </View>
          )}

          {/* Manual token input (advanced) */}
          <View style={[styles.cardItem, { marginTop: spacing.md }]}>
            <Text style={[styles.label, { color: palette.muted }]}>Token manuel (avancé)</Text>
            <TextInput
              value={localToken}
              onChangeText={handleTokenChange}
              placeholder="vk1.a..."
              placeholderTextColor={palette.subtle}
              style={[styles.input, { backgroundColor: palette.surface, borderColor: `${palette.border}80`, color: palette.text, marginTop: spacing.xs }]}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.rowInputs}>
            <View style={styles.half}>
              <Text style={[styles.label, { color: palette.text }]}>{t.settings.groupLabel}</Text>
              <TextInput
                value={localGroupId}
                onChangeText={(value) => setLocalGroupId(value.replace(/[^\d]/g, ""))}
                placeholder="203785966"
                placeholderTextColor={palette.subtle}
                style={[styles.input, { backgroundColor: palette.surface, borderColor: `${palette.border}80`, color: palette.text }]}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.half}>
              <Text style={[styles.label, { color: palette.text }]}>{t.settings.topicLabel}</Text>
              <TextInput
                value={localTopicId}
                onChangeText={(value) => setLocalTopicId(value.replace(/[^\d]/g, ""))}
                placeholder="47515406"
                placeholderTextColor={palette.subtle}
                style={[styles.input, { backgroundColor: palette.surface, borderColor: `${palette.border}80`, color: palette.text }]}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.resetDefaultsButton,
              pressed && { opacity: 0.7 }
            ]}
            onPress={resetGroupArgsLocal}
          >
            <Text style={[styles.resetDefaultsText, { color: palette.muted }]}>{t.settings.resetGroupDefaults || "Rétablir les valeurs par défaut"}</Text>
          </Pressable>
        </Section>

        <Section title={t.settings.prefsTitle}>
          <View style={styles.cardItemRow}>
            <View style={styles.rowText}>
              <Text style={[styles.label, { color: palette.text }]}>{t.settings.languageLabel}</Text>
              <Text style={[styles.inlineText, { color: palette.muted }]}>
                {language === "fr" ? "Français" : language === "ru" ? "Русский" : "English"}
              </Text>
            </View>
            <View style={styles.langSwitch}>
              <Text
                style={[
                  styles.langOption,
                  language === "fr" && { backgroundColor: accent.accent, color: "#fff" },
                  { color: language === "fr" ? "#fff" : palette.muted }
                ]}
                onPress={() => setLang("fr")}
              >
                FR
              </Text>
              <Text
                style={[
                  styles.langOption,
                  language === "en" && { backgroundColor: accent.accent, color: "#fff" },
                  { color: language === "en" ? "#fff" : palette.muted }
                ]}
                onPress={() => setLang("en")}
              >
                EN
              </Text>
              <Text
                style={[
                  styles.langOption,
                  language === "ru" && { backgroundColor: accent.accent, color: "#fff" },
                  { color: language === "ru" ? "#fff" : palette.muted }
                ]}
                onPress={() => setLang("ru")}
              >
                RU
              </Text>
            </View>
          </View>

          {/* Download Folder Picker */}
          <Pressable
            style={[styles.folderPickerRow, { borderColor: `${palette.border}50` }]}
            onPress={handlePickFolder}
          >
            <View style={[styles.folderIcon, { backgroundColor: `${accent.accent}15`, borderColor: `${accent.accent}30` }]}>
              <Ionicons name="folder-open" size={22} color={accent.accentBright} />
            </View>
            <View style={styles.folderTextContainer}>
              <Text style={[styles.label, { color: palette.text }]}>
                {t.settings.downloadFolderLabel || "Dossier de téléchargement"}
              </Text>
              <Text style={[styles.folderPath, { color: palette.muted }]} numberOfLines={1}>
                {downloadPath ? getFolderDisplayName(downloadPath) : "Appuyez pour choisir..."}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={palette.subtle} />
          </Pressable>

        </Section>

        <Section title={t.settings.maintenanceTitle}>
          <Pressable style={styles.cardItemRow} onPress={handleResetDatabase}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.label, { color: palette.text }]}>{t.settings.resetDatabase || "Réinitialiser la base de données"}</Text>
              <Text style={{ fontSize: 11, color: palette.muted }}>
                {t.settings.resetDatabaseDescription || "Supprime l'index et les fichiers téléchargés"}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="trash-outline" size={18} color={palette.danger} />
            </View>
          </Pressable>
        </Section>
      </ScrollView>

      {/* Bouton Sauvegarder global */}
      {hasChanges && (
        <View style={[styles.saveBarContainer, { backgroundColor: palette.background }]}>
          <Pressable
            style={({ pressed }) => [
              styles.saveBar,
              {
                backgroundColor: saved ? `${palette.success}20` : `${accent.accent}20`,
                borderColor: saved ? `${palette.success}40` : `${accent.accent}40`,
              },
              pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }
            ]}
            onPress={handleSaveAll}
          >
            <View style={[styles.saveIconBox, { backgroundColor: saved ? `${palette.success}30` : `${accent.accent}30`, borderColor: saved ? `${palette.success}50` : `${accent.accent}50` }]}>
              <Ionicons
                name={saved ? "checkmark-circle" : "save"}
                size={20}
                color={saved ? palette.success : accent.accentBright}
              />
            </View>
            <Text style={[styles.saveBarText, { color: saved ? palette.success : accent.accentBright }]}>
              {saved ? (t.settings.saved || "Enregistré !") : (t.settings.save || "Sauvegarder")}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Dialog de confirmation pour le dossier de téléchargement */}
      <ConfirmDialog
        visible={folderDialog.visible}
        onClose={() => setFolderDialog({ visible: false, folderName: "", folderUri: "" })}
        onConfirm={confirmFolderChange}
        title="Changer le dossier"
        message={`Les prochains téléchargements seront sauvegardés dans:\n\n${folderDialog.folderName}`}
        confirmText="Confirmer"
        cancelText="Annuler"
        icon="folder-open"
        variant="success"
        palette={palette}
        accent={accent.accent}
      />

      {/* Dialog de confirmation pour la réinitialisation */}
      <ConfirmDialog
        visible={resetDialog}
        onClose={() => setResetDialog(false)}
        onConfirm={confirmResetDatabase}
        title="Réinitialiser"
        message="L'index et toutes vos données téléchargées seront supprimés. Vous devrez synchroniser à nouveau."
        confirmText="Réinitialiser"
        cancelText="Annuler"
        icon="trash"
        variant="danger"
        palette={palette}
        accent={accent.accent}
      />

      {/* Login VK Modal */}
      <VkAuthModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerGradient: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerPanel: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "900",
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  headerIconRow: {
    alignSelf: "flex-end",
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl + 40,
    gap: spacing.lg,
  },
  label: {
    fontWeight: "800",
    fontSize: 14,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontWeight: "700",
  },
  inlineInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.xs,
  },
  inlineText: {
    fontSize: 13,
  },
  rowInputs: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  half: {
    flex: 1,
    gap: spacing.xs,
  },
  cardItem: {
    backgroundColor: "transparent",
    paddingVertical: spacing.sm,
  },
  cardItemRow: {
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  langSwitch: {
    flexDirection: "row",
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.05)',
    overflow: "hidden",
  },
  langOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontWeight: "900",
    fontSize: 12,
  },
  langOptionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  resetDefaultsButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  resetDefaultsText: {
    fontSize: 11,
    fontWeight: "700",
    textDecorationLine: 'underline',
  },
  authButtonWrap: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  authButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.md,
    gap: 12,
  },
  authButtonText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
    flex: 1,
    textAlign: "center",
  },
  saveBarContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  saveBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  saveIconBox: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBarText: {
    fontWeight: "900",
    fontSize: 16,
  },
  tokenCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
  },
  tokenIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tokenTextContainer: {
    flex: 1,
    gap: 4,
  },
  tokenTitle: {
    fontSize: 14,
    fontWeight: "900",
  },
  tokenDescription: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  tokenArrowBox: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tokenHelpContainer: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  tokenHelpText: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  tokenHelpLink: {
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  tokenBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  tokenBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  tokenBadgeText: {
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: "800",
  },
  folderPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  folderIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  folderTextContainer: {
    flex: 1,
    gap: 4,
  },
  folderPath: {
    fontSize: 12,
    fontWeight: "600",
  },
  vkLoginBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  vkLoginText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  connectedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  connectedText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 12,
    fontWeight: "800",
  },
});
