import React, { useState } from "react";
import { Modal, View, StyleSheet, Pressable, Text, Alert, ActivityIndicator } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { palette, radius, spacing } from "../theme";
import {
    createVkAuthorizationRequest,
    exchangeVkAuthorizationCode,
    VK_ANDROID_REDIRECT_URI,
    VkAuthSession,
} from "../services/vk-auth";

WebBrowser.maybeCompleteAuthSession();

interface VkAuthModalProps {
    visible: boolean;
    onClose: () => void;
    onSuccess: (session: VkAuthSession) => Promise<void>;
}

export const VkAuthModal: React.FC<VkAuthModalProps> = ({ visible, onClose, onSuccess }) => {
    const [isConnecting, setIsConnecting] = useState(false);

    const openBrowser = async () => {
        setIsConnecting(true);
        try {
            const request = await createVkAuthorizationRequest();
            const result = await WebBrowser.openAuthSessionAsync(request.url, VK_ANDROID_REDIRECT_URI);
            if (result.type !== "success") return;

            const callback = new URL(result.url);
            const error = callback.searchParams.get("error");
            if (error) {
                throw new Error(callback.searchParams.get("error_description") || error);
            }
            const returnedState = callback.searchParams.get("state");
            const code = callback.searchParams.get("code");
            const deviceId = callback.searchParams.get("device_id");
            if (returnedState !== request.state || !code || !deviceId) {
                throw new Error("La réponse de VK ID est incomplète ou ne correspond pas à la demande.");
            }

            const session = await exchangeVkAuthorizationCode(
                code,
                deviceId,
                request.state,
                request.codeVerifier,
            );
            await onSuccess(session);
            onClose();
        } catch (error) {
            Alert.alert(
                "Connexion VK impossible",
                error instanceof Error ? error.message : "Une erreur inconnue est survenue.",
            );
        } finally {
            setIsConnecting(false);
        }
    };

    const handleClose = () => {
        if (isConnecting) return;
        onClose();
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={handleClose}
        >
            <View style={styles.container}>
                <View style={styles.header}>
                    <Pressable style={styles.closeBtn} onPress={handleClose}>
                        <Ionicons name="close" size={24} color={palette.text} />
                    </Pressable>
                    <Text style={styles.headerTitle}>Connexion VK</Text>
                    <View style={styles.placeholder} />
                </View>

                <View style={styles.content}>
                    <View style={styles.iconCircle}>
                        <Ionicons name="logo-vk" size={48} color="#4C75A3" />
                    </View>
                    <Text style={styles.title}>Se connecter avec VK ID</Text>
                    <Text style={styles.desc}>
                        VK ID va ouvrir une fenêtre sécurisée puis revenir automatiquement dans Vkomic. Aucun mot de passe ni token ne sera copié manuellement.
                    </Text>
                    <Pressable
                        style={[styles.primaryBtn, isConnecting && { opacity: 0.65 }]}
                        onPress={openBrowser}
                        disabled={isConnecting}
                    >
                        {isConnecting ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Ionicons name="open-outline" size={20} color="#fff" />
                        )}
                        <Text style={styles.primaryBtnText}>
                            {isConnecting ? "Connexion…" : "Continuer avec VK ID"}
                        </Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: palette.background,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: palette.border,
        backgroundColor: palette.surface,
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: radius.md,
        backgroundColor: `${palette.border}50`,
        alignItems: "center",
        justifyContent: "center",
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: "900",
        color: palette.text,
    },
    placeholder: {
        width: 40,
    },
    content: {
        flex: 1,
        padding: spacing.xl,
        alignItems: "center",
        justifyContent: "center",
    },
    iconCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: `${palette.primary}15`,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: spacing.lg,
    },
    title: {
        fontSize: 22,
        fontWeight: "900",
        color: palette.text,
        marginBottom: spacing.md,
        textAlign: "center",
    },
    desc: {
        fontSize: 14,
        color: palette.muted,
        textAlign: "center",
        lineHeight: 22,
        marginBottom: spacing.xl,
    },
    primaryBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.sm,
        backgroundColor: "#4C75A3",
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        borderRadius: radius.lg,
    },
    primaryBtnText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "900",
    },
});
