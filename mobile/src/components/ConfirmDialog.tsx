import React from "react";
import {
    Modal,
    View,
    Text,
    Pressable,
    StyleSheet,
    Animated,
    Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { radius, spacing } from "../theme";

interface ConfirmDialogProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    icon?: keyof typeof Ionicons.glyphMap;
    iconColor?: string;
    variant?: "danger" | "success" | "warning" | "info";
    palette: {
        background: string;
        surface: string;
        text: string;
        muted: string;
        border: string;
        danger: string;
        success: string;
        warning?: string;
    };
    accent?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    visible,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "Confirmer",
    cancelText = "Annuler",
    icon,
    iconColor,
    variant = "info",
    palette,
    accent = "#6366f1",
}) => {
    const scaleAnim = React.useRef(new Animated.Value(0.9)).current;
    const opacityAnim = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 100,
                    friction: 8,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            scaleAnim.setValue(0.9);
            opacityAnim.setValue(0);
        }
    }, [visible]);

    const getVariantColors = () => {
        switch (variant) {
            case "danger":
                return {
                    iconBg: `${palette.danger}15`,
                    iconBorder: `${palette.danger}30`,
                    iconColor: palette.danger,
                    confirmBg: palette.danger,
                    confirmGradient: [palette.danger, "#dc2626"] as [string, string],
                };
            case "success":
                return {
                    iconBg: `${palette.success}15`,
                    iconBorder: `${palette.success}30`,
                    iconColor: palette.success,
                    confirmBg: palette.success,
                    confirmGradient: [palette.success, "#059669"] as [string, string],
                };
            case "warning":
                return {
                    iconBg: `${palette.warning || "#f59e0b"}15`,
                    iconBorder: `${palette.warning || "#f59e0b"}30`,
                    iconColor: palette.warning || "#f59e0b",
                    confirmBg: palette.warning || "#f59e0b",
                    confirmGradient: ["#f59e0b", "#d97706"] as [string, string],
                };
            default:
                return {
                    iconBg: `${accent}15`,
                    iconBorder: `${accent}30`,
                    iconColor: accent,
                    confirmBg: accent,
                    confirmGradient: [accent, accent] as [string, string],
                };
        }
    };

    const variantColors = getVariantColors();
    const finalIconColor = iconColor || variantColors.iconColor;

    const defaultIcon = variant === "danger" ? "warning" :
        variant === "success" ? "checkmark-circle" :
            variant === "warning" ? "alert-circle" : "information-circle";

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Pressable style={styles.backdrop} onPress={onClose} />

                <Animated.View
                    style={[
                        styles.dialogContainer,
                        {
                            transform: [{ scale: scaleAnim }],
                            opacity: opacityAnim,
                        },
                    ]}
                >
                    <View style={[styles.dialog, { backgroundColor: palette.surface, borderColor: `${palette.border}40` }]}>
                        {/* Header avec icône */}
                        <View style={styles.header}>
                            <View
                                style={[
                                    styles.iconContainer,
                                    {
                                        backgroundColor: variantColors.iconBg,
                                        borderColor: variantColors.iconBorder,
                                    },
                                ]}
                            >
                                <Ionicons
                                    name={icon || defaultIcon}
                                    size={32}
                                    color={finalIconColor}
                                />
                            </View>
                        </View>

                        {/* Contenu */}
                        <View style={styles.content}>
                            <Text style={[styles.title, { color: palette.text }]}>
                                {title}
                            </Text>
                            <Text style={[styles.message, { color: palette.muted }]}>
                                {message}
                            </Text>
                        </View>

                        {/* Boutons */}
                        <View style={styles.buttons}>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.button,
                                    styles.cancelButton,
                                    { backgroundColor: `${palette.border}30`, borderColor: `${palette.border}50` },
                                    pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
                                ]}
                                onPress={onClose}
                            >
                                <Text style={[styles.cancelText, { color: palette.muted }]}>
                                    {cancelText}
                                </Text>
                            </Pressable>

                            <Pressable
                                style={({ pressed }) => [
                                    styles.button,
                                    styles.confirmButton,
                                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                                ]}
                                onPress={() => {
                                    onConfirm();
                                    onClose();
                                }}
                            >
                                <LinearGradient
                                    colors={variantColors.confirmGradient}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.confirmGradient}
                                >
                                    <Text style={styles.confirmText}>{confirmText}</Text>
                                </LinearGradient>
                            </Pressable>
                        </View>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    dialogContainer: {
        width: SCREEN_WIDTH - 48,
        maxWidth: 340,
    },
    dialog: {
        borderRadius: radius.xl,
        borderWidth: 1,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 20,
    },
    header: {
        alignItems: "center",
        paddingTop: spacing.xl,
        paddingBottom: spacing.md,
    },
    iconContainer: {
        width: 72,
        height: 72,
        borderRadius: 36,
        borderWidth: 2,
        alignItems: "center",
        justifyContent: "center",
    },
    content: {
        paddingHorizontal: spacing.xl,
        paddingBottom: spacing.lg,
        alignItems: "center",
    },
    title: {
        fontSize: 20,
        fontWeight: "900",
        textAlign: "center",
        marginBottom: spacing.sm,
    },
    message: {
        fontSize: 14,
        fontWeight: "600",
        textAlign: "center",
        lineHeight: 20,
    },
    buttons: {
        flexDirection: "row",
        padding: spacing.md,
        gap: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: "rgba(0,0,0,0.05)",
    },
    button: {
        flex: 1,
        borderRadius: radius.md,
        overflow: "hidden",
    },
    cancelButton: {
        borderWidth: 1,
        paddingVertical: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    confirmButton: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    confirmGradient: {
        paddingVertical: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    cancelText: {
        fontSize: 15,
        fontWeight: "800",
    },
    confirmText: {
        fontSize: 15,
        fontWeight: "900",
        color: "#fff",
    },
});
