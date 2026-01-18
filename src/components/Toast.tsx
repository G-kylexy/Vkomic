import React, { useEffect } from 'react';
import { StyleSheet, Text, View, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVk } from '../context/VkContext';
import { useToast, ToastMessage, ToastType } from '../context/ToastContext';

const ToastItem = ({ item, onHide }: { item: ToastMessage; onHide: () => void }) => {
    const { activePalette: p } = useVk();
    const opacity = React.useRef(new Animated.Value(0)).current;
    const translateY = React.useRef(new Animated.Value(50)).current;

    // Animation for progress
    const progressAnim = React.useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }),
            Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: true,
                friction: 5,
            })
        ]).start();
    }, []);

    useEffect(() => {
        if (item.type === 'progress' && item.progress !== undefined) {
            Animated.timing(progressAnim, {
                toValue: item.progress,
                duration: 200,
                useNativeDriver: false,
            }).start();
        }
    }, [item.progress]);

    const getTheme = (type: ToastType) => {
        switch (type) {
            case 'success': return { icon: 'checkmark-circle', color: '#10b981', bg: '#ecfdf5', border: '#10b981' };
            case 'error': return { icon: 'alert-circle', color: '#ef4444', bg: '#fef2f2', border: '#ef4444' };
            case 'progress': return { icon: 'cloud-download', color: '#8b5cf6', bg: '#f5f3ff', border: '#8b5cf6' }; // Violet for download
            default: return { icon: 'information-circle', color: '#3b82f6', bg: '#eff6ff', border: '#3b82f6' };
        }
    };

    const theme = getTheme(item.type);

    return (
        <Animated.View style={[
            styles.toastContainer,
            { opacity, transform: [{ translateY }], backgroundColor: p.surface, borderColor: `${p.border}50` }
        ]}>
            <View style={[styles.iconContainer, { backgroundColor: theme.bg }]}>
                <Ionicons name={theme.icon as any} size={24} color={theme.color} />
            </View>
            <View style={styles.contentContainer}>
                <Text style={[styles.message, { color: p.text }]}>{item.message}</Text>

                {item.type === 'progress' && (
                    <View style={styles.progressContainer}>
                        <View style={[styles.progressBarBg, { backgroundColor: `${theme.color}20` }]}>
                            <Animated.View
                                style={[
                                    styles.progressBarFill,
                                    {
                                        backgroundColor: theme.color,
                                        width: progressAnim.interpolate({
                                            inputRange: [0, 100],
                                            outputRange: ['0%', '100%']
                                        })
                                    }
                                ]}
                            />
                        </View>
                        <View style={styles.progressStats}>
                            <Text style={[styles.statsText, { color: p.muted }]}>{Math.round(item.progress || 0)}%</Text>
                            <Text style={[styles.statsText, { color: p.muted }]}>{item.speed} • {item.total}</Text>
                        </View>
                    </View>
                )}
            </View>
        </Animated.View>
    );
};

export const Toast = () => {
    const { toasts, hideToast } = useToast();

    if (toasts.length === 0) return null;

    return (
        <View style={styles.container} pointerEvents="none">
            {toasts.map((toast) => (
                <ToastItem key={toast.id} item={toast} onHide={() => hideToast(toast.id)} />
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 80, // Above bottom nav
        left: 20,
        right: 20,
        gap: 10,
        zIndex: 9999,
    },
    toastContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4,
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    contentContainer: {
        flex: 1,
    },
    message: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
    },
    progressContainer: {
        marginTop: 4,
        gap: 2,
    },
    progressBarBg: {
        height: 4,
        borderRadius: 2,
        overflow: 'hidden',
        width: '100%',
    },
    progressBarFill: {
        height: '100%',
    },
    progressStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 2,
    },
    statsText: {
        fontSize: 10,
        fontWeight: '500',
    }
});
