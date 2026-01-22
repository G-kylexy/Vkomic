import { useState, useEffect, useRef, useCallback } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View, ActivityIndicator, Animated, Platform, NativeModules } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BottomNav, TabId } from "./src/components/BottomNav";

import { VkProvider, useVk } from "./src/context/VkContext";
import { AppDataProvider, useAppData } from "./src/context/AppDataContext";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { OfflineBanner } from "./src/components/OfflineBanner";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { DownloadsScreen } from "./src/screens/DownloadsScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { ReaderScreen } from "./src/screens/ReaderScreen";

const AppContent = () => {
  const { activePalette, isReady } = useVk();
  const { readingFile, setReadingFile } = useAppData();
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Écouter l'intent pour ouvrir l'onglet downloads depuis la notification
  useEffect(() => {
    if (Platform.OS === "android") {
      const checkInitialIntent = async () => {
        try {
          const { DownloadNotificationModule } = NativeModules;
          const openTab = await DownloadNotificationModule?.getInitialTab?.();
          if (openTab === "downloads") {
            setActiveTab("downloads");
          }
        } catch { }
      };
      checkInitialIntent();
    }
  }, []);

  useEffect(() => {
    if (isReady) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isReady]);

  if (!isReady) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: activePalette.background }]}>
        <ActivityIndicator size="large" color={activePalette.primary} />
      </View>
    );
  }

  return (
    <Animated.View style={[styles.safeArea, { opacity: fadeAnim, backgroundColor: activePalette.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <OfflineBanner />

        <View style={styles.screen}>
          <View style={[styles.screen, activeTab !== "home" && styles.hidden]}>
            <HomeScreen isActive={activeTab === "home"} onNavigate={setActiveTab} />
          </View>
          <View style={[styles.screen, activeTab !== "library" && styles.hidden]}>
            <LibraryScreen isActive={activeTab === "library"} />
          </View>
          <View style={[styles.screen, activeTab !== "downloads" && styles.hidden]}>
            <DownloadsScreen />
          </View>
          <View style={[styles.screen, activeTab !== "settings" && styles.hidden]}>
            <SettingsScreen />
          </View>
        </View>
        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

        {readingFile && (
          <View style={StyleSheet.absoluteFill}>
            <ReaderScreen
              uri={readingFile.uri}
              title={readingFile.title}
              onClose={() => setReadingFile(null)}
            />
          </View>
        )}
      </SafeAreaView>
    </Animated.View>
  );
};


export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <VkProvider>
            <AppDataProvider>
              <AppContent />
            </AppDataProvider>
          </VkProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  // ... (styles unchanged)
  safeArea: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  hidden: {
    display: "none",
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingPulse: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    opacity: 0.8,
  },
});
