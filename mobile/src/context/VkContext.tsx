import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import { Language } from "../i18n";
import { VkConnectionStatus } from "../types";
import { palette } from "../theme";
import * as FolderService from "../services/FolderService";

// VK OAuth Configuration
const VK_APP_ID = "2685278"; // VK Android app ID (public)
const VK_REDIRECT_URI = "https://oauth.vk.com/blank.html";
const VK_SCOPE = "docs,groups,wall,offline";

// Contexte global des réglages VK côté mobile.
// Objectif: reproduire la persistance du desktop (localStorage/IDB) avec AsyncStorage (mobile).
interface VkContextType {
    token: string;
    setToken: (token: string) => Promise<void>;
    groupId: string;
    setGroupId: (groupId: string) => Promise<void>;
    topicId: string;
    setTopicId: (topicId: string) => Promise<void>;
    language: Language;
    setLanguage: (language: Language) => Promise<void>;
    downloadPath: string;
    setDownloadPath: (path: string) => Promise<void>;
    isReady: boolean;
    autoSync: boolean;
    setAutoSync: (sync: boolean) => Promise<void>;
    status: VkConnectionStatus;
    setStatus: React.Dispatch<React.SetStateAction<VkConnectionStatus>>;
    activePalette: typeof palette;
    isOffline: boolean;
    showAuthModal: boolean;
    setShowAuthModal: (show: boolean) => void;
    handleAuthSuccess: (token: string) => Promise<void>;
    logout: () => Promise<void>;
}

const VkContext = createContext<VkContextType | null>(null);

