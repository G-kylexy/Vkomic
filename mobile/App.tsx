import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BottomNav, TabId } from "./src/components/BottomNav";
import { DownloadsScreen } from "./src/screens/DownloadsScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { palette } from "./src/theme";
import { VkProvider } from "./src/context/VkContext";
import { AppDataProvider } from "./src/context/AppDataContext";

// Point d'entrée de l'app Expo (mobile).
// On garde volontairement une navigation "simple" (state + switch) pour démarrer vite,
// puis on pourra migrer vers React Navigation / Expo Router quand les écrans seront branchés.
export default function App() {
  // Onglet actif (équivalent de la Sidebar desktop, mais en bottom tabs).
  const [activeTab, setActiveTab] = useState<TabId>("home");

  // Petit routeur local: rend l'écran correspondant à l'onglet.
  const renderScreen = () => {
    switch (activeTab) {
      case "library":
        return <LibraryScreen />;
      case "downloads":
        return <DownloadsScreen />;
      case "settings":
        return <SettingsScreen />;
      default:
        // HomeScreen est maintenant la Bibliothèque principale
        return <HomeScreen onNavigate={setActiveTab} />;
    }
  };

  return (
    // Context global qui stocke les réglages VK (token, group/topic, dossier, état connexion) via AsyncStorage.
    <VkProvider>
      <AppDataProvider>
      <SafeAreaProvider>
        {/* Safe area pour éviter que le contenu passe sous la notch / status bar */}
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="light" />
          <View style={styles.screen}>{renderScreen()}</View>
          {/* Navigation fixe en bas (équivalent mobile de la sidebar) */}
          <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
        </SafeAreaView>
      </SafeAreaProvider>
      </AppDataProvider>
    </VkProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  screen: {
    flex: 1,
  },
});
