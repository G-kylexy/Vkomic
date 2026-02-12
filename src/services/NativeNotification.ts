import { NativeModules, Platform } from 'react-native';

const { DownloadNotificationModule } = NativeModules;

// Map pour convertir les IDs string en IDs numériques (requis par Android)
const idMap = new Map<string, number>();
let nextId = 1000;

const getNumericId = (id: string): number => {
    if (!idMap.has(id)) {
        idMap.set(id, nextId++);
    }
    return idMap.get(id)!;
};

/**
 * Démarre le Foreground Service pour garder l'app en vie pendant les téléchargements
 */
export const startForegroundService = () => {
    if (Platform.OS !== 'android' || !DownloadNotificationModule) return;
    DownloadNotificationModule.startForegroundService();
};

/**
 * Met à jour la notification du Foreground Service
 */
export const updateForegroundService = (count: number, title: string, progress: number, speed?: string) => {
    if (Platform.OS !== 'android' || !DownloadNotificationModule) return;
    DownloadNotificationModule.updateForegroundService(count, title, Math.round(progress), speed || '');
};

/**
 * Arrête le Foreground Service
 */
export const stopForegroundService = () => {
    if (Platform.OS !== 'android' || !DownloadNotificationModule) return;
    DownloadNotificationModule.stopForegroundService();
};

/**
 * Affiche une notification avec barre de progression native
 */
export const showProgressNotification = (id: string, title: string, progress: number, speed?: string) => {
    if (Platform.OS !== 'android' || !DownloadNotificationModule) return;

    const numericId = getNumericId(id);
    DownloadNotificationModule.showProgress(numericId, title, Math.round(progress), speed || '');
};

/**
 * Affiche une notification de téléchargement terminé
 */
export const showCompletedNotification = (id: string, title: string) => {
    if (Platform.OS !== 'android' || !DownloadNotificationModule) return;

    const numericId = getNumericId(id);
    DownloadNotificationModule.showCompleted(numericId, title);
    idMap.delete(id);
};

/**
 * Affiche une notification d'erreur de téléchargement
 */
export const showErrorNotification = (id: string, title: string) => {
    if (Platform.OS !== 'android' || !DownloadNotificationModule) return;

    const numericId = getNumericId(id);
    DownloadNotificationModule.showError(numericId, title);
    idMap.delete(id);
};

/**
 * Affiche une notification de téléchargement en pause
 */
export const showPausedNotification = (id: string, title: string, progress: number) => {
    if (Platform.OS !== 'android' || !DownloadNotificationModule) return;

    const numericId = getNumericId(id);
    DownloadNotificationModule.showPaused(numericId, title, Math.round(progress));
};

/**
 * Affiche une notification de téléchargement annulé
 */
export const showCancelledNotification = (id: string, title: string) => {
    if (Platform.OS !== 'android' || !DownloadNotificationModule) return;

    const numericId = getNumericId(id);
    DownloadNotificationModule.showCancelled(numericId, title);
    idMap.delete(id);
};

/**
 * Annule une notification
 */
export const cancelNotification = (id: string) => {
    if (Platform.OS !== 'android' || !DownloadNotificationModule) return;

    const numericId = idMap.get(id);
    if (numericId) {
        DownloadNotificationModule.cancel(numericId);
        idMap.delete(id);
    }
};
