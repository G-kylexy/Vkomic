import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useVk } from "../context/VkContext";
import { radius } from "../theme";

export const FloatingPing: React.FC = () => {
    const { status, activePalette: p } = useVk();

    if (!status.connected && !status.latencyMs) return null;

    return (
        <View style={[styles.container, { backgroundColor: `${p.surface}CC`, borderColor: `${p.border}40` }]}>
            <View
                style={[
                    styles.dot,
                    {
                        backgroundColor: status.connected ? p.success : p.danger,
                    },
                ]}
            />
            {status.connected && status.latencyMs !== null && (
                <Text style={[styles.text, { color: p.subtle }]}>{status.latencyMs}ms</Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: "absolute",
        bottom: 72,
        left: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: radius.sm,
        borderWidth: 1,
        zIndex: 1000,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    text: {
        fontSize: 10,
        fontWeight: "900",
    },
});
