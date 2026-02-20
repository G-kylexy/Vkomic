import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Pressable, Text, BackHandler, useWindowDimensions, ActivityIndicator } from "react-native";
import { FlashList, FlashListRef } from "@shopify/flash-list";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

import { useVk } from "../context/VkContext";
import { spacing, radius } from "../theme";
import { getT } from "../i18n";
import { pdfCacheService } from "../services/PdfCacheService";
import { ZoomablePage } from "../components/ZoomablePage";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, withDelay } from "react-native-reanimated";

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
    const [showControls, setShowControls] = useState(true);
    const [documentLoaded, setDocumentLoaded] = useState(false);
    const [documentError, setDocumentError] = useState(false);
    const [totalPages, setTotalPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(0);
    const [initialPage, setInitialPage] = useState(0);
    const [pageUris, setPageUris] = useState<Record<number, { thumb: string | null; hd: string | null }>>({});

    // We keep ref sets for loading/error to avoid mass re-renders on FlatList when fast-scrolling
    const loadingPagesRef = useRef<Set<number>>(new Set());
    const errorPagesRef = useRef<Set<number>>(new Set());

    // To manually trigger re-renders for specific items if needed
    const [renderTick, setRenderTick] = useState(0);
    const forceRender = () => setRenderTick(prev => prev + 1);

    const flatListRef = useRef<FlashListRef<number>>(null);
    const isMountedRef = useRef(true);
    const totalPagesRef = useRef(0);
    const toastOpacity = useSharedValue(0);
    const [toastText, setToastText] = useState("");
    const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

    const showModeToast = (mode: string) => {
        setToastText(mode === "vertical" ? "Lecture Continue" : "Page par Page");
        toastOpacity.value = withSequence(
            withTiming(1, { duration: 200 }),
            withDelay(1000, withTiming(0, { duration: 400 }))
        );
    };

    const toastStyle = useAnimatedStyle(() => ({
        opacity: toastOpacity.value,
        transform: [{ scale: 0.8 + (toastOpacity.value * 0.2) }],
    }));

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
        };
    }, []);

    useEffect(() => {
        const init = async () => {
            try {
                setDocumentLoaded(false);
                setDocumentError(false);
                loadingPagesRef.current.clear();
                errorPagesRef.current.clear();

                console.log("ReaderScreen: Initializing document", uri);

                // 1. Load progress first
                let targetPage = 0;
                try {
                    const key = `progress_${uri}`;
                    const savedPage = await AsyncStorage.getItem(key);
                    if (savedPage) {
                        const pageNum = parseInt(savedPage, 10);
                        if (!isNaN(pageNum) && pageNum > 0) {
                            targetPage = pageNum;
                            if (isMountedRef.current) {
                                setInitialPage(pageNum);
                                setCurrentPage(pageNum);
                            }
                        }
                    }
                } catch (e) {
                    console.warn("ReaderScreen: Failed to load progress", e);
                }

                // 2. Open the document
                const info = await pdfCacheService.openDocument(uri);
                console.log("ReaderScreen: Document opened", info);

                if (isMountedRef.current) {
                    setTotalPages(info.pageCount);
                    totalPagesRef.current = info.pageCount;

                    // 3. Load the specific initial page
                    const actualTargetPage = Math.min(targetPage, info.pageCount - 1);

                    // Charger la page AVANT d'afficher la liseuse pour éviter le clignotement
                    await loadPageInternal(actualTargetPage, info.pageCount, width);

                    // Mainenant que l'image est prête (vignette), on affiche tout
                    setDocumentLoaded(true);

                    // 4. Prefetch neighbors immediately
                    pdfCacheService.updateVisiblePage(actualTargetPage);
                    pdfCacheService.prefetchPages(actualTargetPage, width);
                    pdfCacheService.preloadNeighbors(actualTargetPage, width);

                    // Final scroll adjustment if needed
                    if (actualTargetPage > 0) {
                        setTimeout(() => {
                            if (isMountedRef.current && flatListRef.current) {
                                flatListRef.current.scrollToIndex({
                                    index: actualTargetPage,
                                    animated: false
                                });
                            }
                        }, 100);
                    }
                }
            } catch (e) {
                console.error("ReaderScreen: Initialization failed", e);
                if (isMountedRef.current) {
                    setDocumentError(true);
                    setDocumentLoaded(true);
                }
            }
        };

        init();
    }, [uri]);

    const updateUris = (pageNum: number, updates: { thumb?: string, hd?: string }) => {
        if (!isMountedRef.current) return;
        setPageUris(prev => {
            const current = prev[pageNum] || { thumb: null, hd: null };
            return {
                ...prev,
                [pageNum]: { ...current, ...updates }
            };
        });
    };

    const loadPageInternal = useCallback(async (pageNum: number, totalPagesCount: number, screenWidth: number) => {
        if (pageNum < 0 || pageNum >= totalPagesCount) return;
        if (loadingPagesRef.current.has(pageNum)) return;

        // Si on a déjà la HD en cache, c'est fini
        const hdCached = pdfCacheService.getHdUri(pageNum);
        if (hdCached) {
            updateUris(pageNum, { hd: hdCached });
            return;
        }

        loadingPagesRef.current.add(pageNum);
        forceRender();

        try {
            // PIPELINE STREAMING OPTIMISÉ (Non-bloquant) :
            // 1. Extraire et afficher la vignette IMMÉDIATEMENT
            const thumbUri = await pdfCacheService.smartExtract(pageNum, screenWidth, 'thumb');
            if (isMountedRef.current) {
                updateUris(pageNum, { thumb: thumbUri });
            }

            // 2. Lancer l'extraction HD en tâche de fond (NE PAS ATTENDRE)
            // Cela permet à loadPageInternal de se terminer et de laisser la place aux pages suivantes
            pdfCacheService.smartExtract(pageNum, screenWidth, 'hd')
                .then(hdUri => {
                    if (isMountedRef.current) {
                        updateUris(pageNum, { hd: hdUri });
                        loadingPagesRef.current.delete(pageNum);
                        forceRender();
                    }
                })
                .catch(e => {
                    console.warn(`ReaderScreen: HD loading failed for page ${pageNum}`, e);
                    if (isMountedRef.current) {
                        loadingPagesRef.current.delete(pageNum);
                        forceRender();
                    }
                });

        } catch (e) {
            console.error(`ReaderScreen: Thumbnail failure for page ${pageNum}`, e);
            if (isMountedRef.current) {
                errorPagesRef.current.add(pageNum);
                loadingPagesRef.current.delete(pageNum);
                forceRender();
            }
        }
    }, [width]);

    const loadPage = useCallback((pageNum: number) => {
        return loadPageInternal(pageNum, totalPagesRef.current, width);
    }, [loadPageInternal, width]);

    useEffect(() => {
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            onClose();
            return true;
        });
        return () => backHandler.remove();
    }, [onClose]);

    const saveProgress = useCallback(async (page: number) => {
        try {
            await AsyncStorage.setItem(`progress_${uri}`, page.toString());
        } catch (e) {
            console.warn("ReaderScreen: Failed to save progress", e);
        }
    }, [uri]);

    const handlePageChange = useCallback((pageIndex: number) => {
        if (pageIndex === currentPage) return;

        setCurrentPage(pageIndex);

        // Debounce external expensive ops so fast-scrolling doesn't queue 30 operations
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

        scrollTimeout.current = setTimeout(() => {
            if (isMountedRef.current) {
                pdfCacheService.updateVisiblePage(pageIndex);
                saveProgress(pageIndex);
                pdfCacheService.prefetchPages(pageIndex, width);
            }
        }, 150); // 150ms debounce
    }, [currentPage, saveProgress, width]);

    const toggleControls = useCallback(() => setShowControls(prev => !prev), []);

    const toggleViewMode = useCallback(() => {
        const nextMode = viewMode === "horizontal" ? "vertical" : "horizontal";
        setViewMode(nextMode);
        showModeToast(nextMode);
    }, [viewMode]);

    const retryPage = useCallback((pageNum: number) => {
        errorPagesRef.current.delete(pageNum);
        loadingPagesRef.current.delete(pageNum);
        forceRender();
        loadPage(pageNum);
    }, [loadPage]);

    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
        const firstVisible = viewableItems[0];
        if (firstVisible && firstVisible.index !== null) {
            handlePageChange(firstVisible.index);
        }
    }).current;

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50,
        minimumViewTime: 1, // Déclenche le changement de page instantanément sans attendre la fin du scroll
    }).current;

    const renderPage = useCallback(({ item: pageNum }: { item: number }) => {
        const uris = pageUris[pageNum];
        const isLoading = loadingPagesRef.current.has(pageNum);
        const isError = errorPagesRef.current.has(pageNum);

        // Safety: if the page is rendered but no URI is present in state, trigger load
        if (!uris && !isLoading && !isError) {
            setTimeout(() => loadPage(pageNum), 0);
        }

        return (
            <ZoomablePage
                thumbUri={uris?.thumb || null}
                hdUri={uris?.hd || null}
                pageNum={pageNum}
                loading={isLoading}
                error={isError}
                width={width}
                height={height}
                onTap={toggleControls}
                onRetry={() => retryPage(pageNum)}
            />
        );
    }, [pageUris, width, height, toggleControls, retryPage, loadPage, renderTick]);


    const keyExtractor = useCallback((item: number) => `page_${item}`, []);

    if (!documentLoaded) {
        return (
            <View style={[styles.container, { backgroundColor: "#000" }]}>
                <ActivityIndicator size="large" color={p.primaryBright} />
                {documentError && (
                    <View style={styles.errorContainer}>
                        <Ionicons name="alert-circle-outline" size={48} color={p.danger} />
                        <Text style={[styles.errorText, { color: p.text }]}>
                            Impossible de charger le PDF
                        </Text>
                    </View>
                )}
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: "#000" }]}>
            {showControls && (
                <View style={[styles.header, { backgroundColor: `${p.background}F0` }]}>
                    <Pressable onPress={onClose} style={styles.backBtn}>
                        <Ionicons name="close" size={24} color={p.text} />
                    </Pressable>
                    <View style={styles.titleContainer}>
                        <Text style={[styles.title, { color: p.text }]} numberOfLines={1}>
                            {title}
                        </Text>
                        <Text style={[styles.pageInfo, { color: p.muted }]}>
                            {currentPage + 1} / {totalPages}
                        </Text>
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

            <View style={styles.viewer}>
                <FlashList
                    key={`${uri}_${viewMode}`}
                    ref={flatListRef}
                    data={Array.from({ length: totalPages }, (_, i) => i)}
                    renderItem={renderPage}
                    keyExtractor={keyExtractor}
                    horizontal={viewMode === "horizontal"}
                    pagingEnabled={viewMode === "horizontal"}
                    decelerationRate={viewMode === "horizontal" ? "fast" : "normal"}
                    scrollEventThrottle={16}
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    drawDistance={viewMode === "horizontal" ? width * 2 : height * 2}
                    onViewableItemsChanged={onViewableItemsChanged}
                    viewabilityConfig={viewabilityConfig}
                    initialScrollIndex={currentPage}
                />
            </View>

            {/* Toast de changement de mode */}
            <Animated.View
                pointerEvents="none"
                style={[styles.toastContainer, toastStyle, { backgroundColor: `${p.background}E0` }]}
            >
                <Ionicons
                    name={viewMode === "vertical" ? "document-text" : "book"}
                    size={24}
                    color={p.primaryBright}
                />
                <Text style={[styles.toastText, { color: p.text }]}>{toastText}</Text>
            </Animated.View>
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
    errorContainer: {
        position: "absolute",
        alignItems: "center",
        gap: 16,
    },
    errorText: {
        fontSize: 16,
        fontWeight: "800",
        textAlign: "center",
    },
    toastContainer: {
        position: "absolute",
        top: "45%",
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 30,
        gap: 10,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
        elevation: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    toastText: {
        fontSize: 14,
        fontWeight: "700",
    },
});
