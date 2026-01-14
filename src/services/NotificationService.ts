import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export const setupNotifications = async () => {
    try {
        if (!Device.isDevice) return false;
        if (!Notifications.getPermissionsAsync) return false;

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') return false;

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('downloads', {
                name: 'Downloads',
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });
        }

        return true;
    } catch {
        return false;
    }
};

export const notifyDownloadStarted = async (title: string) => {
    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Téléchargement lancé',
                body: title,
                data: { type: 'download' },
            },
            trigger: null,
        });
    } catch {
        // noop
    }
};

export const notifyDownloadCompleted = async (title: string) => {
    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Téléchargement terminé ✅',
                body: title,
                data: { type: 'download' },
            },
            trigger: null,
        });
    } catch {
        // noop
    }
};

export const notifyDownloadError = async (title: string) => {
    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Échec du téléchargement ❌',
                body: title,
                data: { type: 'error' },
            },
            trigger: null,
        });
    } catch {
        // noop
    }
};
