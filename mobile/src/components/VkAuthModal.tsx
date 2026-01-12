import React, { useState } from "react";
import { Modal, View, StyleSheet, Pressable, Text, TextInput, Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { palette, radius, spacing } from "../theme";

// Kate Mobile App ID (Public)
const VK_APP_ID = "2685278";
const VK_REDIRECT_URI = "https://oauth.vk.com/blank.html";
const VK_SCOPE = "docs,groups,wall,offline";

interface VkAuthModalProps {
    visible: boolean;
    onClose: () => void;
    onSuccess: (token: string) => void;
}

export const VkAuthModal: React.FC<VkAuthModalProps> = ({ visible, onClose, onSuccess }) => {
    const [pastedUrl, setPastedUrl] = useState("");
    const [step, setStep] = useState<"intro" | "paste">("intro");

    const authUrl = `https://oauth.vk.com/authorize?client_id=${VK_APP_ID}&scope=${VK_SCOPE}&redirect_uri=${VK_REDIRECT_URI}&response_type=token&v=5.131&revoke=1`;

    const openBrowser = async () => {
        await WebBrowser.openBrowserAsync(authUrl);
        setStep("paste");
    };

    const handlePasteFromClipboard = async () => {
        const text = await Clipboard.getStringAsync();
        if (text) {
            setPastedUrl(text);
            tryExtractToken(text);
        }
    };

    const tryExtractToken = (url: string) => {
        if (url.includes("access_token=")) {
            const fragment = url.split("#")[1] || url.split("access_token=")[1];
            if (fragment) {
                let tokenPart = fragment;
                if (fragment.includes("access_token=")) {
                    tokenPart = fragment.split("access_token=")[1];
                }
                const token = tokenPart.split("&")[0];
                if (token && token.length > 10) {
                    onSuccess(token);
                    handleClose();
                    return;
                }
            }
        }
        Alert.alert("Erreur", "Impossible d'extraire le token. Vérifiez que vous avez copié l'URL complète.");
    };

    const handleClose = () => {
        setStep("intro");
        setPastedUrl("");
        onClose();
    };

    const handleSubmit = () => {
        if (pastedUrl.trim()) {
            tryExtractToken(pastedUrl.trim());
        }
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
                    {step === "intro" ? (
                        <>
                            <View style={styles.iconCircle}>
                                <Ionicons name="logo-vk" size={48} color="#4C75A3" />
                            </View>
                            <Text style={styles.title}>Se connecter avec VK</Text>
                            <Text style={styles.desc}>
                                Vous allez être redirigé vers VK pour vous connecter. Après connexion, copiez l'URL de la page blanche.
                            </Text>
                            <Pressable style={styles.primaryBtn} onPress={openBrowser}>
                                <Ionicons name="open-outline" size={20} color="#fff" />
                                <Text style={styles.primaryBtnText}>Ouvrir VK</Text>
                            </Pressable>
                        </>
                    ) : (
                        <>
                            <View style={styles.iconCircle}>
                                <Ionicons name="clipboard" size={48} color={palette.primary} />
                            </View>
                            <Text style={styles.title}>Coller l'URL</Text>
                            <Text style={styles.desc}>
                                Après vous être connecté, vous avez été redirigé vers une page blanche.{"\n\n"}
                                <Text style={{ fontWeight: "900" }}>Copiez l'URL complète</Text> de cette page et collez-la ci-dessous :
                            </Text>
                            <TextInput
                                style={styles.input}
                                placeholder="https://oauth.vk.com/blank.html#access_token=..."
                                placeholderTextColor={palette.muted}
                                value={pastedUrl}
                                onChangeText={setPastedUrl}
                                autoCapitalize="none"
                                autoCorrect={false}
                                multiline
                            />
                            <View style={styles.btnRow}>
                                <Pressable style={styles.secondaryBtn} onPress={handlePasteFromClipboard}>
                                    <Ionicons name="clipboard-outline" size={18} color={palette.primary} />
                                    <Text style={styles.secondaryBtnText}>Coller</Text>
                                </Pressable>
                                <Pressable
                                    style={[styles.primaryBtn, { flex: 1 }]}
                                    onPress={handleSubmit}
                                    disabled={!pastedUrl.trim()}
                                >
                                    <Ionicons name="checkmark" size={20} color="#fff" />
                                    <Text style={styles.primaryBtnText}>Valider</Text>
                                </Pressable>
                            </View>
                            <Pressable style={styles.linkBtn} onPress={openBrowser}>
                                <Text style={styles.linkBtnText}>Réessayer la connexion</Text>
                            </Pressable>
                        </>
                    )}
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
    secondaryBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
        backgroundColor: `${palette.primary}15`,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: `${palette.primary}30`,
    },
    secondaryBtnText: {
        color: palette.primary,
        fontSize: 14,
        fontWeight: "800",
    },
    input: {
        width: "100%",
        backgroundColor: palette.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        padding: spacing.md,
        color: palette.text,
        fontSize: 13,
        minHeight: 80,
        marginBottom: spacing.md,
    },
    btnRow: {
        flexDirection: "row",
        gap: spacing.sm,
        width: "100%",
    },
    linkBtn: {
        marginTop: spacing.lg,
        padding: spacing.sm,
    },
    linkBtnText: {
        color: palette.muted,
        fontSize: 13,
        textDecorationLine: "underline",
    },
});
