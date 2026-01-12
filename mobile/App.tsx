import { useState, useEffect, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View, ActivityIndicator, Animated } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import { BottomNav, TabId } from "./src/components/BottomNav";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { OfflineBanner } from "./src/components/OfflineBanner";
import { DownloadsScreen } from "./src/screens/DownloadsScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { ReaderScreen } from "./src/screens/ReaderScreen";
import { VkProvider, useVk } from "./src/context/VkContext";
import { AppDataProvider, useAppData } from "./src/context/AppDataContext";
import { requestAllPermissions } from "./src/services/PermissionsService";

// Cleanup old cache files on app startup
const cleanupCache = async () => {
  try {
    const readerTempDir = `${FileSystem.cacheDirectory}reader-temp/`;
    const info = await FileSystem.getInfoAsync(readerTempDir);
    if (info.exists) {
      await FileSystem.deleteAsync(readerTempDir, { idempotent: true });
      console.log("App: Cleaned up reader cache");
    }
  } catch (e) {
    console.log("App: Cache cleanup failed (non-critical):", e);
  }
};

const AppContent = () => {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const { activePalette, isReady } = useVk();
  const { readingFile, setReadingFile } = useAppData();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Request all permissions on mount (storage + notifications)
    requestAllPermissions();
    // Cleanup old cache files
    cleanupCache();
  }, []);

  useEffect(() => {
    if (isReady) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }, [isReady]);

  if (!isReady) {
    return (
      <View style={[styles.safeArea, styles.center, { backgroundColor: activePalette.background }]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={activePalette.primaryBright} />
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
    <ErrorBoundary>
      <VkProvider>
        <AppDataProvider>
          <SafeAreaProvider>
            <AppContent />
          </SafeAreaProvider>
        </AppDataProvider>
      </VkProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
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
