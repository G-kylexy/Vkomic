import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Configuration de base pour les notifications Expo
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export const setupNotifications = async () => {
    if (Platform.OS === "android") {
        // Canal pour les notifications de progression (silencieux, basse priorité)
        await Notifications.setNotificationChannelAsync("download-progress", {
            name: "Progression téléchargements",
            importance: Notifications.AndroidImportance.LOW,
            sound: null,
            vibrationPattern: [],
            enableVibrate: false,
        });
        // Canal pour les notifications terminées
        await Notifications.setNotificationChannelAsync("download-channel", {
            name: "Téléchargements",
            importance: Notifications.AndroidImportance.DEFAULT,
        });
    }
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
};

// Map pour stocker les identifiants de notification par téléchargement
const activeNotifications = new Map<string, string>();

export const notifyDownloadStarted = async (id: string, title: string) => {
    if (Platform.OS !== "android") return;

    const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
            title: `⬇️ ${title}`,
            body: "Démarrage...",
            data: { downloadId: id },
            sticky: true,
            autoDismiss: false,
        },
        trigger: null,
    });
    activeNotifications.set(id, notificationId);
};

export const notifyDownloadProgress = async (id: string, title: string, progress: number, speed?: string) => {
    if (Platform.OS !== "android") return;

    const existingId = activeNotifications.get(id);

    // Annuler l'ancienne notification si elle existe
    if (existingId) {
        try {
            await Notifications.dismissNotificationAsync(existingId);
        } catch { }
    }

    const speedText = speed ? ` • ${speed}` : "";

    const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
            title: `⬇️ ${title}`,
            body: `${progress}%${speedText}`,
            data: { downloadId: id },
            sticky: true,
            autoDismiss: false,
        },
        trigger: null,
    });
    activeNotifications.set(id, notificationId);
};

export const notifyDownloadCompleted = async (id: string, title: string) => {
    // Annuler la notification de progression
    const existingId = activeNotifications.get(id);
    if (existingId) {
        try {
            await Notifications.dismissNotificationAsync(existingId);
        } catch { }
        activeNotifications.delete(id);
    }

    await Notifications.scheduleNotificationAsync({
        content: {
            title: "✅ Téléchargement terminé",
            body: title,
        },
        trigger: null,
    });
};

export const notifyDownloadError = async (id: string, title: string) => {
    // Annuler la notification de progression
    const existingId = activeNotifications.get(id);
    if (existingId) {
        try {
            await Notifications.dismissNotificationAsync(existingId);
        } catch { }
        activeNotifications.delete(id);
    }

    await Notifications.scheduleNotificationAsync({
        content: {
            title: "❌ Échec du téléchargement",
            body: title,
        },
        trigger: null,
    });
};

export const cancelDownloadNotification = async (id: string) => {
    const existingId = activeNotifications.get(id);
    if (existingId) {
        try {
            await Notifications.dismissNotificationAsync(existingId);
        } catch { }
        activeNotifications.delete(id);
    }
};

export const cancelAllDownloadNotifications = async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    activeNotifications.clear();
};

// Génère une barre de progression avec carrés verts
const generateProgressBar = (progress: number): string => {
    const total = 10;
    const filled = Math.round(progress / 10);
    const empty = total - filled;
    // Carrés verts et gris pour simuler une barre colorée
    return "🟩".repeat(filled) + "⬜".repeat(empty);
};
