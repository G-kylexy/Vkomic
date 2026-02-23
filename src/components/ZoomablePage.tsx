import React, { useState, useCallback, useRef, useEffect } from "react";
import { View, StyleSheet, ActivityIndicator, Text, PixelRatio } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
    SharedValue
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

interface PatchState {
    id: number;
    uri: string;
    originTx: number;
    originTy: number;
}

/** Component interne pour afficher un patch spécifique et le suivre à la trace */
const HdPatchLayer = React.memo(({ patch, translateX, translateY, onLoad }: {
    patch: PatchState;
    translateX: SharedValue<number>;
    translateY: SharedValue<number>;
    onLoad: (id: number) => void;
}) => {
    // Style animé du patch HD : suit le delta de translation par rapport à l'endroit où il a pop.
    const patchAnimatedStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { translateX: translateX.value - patch.originTx },
                { translateY: translateY.value - patch.originTy },
            ],
        };
    });

    return (
        <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, patchAnimatedStyle]}
        >
            <Image
                source={{ uri: patch.uri.startsWith("/") ? `file://${patch.uri}` : patch.uri }}
                style={StyleSheet.absoluteFill}
                contentFit="fill"
                cachePolicy="none"
                transition={150} // Fondu progressif pour donner l'effet "mise au point"
                onLoad={() => onLoad(patch.id)}
            />
        </Animated.View>
    );
});

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
    // Au lieu d'écraser le patch brutalement, on garde une liste des patchs (généralement 1 ou 2 max).
    // Quand le NOUVEAU patch finit de charger (décodage GPU), on efface l'ANCIEN.
    const [patches, setPatches] = useState<PatchState[]>([]);
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

    const requestHdPatch = useCallback(async (s: number, tx: number, ty: number) => {
        if (s <= 1.15 || !imageNaturalSize) {
            setPatches([]);
            return;
        }

        const requestId = ++hdRequestIdRef.current;
        const layout = getImageLayout();
        if (!layout) return;

        const { displayW, displayH, marginX, marginY } = layout;
        const cx = width / 2;
        const cy = height / 2;

        const vpLeft = (0 - cx - tx) / s + cx;
        const vpTop = (0 - cy - ty) / s + cy;
        const vpRight = (width - cx - tx) / s + cx;
        const vpBottom = (height - cy - ty) / s + cy;

        const cropX = (vpLeft - marginX) / displayW;
        const cropY = (vpTop - marginY) / displayH;
        const cropW = (vpRight - vpLeft) / displayW;
        const cropH = (vpBottom - vpTop) / displayH;

        if (cropW <= 0.01 || cropH <= 0.01) return;

        try {
            const pixelRatio = PixelRatio.get();
            // Restauration de la qualité UHD à 1.5x
            // On s'assure que tout est aussi net qu'auparavant.
            const qualityMultiplier = 1.5;
            const outputWidth = Math.floor(width * pixelRatio * qualityMultiplier);
            const outputHeight = Math.floor(height * pixelRatio * qualityMultiplier);

            const patchUri = await pdfCacheService.extractPageRegion(
                pageNum, cropX, cropY, cropW, cropH, outputWidth, outputHeight
            );

            if (hdRequestIdRef.current === requestId) {
                // On ajoute le nouveau patch à la liste, SANS supprimer le vieux tout de suite.
                setPatches(prev => {
                    const newPatch = { id: requestId, uri: patchUri, originTx: tx, originTy: ty };
                    return [...prev, newPatch].slice(-3); // Au pire 3 patches en cours
                });
            }
        } catch (e) {
            // Silently fail (document may have been closed)
        }
    }, [imageNaturalSize, width, height, pageNum, getImageLayout]);

    const clearHdPatch = useCallback(() => {
        hdRequestIdRef.current++;
        if (hdDelayTimerRef.current) clearTimeout(hdDelayTimerRef.current);
        setPatches([]); // Vide brutalement lors du Pincement
    }, []);

    const delayedRequestHdPatch = useCallback((s: number, tx: number, ty: number, delayMs: number = 20) => {
        if (hdDelayTimerRef.current) clearTimeout(hdDelayTimerRef.current);
        hdDelayTimerRef.current = setTimeout(() => {
            // NE PAS appeler clearHdPatch() ici !
            // La transition fluide se charge de remplacer le patch à la volée.
            requestHdPatch(s, tx, ty);
        }, delayMs);
    }, [requestHdPatch]);

    // Cleanup : le délai DOIT être >= la durée du transition (150ms)
    // pour éviter que l'ancien patch disparaisse pendant que le nouveau est encore transparent.
    const onPatchLoadFinished = useCallback((id: number) => {
        setTimeout(() => {
            setPatches(prev => prev.filter(p => p.id >= id));
        }, 200); // 200ms > 150ms de transition = sécurité totale
    }, []);

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

    useEffect(() => {
        try {
            scale.value = 1;
            translateX.value = 0;
            translateY.value = 0;
            savedScale.value = 1;
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
            setPatches([]);
        } catch {
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
                runOnJS(clearHdPatch)();
                runOnJS(delayedRequestHdPatch)(targetScale, targetX, targetY, 100);
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
            // Le scale change physiquement → l'ancien patch n'est plus à la bonne taille, on nettoie
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
                runOnJS(delayedRequestHdPatch)(scale.value, translateX.value, translateY.value, 0);
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
            // Spring amorti sans rebond (critically damped) pour éviter d'exposer les bords du patch
            const springConfig = { damping: 20, stiffness: 300 };
            translateX.value = withSpring(clampedTx, springConfig);
            translateY.value = withSpring(clampedTy, springConfig);
            savedTranslateX.value = clampedTx;
            savedTranslateY.value = clampedTy;
            // Zero Flicker : l'ancien patch reste intact, le nouveau le remplace dès qu'il est prêt
            runOnJS(delayedRequestHdPatch)(scale.value, clampedTx, clampedTy, 0);
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

    const combinedGestures = Gesture.Simultaneous(
        pinchGesture,
        panGesture,
        Gesture.Exclusive(doubleTapGesture, singleTapGesture)
    );

    return (
        <View style={[styles.container, { width, height }]}>
            <GestureDetector gesture={combinedGestures}>
                <Animated.View style={[styles.imageContainer, { width, height }]}>
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

            {/* Affiche tous les patchs (habituellement 1, parfois 2 le temps de la transition) */}
            {patches.map(patch => (
                <HdPatchLayer
                    key={patch.id}
                    patch={patch}
                    translateX={translateX}
                    translateY={translateY}
                    onLoad={onPatchLoadFinished}
                />
            ))}
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
