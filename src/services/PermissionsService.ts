import { Platform, Alert } from "react-native";
import * as Notifications from "expo-notifications";

/**
 * Request notification permissions (Android 13+)
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
    if (Platform.OS !== "android") {
        return true;
    }

    try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        if (existingStatus === "granted") {
            return true;
        }

        const { status } = await Notifications.requestPermissionsAsync();
        return status === "granted";
    } catch (error) {
        console.error("Error requesting notification permission:", error);
        return false;
    }
};

/**
 * Storage uses the app sandbox or the Storage Access Framework. Neither path
 * requires the deprecated broad READ/WRITE_EXTERNAL_STORAGE permissions.
 */
export const requestStoragePermission = async (): Promise<boolean> => {
    return true;
};

/**
 * Request all necessary permissions at app startup
 */
export const requestAllPermissions = async (): Promise<{
    notifications: boolean;
    storage: boolean;
}> => {
    const [notifications, storage] = await Promise.all([
        requestNotificationPermission(),
        requestStoragePermission(),
    ]);

    return { notifications, storage };
};

/**
 * Show alert if permission denied
 */
export const showPermissionDeniedAlert = (permissionType: "notifications" | "storage") => {
    const messages = {
        notifications: {
            title: "Notifications désactivées",
            message: "Activez les notifications dans les paramètres pour recevoir des alertes de téléchargement.",
        },
        storage: {
            title: "Accès stockage refusé",
            message: "L'accès au stockage est nécessaire pour télécharger des fichiers. Activez-le dans les paramètres.",
        },
    };

    const { title, message } = messages[permissionType];
    Alert.alert(title, message, [{ text: "OK" }]);
};

/**
 * Check if notifications are enabled
 */
export const areNotificationsEnabled = async (): Promise<boolean> => {
    if (Platform.OS !== "android") {
        return true;
    }

    try {
        const { status } = await Notifications.getPermissionsAsync();
        return status === "granted";
    } catch {
        return false;
    }
};
