import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet, Pressable, Text, ActivityIndicator, BackHandler, useWindowDimensions } from "react-native";
import Pdf from "react-native-pdf";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useVk } from "../context/VkContext";
import { spacing, radius } from "../theme";
import { getT } from "../i18n";
import * as FolderService from "../services/FolderService";
import * as FileSystem from "expo-file-system/legacy";

interface ReaderScreenProps {
    uri: string;
    title: string;
    onClose: () => void;
}


export const ReaderScreen: React.FC<ReaderScreenProps> = ({ uri, title, onClose }) => {
    const { activePalette: p, language } = useVk();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
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

    // Track mounted state for async operations
    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    // Load saved settings
    useEffect(() => {
        const loadSettings = async () => {
            try {
                // Load progress
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
            const key = `progress_${uri}`;
            await AsyncStorage.setItem(key, page.toString());
        } catch (e) {
            console.warn("ReaderScreen: Failed to save progress", e);
        }
    };



    // Effect to copy content:// URI to local cache if needed
    React.useEffect(() => {
        let isMounted = true;
        const prepareFile = async () => {
            if (!uri.startsWith("content://")) {
                setLocalUri(uri);
                return;
            }

            setPreparing(true);
            try {
                const tempDir = `${FileSystem.cacheDirectory}reader-temp/`;
                const dirInfo = await FileSystem.getInfoAsync(tempDir);
                if (!dirInfo.exists) {
                    await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });
                }

                // Create a unique temp name to avoid conflicts
                const tempName = `reading_${Date.now()}.pdf`;
                const destination = `${tempDir}${tempName}`;

                console.log("ReaderScreen: Copying content URI to local cache:", { from: uri, to: destination });

                // Use FolderService which handles SAF permissions correctly
                const success = await FolderService.copySafToLocal(uri, destination);

                if (isMounted) {
                    if (success) {
                        setLocalUri(destination);
                        setError(false);
                    } else {
                        throw new Error("Failed to copy SAF file to local cache");
                    }
                }
            } catch (err) {
                console.error("ReaderScreen: Failed to copy file to cache:", err);
                if (isMounted) setError(true);
            } finally {
                if (isMounted) setPreparing(false);
            }
        };

        prepareFile();
        return () => { isMounted = false; };
    }, [uri]);

    // Cleanup temp files on unmount
    React.useEffect(() => {
        return () => {
            const cleanup = async () => {
                try {
                    const tempDir = `${FileSystem.cacheDirectory}reader-temp/`;
                    const info = await FileSystem.getInfoAsync(tempDir);
                    if (info.exists) {
                        await FileSystem.deleteAsync(tempDir, { idempotent: true });
                    }
                } catch (e) {
                    console.log("ReaderScreen: Cleanup failed", e);
                }
            };
            cleanup();
        };
    }, []);

    // Handle Android hardware back button
    useEffect(() => {
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            onClose();
            return true; // Prevent default behavior (exit app)
        });

        return () => backHandler.remove();
    }, [onClose]);

    const isPdf = uri.toLowerCase().endsWith(".pdf") || (localUri && localUri.toLowerCase().endsWith(".pdf"));

    const toggleControls = React.useCallback(() => {
        setShowControls(prev => !prev);
    }, []);

    const toggleViewMode = () => {
        setViewMode(prev => prev === "horizontal" ? "vertical" : "horizontal");
    };



    const handleLoadComplete = React.useCallback((numberOfPages: number) => {
        // Délai pour laisser le PDF se rendre en haute qualité avant d'afficher
        setTimeout(() => {
            if (isMountedRef.current) {
                setLoading(false);
            }
        }, 350);
        setPageInfo(prev => ({ ...prev, total: numberOfPages }));
    }, []);

    const handlePageChanged = React.useCallback((page: number, numberOfPages: number) => {
        setPageInfo({ current: page, total: numberOfPages });
        saveProgress(page);
    }, [uri]);

    const handleError = React.useCallback((err: any) => {
        console.error("PDF Error:", err);
        setLoading(false);
        setError(true);
    }, []);

    const renderLoading = React.useCallback(() => (
        <ActivityIndicator size="large" color={p.primaryBright} />
    ), [p.primaryBright]);

    const pdfSource = localUri ? {
        uri: localUri,
        cache: true,
    } : null;

    return (
        <View style={[styles.container, { backgroundColor: "#000" }]}>
            {showControls && (
                <View style={[styles.header, { backgroundColor: `${p.background}F0` }]}>
                    <Pressable
                        onPress={onClose}
                        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
                        accessibilityRole="button"
                        accessibilityLabel="Fermer le lecteur"
                    >
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

                    <Pressable
                        onPress={toggleViewMode}
                        style={({ pressed }) => [styles.modeBtn, pressed && { opacity: 0.7 }]}
                    >
                        <Ionicons
                            name={viewMode === "horizontal" ? "book-outline" : "document-text-outline"}
                            size={22}
                            color={p.text}
                        />
                    </Pressable>
                </View>
            )}

            <View style={styles.viewer}>


                {isPdf ? (
                    <View style={styles.pdfContainer}>
                        {error ? (
                            <View style={styles.errorContainer}>
                                <Ionicons name="alert-circle-outline" size={48} color={p.danger} />
                                <Text style={[styles.errorText, { color: p.text }]}>
                                    Impossible de charger le PDF
                                </Text>
                                <Text style={[styles.errorSubtext, { color: p.muted }]}>
                                    {uri.split('/').pop()}
                                </Text>
                                <Pressable
                                    style={[styles.retryBtn, { backgroundColor: p.primary }]}
                                    onPress={() => setError(false)}
                                >
                                    <Ionicons name="refresh" size={16} color="#fff" />
                                    <Text style={styles.retryText}>Réessayer</Text>
                                </Pressable>
                            </View>
                        ) : (
                            pdfSource && (
                                <Pdf
                                    source={pdfSource}
                                    style={[styles.pdf, { width: screenWidth, height: screenHeight }]}
                                    trustAllCerts={false}
                                    page={initialPage}
                                    onLoadComplete={handleLoadComplete}
                                    onPageChanged={handlePageChanged}
                                    onError={handleError}
                                    onPageSingleTap={toggleControls}
                                    enablePaging={viewMode === "horizontal"}
                                    horizontal={viewMode === "horizontal"}
                                    fitPolicy={0}
                                    spacing={viewMode === "horizontal" ? 0 : 8}
                                    maxScale={5.0}
                                    minScale={1.0}
                                    scale={1.0}
                                    enableAntialiasing={true}
                                    enableDoubleTapZoom={true}
                                    enableAnnotationRendering={false}
                                    renderActivityIndicator={renderLoading}
                                />
                            )
                        )}
                    </View>
                ) : (
                    <View style={styles.unsupported}>
                        <Ionicons name="alert-circle-outline" size={48} color={p.muted} />
                        <Text style={[styles.unsupportedText, { color: p.muted }]}>
                            {t.reader.unsupported}
                        </Text>
                        <Pressable
                            style={({ pressed }) => [styles.shareBtn, { backgroundColor: p.primary }, pressed && { opacity: 0.8 }]}
                            onPress={onClose}
                            accessibilityRole="button"
                            accessibilityLabel="Retour"
                        >
                            <Text style={styles.shareBtnText}>{t.reader.return}</Text>
                        </Pressable>
                    </View>
                )}

                {(loading || preparing) && isPdf && !error && (
                    <View style={styles.loading}>
                        <ActivityIndicator size="large" color={p.primaryBright} />
                        <Text style={[styles.loadingText, { color: "#fff" }]}>
                            {preparing ? "Préparation du fichier..." : t.reader.loading}
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
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
        borderRadius: 20,
    },
    modeBtn: {
        width: 40,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 20,
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
    viewer: {
        flex: 1,
    },
    pdfContainer: {
        flex: 1,
    },
    pdf: {
        flex: 1,
        backgroundColor: "#000",
    },
    loading: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.9)",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
    },
    loadingText: {
        fontSize: 12,
        fontWeight: "700",
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
        lineHeight: 22,
    },
    shareBtn: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: radius.md,
    },
    shareBtnText: {
        color: "#fff",
        fontWeight: "900",
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
    errorSubtext: {
        fontSize: 12,
        textAlign: "center",
    },
    retryBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: radius.md,
        marginTop: 8,
    },
    retryText: {
        color: "#fff",
        fontWeight: "800",
        fontSize: 13,
    },

});
