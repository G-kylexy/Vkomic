import React, { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Pressable, // Added
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Section } from "../components/Section";
import { useVk } from "../context/VkContext";
import { getT, Language } from "../i18n";
import { palette, radius, spacing } from "../theme";

// Écran Paramètres (mobile).
// Objectif :
// - gérer le token VK et les IDs de groupe/sujet (même logique que sur la version PC) ;
// - choisir le dossier logique de téléchargement (affiché dans l’app) ;
// - changer la langue de l’interface (FR / EN / RU) et la sauvegarder.
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
    downloadPath,
    setDownloadPath,
  } = useVk();

  // Ouvre la page officielle VK OAuth dans un navigateur in‑app
  // pour aider l’utilisateur à récupérer son access token.
  const openAuth = async () => {
    // URL identique à la version Desktop pour garder le même flow.
    const url = "https://oauth.vk.com/authorize?client_id=2685278&scope=offline,docs,groups,wall&redirect_uri=https://oauth.vk.com/blank.html&display=page&response_type=token&revoke=1";
    await WebBrowser.openBrowserAsync(url);
  };

  // Remet les IDs VK par défaut (ceux utilisés sur la version PC).
  const resetGroupArgs = () => {
    void setGroupId("203785966");
    void setTopicId("47515406");
  };

  // Préférence locale (UI seulement pour l’instant) pour activer/désactiver une
  // synchronisation auto au démarrage de l’app.
  const [autoSync, setAutoSync] = useState(true);
  const t = getT(language);

  // Change la langue globale de l’app (persistée dans AsyncStorage via VkContext).
  const setLang = (next: Language) => {
    void setLanguage(next);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Bloc "Connexion VK" : token + IDs groupe/sujet. */}
      <Section title={t.settings.connectionTitle} subtitle={t.settings.connectionSubtitle}>
        <View style={styles.field}>
          <Text style={styles.label}>{t.settings.tokenLabel}</Text>
          <TextInput
            value={token}
            onChangeText={(value) => void setToken(value)}
            placeholder="vk1.a..."
            placeholderTextColor={palette.subtle}
            style={styles.input}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.inlineInfo}>
            <Ionicons name="link-outline" size={14} color={palette.primary} />
            <Pressable onPress={openAuth} hitSlop={10}>
              <Text style={[styles.inlineText, { color: palette.primary, textDecorationLine: 'underline' }]}>
                {t.settings.tokenHint}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.rowInputs}>
          <View style={styles.half}>
            <Text style={styles.label}>{t.settings.groupLabel}</Text>
            <TextInput
              value={groupId}
              onChangeText={(value) =>
                void setGroupId(value.replace(/[^\d]/g, ""))
              }
              placeholder="203785966"
              placeholderTextColor={palette.subtle}
              style={styles.input}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>{t.settings.topicLabel}</Text>
            <TextInput
              value={topicId}
              onChangeText={(value) =>
                void setTopicId(value.replace(/[^\d]/g, ""))
              }
              placeholder="47515406"
              placeholderTextColor={palette.subtle}
              style={styles.input}
              keyboardType="number-pad"
            />
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.resetDefaultsButton,
            pressed && { opacity: 0.7 }
          ]}
          onPress={resetGroupArgs}
        >
          <Text style={styles.resetDefaultsText}>{t.settings.resetGroupDefaults || "Rétablir les valeurs par défaut"}</Text>
        </Pressable>
      </Section>

      {/* Bloc "Préférences" : dossier logique + langue de l’UI. */}
      <Section title={t.settings.prefsTitle} subtitle={t.settings.prefsSubtitle}>
        <View style={styles.field}>
          <Text style={styles.label}>{t.settings.downloadFolderLabel}</Text>
          <TextInput
            value={downloadPath}
            onChangeText={(value) => void setDownloadPath(value)}
            style={styles.input}
            placeholderTextColor={palette.subtle}
            autoCorrect={false}
          />
        </View>

        {/* Sélecteur de langue : met à jour VkContext.language (FR / EN / RU). */}
        <View style={[styles.row, styles.rowCard]}>
          <View style={styles.rowText}>
            <Text style={styles.label}>{t.settings.languageLabel}</Text>
            <Text style={styles.inlineText}>
              {language === "fr" ? "Français" : language === "ru" ? "Русский" : "English"}
            </Text>
          </View>
          <View style={styles.langSwitch}>
            <Text
              style={[
                styles.langOption,
                language === "fr" && styles.langOptionActive,
              ]}
              onPress={() => setLang("fr")}
            >
              FR
            </Text>
            <Text
              style={[
                styles.langOption,
                language === "en" && styles.langOptionActive,
              ]}
              onPress={() => setLang("en")}
            >
              EN
            </Text>
            <Text
              style={[
                styles.langOption,
                language === "ru" && styles.langOptionActive,
              ]}
              onPress={() => setLang("ru")}
            >
              RU
            </Text>
          </View>
        </View>

        {/* Bloc "Maintenance" : actions futures pour purger la bibliothèque locale / le cache. */}
        <View style={[styles.row, styles.rowCard]}>
          <View style={styles.rowText}>
            <Text style={styles.label}>{t.settings.autoSyncLabel}</Text>
            <Text style={styles.inlineText}>{t.settings.autoSyncHint}</Text>
          </View>
          <Switch
            value={autoSync}
            onValueChange={setAutoSync}
            trackColor={{ false: "#1e293b", true: palette.primary }}
            thumbColor="#fff"
          />
        </View>
      </Section>

      <Section title={t.settings.maintenanceTitle} subtitle={t.settings.maintenanceSubtitle}>
        <View style={[styles.row, styles.rowCard]}>
          <Text style={styles.label}>{t.settings.resetLibrary}</Text>
          <Ionicons name="trash-outline" size={18} color={palette.danger} />
        </View>
        <View style={[styles.row, styles.rowCard]}>
          <Text style={styles.label}>{t.settings.clearCache}</Text>
          <Ionicons name="refresh-outline" size={18} color={palette.muted} />
        </View>
      </Section>
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
    paddingBottom: spacing.xl + 40,
    gap: spacing.lg,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 14,
  },
  input: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: palette.text,
    fontWeight: "700",
  },
  inlineInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.xs,
  },
  inlineText: {
    color: palette.muted,
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowCard: {
    paddingVertical: spacing.sm,
  },
  langSwitch: {
    flexDirection: "row",
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${palette.border}80`,
    overflow: "hidden",
  },
  langOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: palette.muted,
    fontWeight: "800",
  },
  langOptionActive: {
    color: "#fff",
    backgroundColor: palette.primary,
  },
  resetDefaultsButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  resetDefaultsText: {
    color: palette.muted,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
});
