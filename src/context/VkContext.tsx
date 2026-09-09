import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import { Language } from "../i18n";
import { VkConnectionStatus } from "../types";
import { palette } from "../theme";
import * as FolderService from "../services/FolderService";
import { refreshVkAccessToken, VkAuthSession } from "../services/vk-auth";

const VK_TOKEN_STORAGE_KEY = "vk_token";
const VK_REFRESH_TOKEN_STORAGE_KEY = "vk_refresh_token";
const VK_DEVICE_ID_STORAGE_KEY = "vk_device_id";
const VK_EXPIRES_AT_STORAGE_KEY = "vk_token_expires_at";

const readStoredToken = async (): Promise<string | null> => {
    if (Platform.OS === "web") {
        return AsyncStorage.getItem(VK_TOKEN_STORAGE_KEY);
    }

    const secureToken = await SecureStore.getItemAsync(VK_TOKEN_STORAGE_KEY);
    if (secureToken) return secureToken;

    // One-time migration from versions that stored the token in AsyncStorage.
    const legacyToken = await AsyncStorage.getItem(VK_TOKEN_STORAGE_KEY);
    if (legacyToken) {
        await SecureStore.setItemAsync(VK_TOKEN_STORAGE_KEY, legacyToken);
        await AsyncStorage.removeItem(VK_TOKEN_STORAGE_KEY);
    }
    return legacyToken;
};

const persistToken = async (value: string): Promise<void> => {
    if (Platform.OS === "web") {
        if (value) await AsyncStorage.setItem(VK_TOKEN_STORAGE_KEY, value);
        else await AsyncStorage.removeItem(VK_TOKEN_STORAGE_KEY);
        return;
    }

    if (value) await SecureStore.setItemAsync(VK_TOKEN_STORAGE_KEY, value);
    else await SecureStore.deleteItemAsync(VK_TOKEN_STORAGE_KEY);
    // Ensure a successfully migrated/saved native token is no longer left in plaintext.
    await AsyncStorage.removeItem(VK_TOKEN_STORAGE_KEY);
};

const readSecret = async (key: string): Promise<string | null> => {
    if (Platform.OS === "web") return AsyncStorage.getItem(key);
    return SecureStore.getItemAsync(key);
};

const persistSecret = async (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") {
        if (value) await AsyncStorage.setItem(key, value);
        else await AsyncStorage.removeItem(key);
        return;
    }
    if (value) await SecureStore.setItemAsync(key, value);
    else await SecureStore.deleteItemAsync(key);
    await AsyncStorage.removeItem(key);
};

// Contexte global des réglages VK côté mobile.
// Objectif: reproduire la persistance du desktop (localStorage/IDB) avec AsyncStorage (mobile).
interface VkContextType {
    token: string;
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
    handleAuthSuccess: (session: VkAuthSession) => Promise<void>;
    logout: () => Promise<void>;
}

const VkContext = createContext<VkContextType | null>(null);

