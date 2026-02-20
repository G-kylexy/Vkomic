import React from "react";
import { View, StyleSheet, ActivityIndicator, Text } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS
} from "react-native-reanimated";
import { Image } from 'expo-image';

const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

interface ZoomablePageProps {
    thumbUri: string | null;
    hdUri: string | null;
    pageNum: number;
    loading: boolean;
    error: boolean;
    width: number;
    height: number;
    onTap: () => void;
    onRetry?: () => void;
}

export const ZoomablePage: React.FC<ZoomablePageProps> = ({
    thumbUri,
    hdUri,
    pageNum,
    loading,
    error,
    width,
    height,
    onTap,
    onRetry,
}) => {
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);

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

    // Reset uniquement au changement de PAGE
    // Protégé contre le gel des composants par FlashList lors du recyclage
    React.useEffect(() => {
        try {
            scale.value = 1;
            translateX.value = 0;
            translateY.value = 0;
            savedScale.value = 1;
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
        } catch {
            // Composant recyclé/gelé par FlashList — ignoré
        }
    }, [pageNum]);

    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .onEnd((e) => {
            'worklet';
            if (scale.value > 1.1) {
                resetValues();
            } else {
                const targetScale = 2.5;
                scale.value = withSpring(targetScale);

                const targetX = (width / 2 - e.x) * (targetScale - 1);
                const targetY = (height / 2 - e.y) * (targetScale - 1);

                translateX.value = withSpring(targetX);
                translateY.value = withSpring(targetY);

                savedScale.value = targetScale;
                savedTranslateX.value = targetX;
                savedTranslateY.value = targetY;
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
        })
        .onUpdate((e) => {
            'worklet';
            scale.value = Math.min(Math.max(savedScale.value * e.scale, 0.9), 6);
        })
        .onEnd(() => {
            'worklet';
            if (scale.value < 1.1) {
                resetValues();
            } else {
                savedScale.value = scale.value;
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
                return;
            }

            const maxTranslateX = (width * scale.value - width) / 2;
            const maxTranslateY = (height * scale.value - height) / 2;

            translateX.value = withSpring(
                Math.min(Math.max(translateX.value, -maxTranslateX), maxTranslateX)
            );
            translateY.value = withSpring(
                Math.min(Math.max(translateY.value, -maxTranslateY), maxTranslateY)
            );

            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }));

    if (loading) {
        return (
            <View style={[styles.container, { width, height }]}>
                <ActivityIndicator size="large" color="#fff" />
            </View>
        );
    }

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

    if (!thumbUri && !hdUri) {
        return (
            <View style={[styles.container, { width, height }]}>
                <Text style={styles.errorText}>En attente...</Text>
            </View>
        );
    }

    const tUri = thumbUri?.startsWith("/") ? `file://${thumbUri}` : thumbUri;
    const hUri = hdUri?.startsWith("/") ? `file://${hdUri}` : hdUri;

    const combinedGestures = Gesture.Simultaneous(
        pinchGesture,
        panGesture,
        Gesture.Exclusive(doubleTapGesture, singleTapGesture)
    );

    return (
        <View style={[styles.container, { width, height }]}>
            <GestureDetector gesture={combinedGestures}>
                <Animated.View style={[styles.imageContainer, { width, height }]}>
                    {/* Thumbnail layer */}
                    {tUri && (
                        <AnimatedExpoImage
                            source={{ uri: tUri }}
                            style={[animatedStyle, { width, height, position: 'absolute' }]}
                            contentFit="contain"
                            cachePolicy="memory-disk"
                            recyclingKey={`thumb_${pageNum}`}
                        />
                    )}
                    {/* HD layer */}
                    {hUri && (
                        <AnimatedExpoImage
                            source={{ uri: hUri }}
                            style={[animatedStyle, { width, height, position: 'absolute' }]}
                            contentFit="contain"
                            cachePolicy="memory-disk"
                            transition={200}
                            recyclingKey={`hd_${pageNum}`}
                        />
                    )}
                </Animated.View>
            </GestureDetector>
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
