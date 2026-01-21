import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { NativeDownloadModule } = NativeModules;

interface DownloadProgressEvent {
    id: string;
    receivedBytes: number;
    totalBytes: number;
    progress: number;
    speed: number;
}

interface DownloadCompleteEvent {
    id: string;
    receivedBytes: number;
    totalBytes: number;
    progress: number;
    path?: string;
}

interface DownloadErrorEvent {
    id: string;
    error: string;
}

type ProgressCallback = (event: DownloadProgressEvent) => void;
type CompleteCallback = (event: DownloadCompleteEvent) => void;
type ErrorCallback = (event: DownloadErrorEvent) => void;

class NativeDownloadService {
    private emitter: NativeEventEmitter | null = null;
    private progressListeners = new Map<string, ProgressCallback>();
    private completeListeners = new Map<string, CompleteCallback>();
    private errorListeners = new Map<string, ErrorCallback>();
    private subscriptions: { remove: () => void }[] = [];

    constructor() {
        if (Platform.OS === 'android' && NativeDownloadModule) {
            this.emitter = new NativeEventEmitter(NativeDownloadModule);
            this.setupListeners();
        }
    }

    private setupListeners() {
        if (!this.emitter) return;

        // Progress events
        const progressSub = this.emitter.addListener('NativeDownloadProgress', (event: DownloadProgressEvent) => {
            const callback = this.progressListeners.get(event.id);
            if (callback) {
                callback(event);
            }
        });
        this.subscriptions.push(progressSub);

        // Complete events
        const completeSub = this.emitter.addListener('NativeDownloadComplete', (event: DownloadCompleteEvent) => {
            const callback = this.completeListeners.get(event.id);
            if (callback) {
                callback(event);
            }
            // Cleanup listeners
            this.progressListeners.delete(event.id);
            this.completeListeners.delete(event.id);
            this.errorListeners.delete(event.id);
        });
        this.subscriptions.push(completeSub);

        // Error events
        const errorSub = this.emitter.addListener('NativeDownloadError', (event: DownloadErrorEvent) => {
            const callback = this.errorListeners.get(event.id);
            if (callback) {
                callback(event);
            }
            // Cleanup listeners
            this.progressListeners.delete(event.id);
            this.completeListeners.delete(event.id);
            this.errorListeners.delete(event.id);
        });
        this.subscriptions.push(errorSub);
    }

    /**
     * Démarre un téléchargement avec support de reprise automatique
     */
    async startDownload(
        id: string,
        url: string,
        filePath: string,
        callbacks: {
            onProgress?: ProgressCallback;
            onComplete?: CompleteCallback;
            onError?: ErrorCallback;
        }
    ): Promise<boolean> {
        if (Platform.OS !== 'android' || !NativeDownloadModule) {
            console.warn('NativeDownload: Module not available');
            return false;
        }

        // Register callbacks
        if (callbacks.onProgress) {
            this.progressListeners.set(id, callbacks.onProgress);
        }
        if (callbacks.onComplete) {
            this.completeListeners.set(id, callbacks.onComplete);
        }
        if (callbacks.onError) {
            this.errorListeners.set(id, callbacks.onError);
        }

        try {
            return await NativeDownloadModule.startDownload(id, url, filePath);
        } catch (e) {
            console.error('NativeDownload: startDownload error', e);
            // Cleanup on error
            this.progressListeners.delete(id);
            this.completeListeners.delete(id);
            this.errorListeners.delete(id);
            throw e;
        }
    }

    /**
     * Met en pause un téléchargement (le fichier partiel est conservé)
     */
    async pauseDownload(id: string): Promise<boolean> {
        if (Platform.OS !== 'android' || !NativeDownloadModule) {
            return false;
        }

        // Remove callbacks
        this.progressListeners.delete(id);
        this.completeListeners.delete(id);
        this.errorListeners.delete(id);

        try {
            return await NativeDownloadModule.pauseDownload(id);
        } catch (e) {
            console.error('NativeDownload: pauseDownload error', e);
            return false;
        }
    }

    /**
     * Annule un téléchargement
     * @param deleteFile Si true, supprime le fichier partiel
     */
    async cancelDownload(id: string, deleteFile: boolean = true): Promise<boolean> {
        if (Platform.OS !== 'android' || !NativeDownloadModule) {
            return false;
        }

        // Remove callbacks
        this.progressListeners.delete(id);
        this.completeListeners.delete(id);
        this.errorListeners.delete(id);

        try {
            return await NativeDownloadModule.cancelDownload(id, deleteFile);
        } catch (e) {
            console.error('NativeDownload: cancelDownload error', e);
            return false;
        }
    }

    /**
     * Vérifie si un fichier partiel existe et retourne sa taille
     */
    async getPartialFileSize(filePath: string): Promise<number> {
        if (Platform.OS !== 'android' || !NativeDownloadModule) {
            return 0;
        }

        try {
            return await NativeDownloadModule.getPartialFileSize(filePath);
        } catch (e) {
            return 0;
        }
    }

    /**
     * Vérifie si un téléchargement est actif
     */
    async isDownloading(id: string): Promise<boolean> {
        if (Platform.OS !== 'android' || !NativeDownloadModule) {
            return false;
        }

        try {
            return await NativeDownloadModule.isDownloading(id);
        } catch (e) {
            return false;
        }
    }

    /**
     * Disponibilité du module
     */
    isAvailable(): boolean {
        return Platform.OS === 'android' && !!NativeDownloadModule;
    }

    /**
     * Finalise le téléchargement (copie rapide vers SAF)
     */
    async finalizeDownload(tempPath: string, folderUri: string, fileName: string, mimeType: string): Promise<string | null> {
        if (!this.isAvailable() || !NativeDownloadModule.finalizeDownload) {
            throw new Error("Native optimization not available");
        }
        return await NativeDownloadModule.finalizeDownload(tempPath, folderUri, fileName, mimeType);
    }

    /**
     * Cleanup all subscriptions
     */
    destroy() {
        this.subscriptions.forEach(sub => sub.remove());
        this.subscriptions = [];
        this.progressListeners.clear();
        this.completeListeners.clear();
        this.errorListeners.clear();
    }
}

// Singleton instance
export const nativeDownload = new NativeDownloadService();

// Helper function to format bytes
export const formatBytes = (bytes: number, decimals = 2): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};
