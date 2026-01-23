import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Pressable, Text, ActivityIndicator, BackHandler, useWindowDimensions, Animated } from "react-native";
import Pdf from "react-native-pdf";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";

import { useVk } from "../context/VkContext";
import { spacing, radius } from "../theme";
import { getT } from "../i18n";
import * as FolderService from "../services/FolderService";

interface ReaderScreenProps {
    uri: string;
    title: string;
    onClose: () => void;
}

export const ReaderScreen: React.FC<ReaderScreenProps> = ({ uri, title, onClose }) => {
    const { activePalette: p, language } = useVk();
    const { width, height } = useWindowDimensions();
    const t = getT(language);
    const [viewMode, setViewMode] = useState<"horizontal" | "vertical">("horizontal");
    const [loading, setLoading] = useState(true);
    const [showControls, setShowControls] = useState(true);
    const [error, setError] = useState(false);
    const [pageInfo, setPageInfo] = useState({ current: 1, total: 1 });
    const [localUri, setLocalUri] = useState<string | null>(null);
    const [preparing, setPreparing] = useState(false);
    const [initialPage, setInitialPage] = useState(1);
    const isMountedRef = useRef(true);

    // Fade-in animation for smooth transition
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    // Fade in when PDF loads
    const fadeIn = useCallback(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
        }).start();
    }, [fadeAnim]);

    // Reset fade on view mode change
    useEffect(() => {
        fadeAnim.setValue(0);
    }, [viewMode, fadeAnim]);

    // Load saved progress
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const key = `progress_${uri}`;
                const savedPage = await AsyncStorage.getItem(key);
                if (savedPage) {
                    const pageNum = parseInt(savedPage, 10);
                    if (!isNaN(pageNum) && pageNum > 1) {
                        setInitialPage(pageNum);
                        setPageInfo(prev => ({ ...prev, current: pageNum }));
                    }
                }
            } catch (e) {
                console.warn("ReaderScreen: Failed to load settings", e);
            }
        };
        loadSettings();
    }, [uri]);

    const saveProgress = async (page: number) => {
        try {
            await AsyncStorage.setItem(`progress_${uri}`, page.toString());
        } catch (e) {
            console.warn("ReaderScreen: Failed to save progress", e);
        }
    };

    // Prepare file (copy SAF to local if needed)
    useEffect(() => {
        let isMounted = true;

        const prepareFile = async () => {
            setPreparing(true);
            setLoading(true);

            try {
                let pdfPath = uri;

                if (uri.startsWith("content://")) {
                    const tempDir = `${FileSystem.cacheDirectory}reader-cache/`;
                    await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });

                    // --- NETTOYAGE DU CACHE (LRU) ---
                    try {
                        const files = await FileSystem.readDirectoryAsync(tempDir);
                        if (files.length > 3) {
                            // On récupère les infos de tous les fichiers pour trier par date
                            const fileInfos = await Promise.all(
                                files.map(async (filename) => {
                                    const path = `${tempDir}${filename}`;
                                    const info = await FileSystem.getInfoAsync(path);
                                    return { name: filename, path, time: (info as any).modificationTime || 0 };
                                })
                            );

                            // On trie par date (plus vieux d'abord)
                            fileInfos.sort((a, b) => a.time - b.time);

                            // On supprime les plus vieux pour n'en garder que 2 (le nouveau sera le 3ème)
                            const toDelete = fileInfos.slice(0, fileInfos.length - 2);
                            for (const f of toDelete) {
                                await FileSystem.deleteAsync(f.path, { idempotent: true });
                            }
                        }
                    } catch (e) {
                        console.warn("ReaderScreen: Cache cleanup failed:", e);
                    }
                    // --------------------------------

                    const uriHash = uri.split('/').pop() || `file_${Date.now()}`;
                    const safeHash = uriHash.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
                    const destination = `${tempDir}${safeHash}.pdf`;

                    const cacheInfo = await FileSystem.getInfoAsync(destination);
                    if (cacheInfo.exists && (cacheInfo as any).size > 0) {
                        pdfPath = destination;
                    } else {
                        const success = await FolderService.copySafToLocal(uri, destination);
                        if (!success) throw new Error("Failed to copy SAF file");
                        pdfPath = destination;
                    }
                }

                if (isMounted) {
                    setLocalUri(pdfPath);
                    setPreparing(false);
                }
            } catch (err) {
                console.error("ReaderScreen: Failed to prepare file:", err);
                if (isMounted) {
                    setError(true);
                    setLoading(false);
                    setPreparing(false);
                }
            }
        };

        prepareFile();
        return () => { isMounted = false; };
    }, [uri]);

    // Handle back button
    useEffect(() => {
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            onClose();
            return true;
        });
        return () => backHandler.remove();
    }, [onClose]);

    const isPdf = uri.toLowerCase().endsWith(".pdf") || (localUri && localUri.toLowerCase().endsWith(".pdf"));

    const toggleControls = useCallback(() => setShowControls(prev => !prev), []);
    const toggleViewMode = () => {
        setViewMode(prev => prev === "horizontal" ? "vertical" : "horizontal");
    };

    const handleLoadComplete = useCallback((numberOfPages: number) => {
        setLoading(false);
        setPageInfo(prev => ({ ...prev, total: numberOfPages }));
        fadeIn(); // Smooth fade-in when loaded
    }, [fadeIn]);

    const handlePageChanged = useCallback((page: number, numberOfPages: number) => {
        setPageInfo({ current: page, total: numberOfPages });
        saveProgress(page);
    }, []);

    const handleError = useCallback((err: any) => {
        console.error("PDF Error:", err);
        setLoading(false);
        setError(true);
    }, []);

    const renderLoading = useCallback(() => (
        <ActivityIndicator size="large" color={p.primaryBright} />
    ), [p.primaryBright]);

    const pdfSource = localUri ? { uri: localUri, cache: true } : null;

    return (
        <View style={[styles.container, { backgroundColor: "#000" }]}>
            {/* Header */}
            {showControls && (
                <View style={[styles.header, { backgroundColor: `${p.background}F0` }]}>
                    <Pressable onPress={onClose} style={styles.backBtn}>
                        <Ionicons name="close" size={24} color={p.text} />
                    </Pressable>
                    <View style={styles.titleContainer}>
                        <Text style={[styles.title, { color: p.text }]} numberOfLines={1}>
                            {title}
                        </Text>
                        {isPdf && !loading && !error && (
                            <Text style={[styles.pageInfo, { color: p.muted }]}>
                                {pageInfo.current} / {pageInfo.total}
                            </Text>
                        )}
                    </View>
                    <Pressable onPress={toggleViewMode} style={styles.modeBtn}>
                        <Ionicons
                            name={viewMode === "horizontal" ? "book-outline" : "document-text-outline"}
                            size={22}
                            color={p.text}
                        />
                    </Pressable>
                </View>
            )}

            {/* PDF Viewer */}
            <View style={styles.viewer}>
                {isPdf ? (
                    <View style={styles.pdfContainer}>
                        {error ? (
                            <View style={styles.errorContainer}>
                                <Ionicons name="alert-circle-outline" size={48} color={p.danger} />
                                <Text style={[styles.errorText, { color: p.text }]}>
                                    Impossible de charger le PDF
                                </Text>
                                <Pressable
                                    style={[styles.retryBtn, { backgroundColor: p.primary }]}
                                    onPress={() => { setError(false); setLoading(true); }}
                                >
                                    <Text style={styles.retryText}>Réessayer</Text>
                                </Pressable>
                            </View>
                        ) : pdfSource ? (
                            <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
                                <Pdf
                                    key={viewMode}
                                    source={pdfSource}
                                    style={[styles.pdf, { width, height }]}
                                    page={initialPage}
                                    onLoadComplete={handleLoadComplete}
                                    onPageChanged={handlePageChanged}
                                    onError={handleError}
                                    onPageSingleTap={toggleControls}
                                    // --- Performance & Cache ---
                                    trustAllCerts={false}
                                    enableAntialiasing={true}
                                    scale={1.1}
                                    maxScale={3.0}
                                    minScale={1.0}
                                    // --- Expérience de Lecture ---
                                    horizontal={viewMode === "horizontal"}
                                    enablePaging={viewMode === "horizontal"}
                                    fitPolicy={0}
                                    spacing={10}
                                    // --- Interaction ---
                                    enableRTL={false}
                                    enableDoubleTapZoom={true}
                                    renderActivityIndicator={renderLoading}
                                    showsHorizontalScrollIndicator={false}
                                    showsVerticalScrollIndicator={false}
                                />
                            </Animated.View>
                        ) : null}
                    </View>
                ) : (
                    <View style={styles.unsupported}>
                        <Ionicons name="alert-circle-outline" size={48} color={p.muted} />
                        <Text style={[styles.unsupportedText, { color: p.muted }]}>
                            {t.reader.unsupported}
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        height: 60,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: spacing.md,
    },
    backBtn: {
        width: 40,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
    },
    modeBtn: {
        width: 40,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
    },
    titleContainer: {
        flex: 1,
        alignItems: "center",
    },
    title: {
        fontSize: 14,
        fontWeight: "800",
        textAlign: "center",
    },
    pageInfo: {
        fontSize: 11,
        fontWeight: "600",
        marginTop: 2,
    },
    viewer: { flex: 1 },
    pdfContainer: { flex: 1 },
    pdf: {
        flex: 1,
        backgroundColor: "#000",
    },
    loading: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.95)",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
    },
    loadingText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "600",
    },
    unsupported: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        gap: 20,
    },
    unsupportedText: {
        textAlign: "center",
        fontSize: 15,
        fontWeight: "700",
    },
    errorContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        gap: 16,
    },
    errorText: {
        fontSize: 16,
        fontWeight: "800",
        textAlign: "center",
    },
    retryBtn: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: radius.md,
    },
    retryText: {
        color: "#fff",
        fontWeight: "800",
    },
});
