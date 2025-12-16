import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Language } from "../i18n";
import { VkConnectionStatus } from "../types";

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
    status: VkConnectionStatus;
    setStatus: React.Dispatch<React.SetStateAction<VkConnectionStatus>>;
    isReady: boolean;
}

const VkContext = createContext<VkContextType | null>(null);

export const VkProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [token, setTokenState] = useState("");
    const [groupId, setGroupIdState] = useState("203785966");
    const [topicId, setTopicIdState] = useState("47515406");
    const [language, setLanguageState] = useState<Language>("fr");
    const [downloadPath, setDownloadPathState] = useState("Téléchargements/VKomic");
    const [isReady, setIsReady] = useState(false);
    const [status, setStatus] = useState<VkConnectionStatus>({
        connected: false,
        latencyMs: null,
        lastSync: null,
        region: null,
        regionAggregate: null,
    });

    // Hydrate les réglages sauvegardés (au démarrage).
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const [
                    savedToken,
                    savedPath,
                    savedGroupId,
                    savedTopicId,
                    savedLanguage,
                ] = await Promise.all([
                    AsyncStorage.getItem("vk_token"),
                    AsyncStorage.getItem("vk_download_path"),
                    AsyncStorage.getItem("vk_group_id"),
                    AsyncStorage.getItem("vk_topic_id"),
                    AsyncStorage.getItem("vk_language"),
                ]);

                if (savedToken) {
                    setTokenState(savedToken);
                    // "Connected" est optimiste: on ne ping pas VK ici (à brancher plus tard).
                    setStatus((prev) => ({ ...prev, connected: true }));
                }
                if (savedPath) setDownloadPathState(savedPath);
                if (savedGroupId) setGroupIdState(savedGroupId);
                if (savedTopicId) setTopicIdState(savedTopicId);
                if (
                    savedLanguage === "fr" ||
                    savedLanguage === "en" ||
                    savedLanguage === "ru"
                ) {
                    setLanguageState(savedLanguage);
                }
            } catch (e) {
                console.error("Failed to load settings", e);
            } finally {
                setIsReady(true);
            }
        };
        void loadSettings();
    }, []);

    // Ping léger pour afficher un indicateur "Connecté + latence" (discret, premium) dans l'UI.
    // Important: c'est un ping "API" (users.get), pas un ICMP.
    useEffect(() => {
        if (!token) {
            setStatus((prev) => (prev.connected ? { ...prev, connected: false, latencyMs: null } : prev));
            return;
        }

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const pingOnce = async () => {
            const started = typeof performance !== "undefined" ? performance.now() : Date.now();
            try {
                const url = `https://api.vk.com/method/users.get?access_token=${encodeURIComponent(token)}&v=5.131`;
                const res = await fetch(url);
                const data = await res.json();
                if (cancelled) return;

                const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
                const latency = Math.max(0, Math.round(ended - started));

                if (data?.error) {
                    setStatus((prev) => ({
                        ...prev,
                        connected: false,
                        latencyMs: null,
                    }));
                } else {
                    setStatus((prev) => ({
                        ...prev,
                        connected: true,
                        latencyMs: latency,
                    }));
                }
            } catch {
                if (cancelled) return;
                setStatus((prev) => ({
                    ...prev,
                    connected: false,
                    latencyMs: null,
                }));
            } finally {
                if (cancelled) return;
                timer = setTimeout(pingOnce, 30_000);
            }
        };

        void pingOnce();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [token]);

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