export const VkProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [token, setTokenState] = useState("");
    const [groupId, setGroupIdState] = useState("203785966");
    const [topicId, setTopicIdState] = useState("47515406");
    const [language, setLanguageState] = useState<Language>("fr");
    const [downloadPath, setDownloadPathState] = useState("");
    const [autoSync, setAutoSyncState] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [status, setStatus] = useState<VkConnectionStatus>({
        connected: false,
        latencyMs: null,
        lastSync: null,
        region: null,
        regionAggregate: null,
    });
    const [isOffline, setIsOffline] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);

    // Network status check
    const checkNetworkStatus = useCallback(async () => {
        try {
            const state = await Network.getNetworkStateAsync();
            setIsOffline(!(state.isConnected ?? true));
        } catch {
            setIsOffline(false);
        }
    }, []);

    useEffect(() => {
        checkNetworkStatus();
        const interval = setInterval(checkNetworkStatus, 15000);
        return () => clearInterval(interval);
    }, [checkNetworkStatus]);

    // Parse token from VK OAuth URL
    const parseTokenFromUrl = useCallback((url: string): string | null => {
        try {
            // URL format: https://oauth.vk.com/blank.html#access_token=...&expires_in=...&user_id=...
            const hashIndex = url.indexOf('#');
            if (hashIndex === -1) return null;

            const fragment = url.substring(hashIndex + 1);
            const params = new URLSearchParams(fragment);
            const accessToken = params.get('access_token');

            if (accessToken && accessToken.length > 10) {
                return accessToken;
            }
            return null;
        } catch {
            return null;
        }
    }, []);

    // Handle incoming deep links (shared URLs from browser)
    useEffect(() => {
        const handleUrl = async (event: { url: string }) => {
            const extractedToken = parseTokenFromUrl(event.url);
            if (extractedToken) {
                // Save token directly (same logic as setToken)
                setTokenState(extractedToken);
                setStatus((prev) => ({ ...prev, connected: true }));
                try {
                    await AsyncStorage.setItem("vk_token", extractedToken);
                } catch (e) {
                    console.error("Failed to save token from URL", e);
                }
            }
        };

        // Check if app was opened with a URL
        const checkInitialUrl = async () => {
            const initialUrl = await Linking.getInitialURL();
            if (initialUrl) {
                await handleUrl({ url: initialUrl });
            }
        };

        // Listen for URL events while app is running
        const subscription = Linking.addEventListener('url', handleUrl);

        // Check initial URL after settings are loaded
        if (isReady) {
            void checkInitialUrl();
        }

        return () => {
            subscription.remove();
        };
    }, [isReady, parseTokenFromUrl]);

    // Hydrate les réglages sauvegardés (au démarrage).
    useEffect(() => {
        let isMounted = true;
        const safetyTimeout = setTimeout(() => {
            if (isMounted && !isReady) {
                console.warn("VkProvider: loadSettings timed out, forcing isReady");
                setIsReady(true);
            }
        }, 3000); // 3 secondes de sécurité maximum

        const loadSettings = async () => {
            try {
                const [
                    savedToken,
                    savedPath,
                    savedGroupId,
                    savedTopicId,
                    savedLanguage,
                    savedAutoSync,
                ] = await Promise.all([
                    AsyncStorage.getItem("vk_token"),
                    AsyncStorage.getItem("vk_download_path"),
                    AsyncStorage.getItem("vk_group_id"),
                    AsyncStorage.getItem("vk_topic_id"),
                    AsyncStorage.getItem("vk_language"),
                    AsyncStorage.getItem("vk_auto_sync"),
                ]);

                if (!isMounted) return;

                if (savedToken) {
                    setTokenState(savedToken);
                    setStatus((prev) => ({ ...prev, connected: true }));
                }
                if (savedPath) {
                    // Check SAF permissions if it's a content:// URI
                    if (Platform.OS === "android" && savedPath.startsWith("content://")) {
                        const hasPermission = await FolderService.checkSafPermission(savedPath);
                        if (hasPermission) {
                            setDownloadPathState(savedPath);
                        } else {
                            // Permission lost, clear the path
                            console.warn("SAF permission lost for:", savedPath);
                            await AsyncStorage.removeItem("vk_download_path");
                            // User will need to re-select the folder in Settings
                        }
                    } else {
                        setDownloadPathState(savedPath);
                    }
                }
                if (savedGroupId) setGroupIdState(savedGroupId);
                if (savedTopicId) setTopicIdState(savedTopicId);
                if (savedAutoSync !== null) setAutoSyncState(savedAutoSync === "true");

                if (
                    savedLanguage === "fr" ||
                    savedLanguage === "en" ||
                    savedLanguage === "ru"
                ) {
                    setLanguageState(savedLanguage);
                }
            } catch (e) {
                console.error("VkProvider: Failed to load settings", e);
            } finally {
                if (isMounted) {
                    setIsReady(true);
                    clearTimeout(safetyTimeout);
                }
            }
        };
        void loadSettings();
        return () => { isMounted = false; clearTimeout(safetyTimeout); };
    }, []);

    // Sauvegarde immédiate du token dans AsyncStorage (comme le desktop via localStorage).
    const setToken = async (newToken: string) => {
        setTokenState(newToken);
        try {
            if (newToken) {
                await AsyncStorage.setItem("vk_token", newToken);
                setStatus((prev) => ({ ...prev, connected: true }));
            } else {
                await AsyncStorage.removeItem("vk_token");
                setStatus((prev) => ({ ...prev, connected: false }));
            }
        } catch (e) {
            console.error("Failed to save token", e);
        }
    };

    // Group/Topic: permet de pointer vers une autre board si besoin (mêmes valeurs par défaut que le desktop).
    const setGroupId = async (newGroupId: string) => {
        setGroupIdState(newGroupId);
        try {
            await AsyncStorage.setItem("vk_group_id", newGroupId);
        } catch (e) {
            console.error("Failed to save group id", e);
        }
    };

    const setTopicId = async (newTopicId: string) => {
        setTopicIdState(newTopicId);
        try {
            await AsyncStorage.setItem("vk_topic_id", newTopicId);
        } catch (e) {
            console.error("Failed to save topic id", e);
        }
    };

    const setLanguage = async (newLanguage: Language) => {
        setLanguageState(newLanguage);
        try {
            await AsyncStorage.setItem("vk_language", newLanguage);
        } catch (e) {
            console.error("Failed to save language", e);
        }
    };

    // Chemin "logique" (sur mobile l'accès fichiers réels demandera DocumentPicker/permissions).
    const setDownloadPath = async (newPath: string) => {
        setDownloadPathState(newPath);
        try {
            await AsyncStorage.setItem("vk_download_path", newPath);
        } catch (e) {
            console.error("Failed to save download path", e);
        }
    };

    const setAutoSync = async (newVal: boolean) => {
        setAutoSyncState(newVal);
        try {
            await AsyncStorage.setItem("vk_auto_sync", newVal ? "true" : "false");
        } catch (e) {
            console.error("Failed to save auto sync", e);
        }
    };

    const activePalette = palette;

    // Handle successful auth from modal
    const handleAuthSuccess = async (accessToken: string) => {
        await setToken(accessToken);
    };

    // Logout - clear token
    const logout = async () => {
        await setToken("");
        setStatus(prev => ({ ...prev, connected: false, latencyMs: null, errorCode: null }));
    };

    return (
        <VkContext.Provider
            value={{
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
                status,
                setStatus,
                isReady,
                autoSync,
                setAutoSync,
                activePalette,
                isOffline,
                showAuthModal,
                setShowAuthModal,
                handleAuthSuccess,
                logout,
            }}
        >
            {children}
        </VkContext.Provider>
    );
};

export const useVk = () => {
    const context = useContext(VkContext);
    if (!context) {
        throw new Error("useVk must be used within a VkProvider");
    }
    return context;
};
