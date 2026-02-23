import React, { useState, useCallback, useRef, useEffect } from "react";
import { View, StyleSheet, ActivityIndicator, Text, PixelRatio } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS
} from "react-native-reanimated";
import { Image } from 'expo-image';
import { pdfCacheService } from "../services/PdfCacheService";

const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

interface ZoomablePageProps {
    uri: string | null;
    pageNum: number;
    loading: boolean;
    error: boolean;
    width: number;
    height: number;
    onTap: () => void;
    onRetry?: () => void;
    themeColor?: string;
}

export const ZoomablePage: React.FC<ZoomablePageProps> = ({
    uri,
    pageNum,
    loading,
    error,
    width,
    height,
    onTap,
    onRetry,
    themeColor = "#fff",
}) => {
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);

    // --- HD Overlay State ---
    const [hdPatchUri, setHdPatchUri] = useState<string | null>(null);
    const [imageNaturalSize, setImageNaturalSize] = useState<{ w: number; h: number } | null>(null);
    const hdRequestIdRef = useRef(0);
    const hdDelayTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Clean up on unmount or page change
    useEffect(() => {
        return () => {
            hdRequestIdRef.current++;
            if (hdDelayTimerRef.current) clearTimeout(hdDelayTimerRef.current);
        };
    }, [pageNum]);

    const handleImageLoad = useCallback((e: any) => {
        if (e?.source) {
            setImageNaturalSize({ w: e.source.width, h: e.source.height });
        }
    }, []);

    // Calculate where the image sits within the container (contentFit="contain")
    const getImageLayout = useCallback(() => {
        if (!imageNaturalSize) return null;
        const imgAspect = imageNaturalSize.w / imageNaturalSize.h;
        const containerAspect = width / height;

        let displayW: number, displayH: number, marginX: number, marginY: number;
        if (imgAspect > containerAspect) {
            displayW = width;
            displayH = width / imgAspect;
            marginX = 0;
            marginY = (height - displayH) / 2;
        } else {
            displayH = height;
            displayW = height * imgAspect;
            marginX = (width - displayW) / 2;
            marginY = 0;
        }
        return { displayW, displayH, marginX, marginY };
    }, [imageNaturalSize, width, height]);

    /**
     * Demande un patch HD de la zone visible au module natif.
     * Le patch est un bitmap taille-écran qui couvre exactement le viewport.
     */
    const requestHdPatch = useCallback(async (s: number, tx: number, ty: number) => {
        if (s <= 1.15 || !imageNaturalSize) {
            setHdPatchUri(null);
            return;
        }

        const requestId = ++hdRequestIdRef.current;
        const layout = getImageLayout();
        if (!layout) return;

        const { displayW, displayH, marginX, marginY } = layout;
        const cx = width / 2;
        const cy = height / 2;

        // Viewport corners in container (unscaled) coordinates
        const vpLeft = (0 - cx - tx) / s + cx;
        const vpTop = (0 - cy - ty) / s + cy;
        const vpRight = (width - cx - tx) / s + cx;
        const vpBottom = (height - cy - ty) / s + cy;

        // Convert to normalized page coordinates [0..1] (may exceed bounds for letterboxing)
        const cropX = (vpLeft - marginX) / displayW;
        const cropY = (vpTop - marginY) / displayH;
        const cropW = (vpRight - vpLeft) / displayW;
        const cropH = (vpBottom - vpTop) / displayH;

        if (cropW <= 0.01 || cropH <= 0.01) return;

        try {
            const pixelRatio = PixelRatio.get();
            const outputWidth = Math.floor(width * pixelRatio);
            const outputHeight = Math.floor(height * pixelRatio);

            const patchUri = await pdfCacheService.extractPageRegion(
                pageNum, cropX, cropY, cropW, cropH, outputWidth, outputHeight
            );

            // Only apply if this is still the latest request
            if (hdRequestIdRef.current === requestId) {
                setHdPatchUri(patchUri);
            }
        } catch (e) {
            // Silently fail (document may have been closed)
        }
    }, [imageNaturalSize, width, height, pageNum, getImageLayout]);

    const clearHdPatch = useCallback(() => {
        hdRequestIdRef.current++;
        if (hdDelayTimerRef.current) clearTimeout(hdDelayTimerRef.current);
        setHdPatchUri(null);
    }, []);

    /** Demande un patch HD après un délai (pour laisser l'animation spring se terminer) */
    const delayedRequestHdPatch = useCallback((s: number, tx: number, ty: number, delayMs: number = 80) => {
        if (hdDelayTimerRef.current) clearTimeout(hdDelayTimerRef.current);
        hdDelayTimerRef.current = setTimeout(() => {
            requestHdPatch(s, tx, ty);
        }, delayMs);
    }, [requestHdPatch]);

    // --- Transform Logic ---

    const resetValues = (animated = true) => {
        'worklet';
        if (animated) {
            scale.value = withSpring(1);
            translateX.value = withSpring(0);
            translateY.value = withSpring(0);
        } else {
            scale.value = 1;
            translateX.value = 0;
            translateY.value = 0;
        }
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
    };

    // Reset on page recycle (FlashList)
    useEffect(() => {
        try {
            scale.value = 1;
            translateX.value = 0;
            translateY.value = 0;
            savedScale.value = 1;
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
            setHdPatchUri(null);
        } catch {
            // FlashList recycling protection
        }
    }, [pageNum]);

    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .onEnd((e) => {
            'worklet';
            if (scale.value > 1.1) {
                resetValues();
                runOnJS(clearHdPatch)();
            } else {
                const targetScale = 2.5;
                const targetX = (width / 2 - e.x) * (targetScale - 1);
                const targetY = (height / 2 - e.y) * (targetScale - 1);
                scale.value = withSpring(targetScale);
                translateX.value = withSpring(targetX);
                translateY.value = withSpring(targetY);
                savedScale.value = targetScale;
                savedTranslateX.value = targetX;
                savedTranslateY.value = targetY;
                // Délai très court pour le double-tap car le spring est rapide
                runOnJS(delayedRequestHdPatch)(targetScale, targetX, targetY, 150);
            }
        });

    const singleTapGesture = Gesture.Tap()
        .requireExternalGestureToFail(doubleTapGesture)
        .onEnd(() => {
            runOnJS(onTap)();
        });

    const pinchGesture = Gesture.Pinch()
        .onStart(() => {
            'worklet';
            savedScale.value = scale.value;
            runOnJS(clearHdPatch)();
        })
        .onUpdate((e) => {
            'worklet';
            scale.value = Math.min(Math.max(savedScale.value * e.scale, 0.9), 6);
        })
        .onEnd(() => {
            'worklet';
            if (scale.value < 1.1) {
                resetValues();
                runOnJS(clearHdPatch)();
            } else {
                savedScale.value = scale.value;
                // Le pinch n'a pas de grand spring : patch presque immédiat
                runOnJS(delayedRequestHdPatch)(scale.value, translateX.value, translateY.value, 80);
            }
        });

    const panGesture = Gesture.Pan()
        .averageTouches(true)
        .manualActivation(true)
        .onTouchesMove((_e, manager) => {
            'worklet';
            if (scale.value > 1.1) {
                manager.activate();
            } else {
                manager.fail();
            }
        })
        .onStart(() => {
            'worklet';
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
            runOnJS(clearHdPatch)();
        })
        .onUpdate((e) => {
            'worklet';
            if (scale.value > 1.1) {
                translateX.value = savedTranslateX.value + e.translationX;
                translateY.value = savedTranslateY.value + e.translationY;
            }
        })
        .onEnd(() => {
            'worklet';
            if (scale.value <= 1.1) {
                resetValues();
                runOnJS(clearHdPatch)();
                return;
            }
            const maxTranslateX = (width * scale.value - width) / 2;
            const maxTranslateY = (height * scale.value - height) / 2;
            const clampedTx = Math.min(Math.max(translateX.value, -maxTranslateX), maxTranslateX);
            const clampedTy = Math.min(Math.max(translateY.value, -maxTranslateY), maxTranslateY);
            translateX.value = withSpring(clampedTx);
            translateY.value = withSpring(clampedTy);
            savedTranslateX.value = clampedTx;
            savedTranslateY.value = clampedTy;
            // Patch très rapide après le relachement du pan
            runOnJS(delayedRequestHdPatch)(scale.value, clampedTx, clampedTy, 100);
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }));

    if (error) {
        return (
            <View style={[styles.container, { width, height }]}>
                <Text style={styles.errorText}>Erreur de chargement</Text>
                {onRetry && (
                    <View style={styles.retryBtn}>
                        <Text style={styles.retryText} onPress={onRetry}>Réessayer</Text>
                    </View>
                )}
            </View>
        );
    }

    if (!uri) {
        return (
            <View style={[styles.container, { width, height }]}>
                <ActivityIndicator size="large" color={themeColor} />
            </View>
        );
    }

    const imageUri = uri.startsWith("/") ? `file://${uri}` : uri;
    const hdUri = hdPatchUri ? (hdPatchUri.startsWith("/") ? `file://${hdPatchUri}` : hdPatchUri) : null;

    const combinedGestures = Gesture.Simultaneous(
        pinchGesture,
        panGesture,
        Gesture.Exclusive(doubleTapGesture, singleTapGesture)
    );

    return (
        <View style={[styles.container, { width, height }]}>
            <GestureDetector gesture={combinedGestures}>
                <Animated.View style={[styles.imageContainer, { width, height }]}>
                    {/* Couche 1 : Image de base à résolution native (légère, fluide) */}
                    <AnimatedExpoImage
                        source={{ uri: imageUri }}
                        style={[animatedStyle, { width, height }]}
                        contentFit="contain"
                        cachePolicy="disk"
                        recyclingKey={`page_${pageNum}`}
                        allowDownscaling={false}
                        onLoad={handleImageLoad}
                    />
                </Animated.View>
            </GestureDetector>

            {/* Couche 2 : Patch HD de la zone visible (apparaît quand le zoom se stabilise) */}
            {hdUri && (
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <Image
                        source={{ uri: hdUri }}
                        style={StyleSheet.absoluteFill}
                        contentFit="fill"
                        cachePolicy="none"
                        transition={200}
                    />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#000",
        overflow: "hidden",
    },
    imageContainer: {
        justifyContent: "center",
        alignItems: "center",
    },
    errorText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
        textAlign: "center",
    },
    retryBtn: {
        marginTop: 16,
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: "#007AFF",
        borderRadius: 8,
    },
    retryText: {
        color: "#fff",
        fontWeight: "600",
    },
});