export const VkProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [token, setTokenState] = useState("");
    const [refreshToken, setRefreshToken] = useState("");
    const [deviceId, setDeviceId] = useState("");
    const [tokenExpiresAt, setTokenExpiresAt] = useState(0);
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
                    savedRefreshToken,
                    savedDeviceId,
                    savedExpiresAt,
                    savedPath,
                    savedGroupId,
                    savedTopicId,
                    savedLanguage,
                    savedAutoSync,
                ] = await Promise.all([
                    readStoredToken(),
                    readSecret(VK_REFRESH_TOKEN_STORAGE_KEY),
                    readSecret(VK_DEVICE_ID_STORAGE_KEY),
                    readSecret(VK_EXPIRES_AT_STORAGE_KEY),
                    AsyncStorage.getItem("vk_download_path"),
                    AsyncStorage.getItem("vk_group_id"),
                    AsyncStorage.getItem("vk_topic_id"),
                    AsyncStorage.getItem("vk_language"),
                    AsyncStorage.getItem("vk_auto_sync"),
                ]);

                if (!isMounted) return;

                const savedExpiry = Number(savedExpiresAt) || 0;
                if (savedToken && savedRefreshToken && savedDeviceId && savedExpiry) {
                    setTokenState(savedToken);
                    setRefreshToken(savedRefreshToken);
                    setDeviceId(savedDeviceId);
                    setTokenExpiresAt(savedExpiry);
                    setStatus((prev) => ({ ...prev, connected: true }));
                } else if (savedToken || savedRefreshToken || savedDeviceId || savedExpiresAt) {
                    // Tokens from the legacy Kate Mobile flow have no valid VK ID
                    // refresh session and must never be reused by Vkomic.
                    await Promise.all([
                        persistToken(""),
                        persistSecret(VK_REFRESH_TOKEN_STORAGE_KEY, ""),
                        persistSecret(VK_DEVICE_ID_STORAGE_KEY, ""),
                        persistSecret(VK_EXPIRES_AT_STORAGE_KEY, ""),
                    ]);
                }
                await AsyncStorage.removeItem("vk_app_id");
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

    // Efface toute la session VK ID des stockages natifs chiffrés.
    const clearAuthSession = useCallback(async () => {
        setTokenState("");
        try {
            await Promise.all([
                persistToken(""),
                persistSecret(VK_REFRESH_TOKEN_STORAGE_KEY, ""),
                persistSecret(VK_DEVICE_ID_STORAGE_KEY, ""),
                persistSecret(VK_EXPIRES_AT_STORAGE_KEY, ""),
            ]);
        } catch (e) {
            console.error("Failed to clear VK ID session", e);
        }
        setRefreshToken("");
        setDeviceId("");
        setTokenExpiresAt(0);
        setStatus((prev) => ({ ...prev, connected: false }));
    }, []);

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

    const persistAuthSession = useCallback(async (session: VkAuthSession) => {
        setTokenState(session.accessToken);
        setRefreshToken(session.refreshToken);
        setDeviceId(session.deviceId);
        setTokenExpiresAt(session.expiresAt);
        await Promise.all([
            persistToken(session.accessToken),
            persistSecret(VK_REFRESH_TOKEN_STORAGE_KEY, session.refreshToken),
            persistSecret(VK_DEVICE_ID_STORAGE_KEY, session.deviceId),
            persistSecret(VK_EXPIRES_AT_STORAGE_KEY, String(session.expiresAt)),
        ]);
        setStatus((prev) => ({ ...prev, connected: true, errorCode: null }));
    }, []);

    // Handle successful OAuth 2.1 + PKCE authentication from the modal.
    const handleAuthSuccess = useCallback(async (session: VkAuthSession) => {
        await persistAuthSession(session);
    }, [persistAuthSession]);

    // VK ID access tokens expire quickly. Refresh one minute before expiration.
    useEffect(() => {
        if (!isReady || !refreshToken || !deviceId || !tokenExpiresAt) return;
        const delay = Math.max(tokenExpiresAt - Date.now() - 60_000, 1_000);
        const timer = setTimeout(() => {
            void refreshVkAccessToken(refreshToken, deviceId)
                .then(persistAuthSession)
                .catch((error) => {
                    console.error("VK ID token refresh failed", error);
                    void clearAuthSession().then(() => {
                        setStatus((prev) => ({ ...prev, errorCode: 5 }));
                    });
                });
        }, delay);
        return () => clearTimeout(timer);
    }, [isReady, refreshToken, deviceId, tokenExpiresAt, persistAuthSession, clearAuthSession]);

    // Logout - clear token
    const logout = async () => {
        await clearAuthSession();
        setStatus(prev => ({ ...prev, connected: false, latencyMs: null, errorCode: null }));
    };

    const value = React.useMemo(() => ({
        token,
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
    }), [
        token, groupId, topicId, language, downloadPath, status, isReady,
        autoSync, activePalette, isOffline, showAuthModal,
        // Including functions here would trigger re-renders anyway without useCallback, 
        // but removing them from deps might cause stale closures if they weren't generic.
        // For now, this restores functionality.
    ]);

    return (
        <VkContext.Provider value={value}>
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
