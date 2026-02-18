import React from "react";
import { View, StyleSheet, ActivityIndicator, Text } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS
} from "react-native-reanimated";

interface ZoomablePageProps {
    uri: string | null;
    loading: boolean;
    error: boolean;
    width: number;
    height: number;
    onTap: () => void;
    onRetry?: () => void;
}

export const ZoomablePage: React.FC<ZoomablePageProps> = ({
    uri,
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

    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .onEnd((e) => {
            if (scale.value > 1.2) {
                resetValues();
            } else {
                scale.value = withSpring(2.5);
                // On déplace pour zoomer vers le point touché
                const targetX = (width / 2 - e.x) * 1.5;
                const targetY = (height / 2 - e.y) * 1.5;
                translateX.value = withSpring(targetX);
                translateY.value = withSpring(targetY);
                savedScale.value = 2.5;
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
        .onStart((e) => {
            'worklet';
            // On mémorise le point de départ du zoom pour le focal point
            savedScale.value = scale.value;
        })
        .onUpdate((e) => {
            'worklet';
            const newScale = Math.min(Math.max(savedScale.value * e.scale, 0.8), 6);

            // Calcul du focal point pour que le zoom s'axe sur les doigts
            if (newScale > 1) {
                const focalX = e.focalX - width / 2;
                const focalY = e.focalY - height / 2;

                translateX.value = savedTranslateX.value + (focalX - savedTranslateX.value) * (1 - e.scale);
                translateY.value = savedTranslateY.value + (focalY - savedTranslateY.value) * (1 - e.scale);
            }

            scale.value = newScale;
        })
        .onEnd(() => {
            'worklet';
            if (scale.value < 1.05) {
                resetValues();
            } else {
                savedScale.value = scale.value;
                savedTranslateX.value = translateX.value;
                savedTranslateY.value = translateY.value;
            }
        });

    const panGesture = Gesture.Pan()
        .manualActivation(true)
        .onTouchesMove((_e, manager) => {
            'worklet';
            // On n'active le pan que si on est déjà zoomé, sinon on laisse la FlatList scroller
            if (scale.value > 1.01) {
                manager.activate();
            } else {
                manager.fail();
            }
        })
        .averageTouches(true)
        .onUpdate((e) => {
            'worklet';
            const maxTranslateX = (width * scale.value - width) / 2;
            const maxTranslateY = (height * scale.value - height) / 2;

            // On permet un léger dépassement (bounce effect) de 50px
            translateX.value = Math.min(
                Math.max(savedTranslateX.value + e.translationX, -maxTranslateX - 50),
                maxTranslateX + 50
            );
            translateY.value = Math.min(
                Math.max(savedTranslateY.value + e.translationY, -maxTranslateY - 50),
                maxTranslateY + 50
            );
        })
        .onEnd(() => {
            'worklet';
            if (scale.value <= 1.01) {
                resetValues();
                return;
            }

            const maxTranslateX = (width * scale.value - width) / 2;
            const maxTranslateY = (height * scale.value - height) / 2;

            // Retour élastique (Spring) si on a dépassé les bords
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

    if (!uri) {
        return (
            <View style={[styles.container, { width, height }]}>
                <Text style={styles.errorText}>Pas d'image</Text>
            </View>
        );
    }

    const imageUri = uri.startsWith("/") ? `file://${uri}` : uri;

    // On combine les gestes : le déplacement et le pince-zoom peuvent être simultanés
    // mais ils sont exclusifs par rapport aux taps.
    const combinedGestures = Gesture.Exclusive(
        Gesture.Simultaneous(pinchGesture, panGesture),
        doubleTapGesture,
        singleTapGesture
    );

    return (
        <View style={[styles.container, { width, height }]}>
            <GestureDetector gesture={combinedGestures}>
                <Animated.View style={[styles.imageContainer, { width, height }]}>
                    <Animated.Image
                        source={{ uri: imageUri }}
                        style={[styles.image, animatedStyle, { width, height }]}
                        resizeMode="contain"
                    />
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
    image: {
        backgroundColor: "#000",
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
