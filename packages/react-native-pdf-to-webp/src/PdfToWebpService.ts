import { Platform, PixelRatio } from 'react-native';
import ReactNativePdfToWebpModule from './ReactNativePdfToWebpModule';
import { PdfDocumentInfo } from './ReactNativePdfToWebp.types';

class PdfToWebpService {
    private cache: Map<number, string> = new Map();
    private maxCachedPages = 5;
    private currentDocId: string | null = null;
    private totalPages: number = 0;
    private isDocumentOpen: boolean = false;

    private currentVisiblePage: number = 0;
    private pendingTasks: Array<{
        pageNum: number;
        width: number;
        resolve: (uri: string) => void;
        reject: (err: any) => void;
    }> = [];
    private isProcessing: boolean = false;

    private defaultRenderWidth: number = 1080;

    /**
     * Calcule la largeur de rendu idéale en fonction de la largeur de l'écran.
     * Utilise un multiplicateur pour le supersampling (upscale).
     */
    calculateRenderWidth(screenWidth: number, multiplier: number = 2.0): number {
        const pixelRatio = PixelRatio.get();
        return Math.floor(screenWidth * pixelRatio * multiplier);
    }

    /**
     * Ouvre un document PDF.
     */
    async openDocument(uri: string): Promise<PdfDocumentInfo> {
        if (Platform.OS !== 'android') {
            throw new Error('react-native-pdf-to-webp is currently Android only.');
        }

        await this.closeDocument();
        const info = await ReactNativePdfToWebpModule.openDocument(uri);
        this.currentDocId = info.docId;
        this.totalPages = info.pageCount;
        this.isDocumentOpen = true;
        return info;
    }

    /**
     * Met à jour la page actuellement visible (utilisé pour la priorité du cache).
     */
    updateVisiblePage(pageNum: number) {
        this.currentVisiblePage = pageNum;
    }

    /**
     * Extrait une page en WebP. Retourne immédiatement si déjà en cache.
     */
    async extractPage(pageNum: number, width: number = this.defaultRenderWidth): Promise<string> {
        if (!this.isDocumentOpen) throw new Error('No document open');

        const cached = this.cache.get(pageNum);
        if (cached) return cached;

        return new Promise((resolve, reject) => {
            const existing = this.pendingTasks.find((t) => t.pageNum === pageNum);
            if (existing) {
                const oldResolve = existing.resolve;
                existing.resolve = (uri) => {
                    oldResolve(uri);
                    resolve(uri);
                };
                return;
            }

            this.pendingTasks.push({ pageNum, width, resolve, reject });
            this.processQueue();
        });
    }

    private async processQueue() {
        if (this.isProcessing || this.pendingTasks.length === 0) return;
        this.isProcessing = true;

        while (this.pendingTasks.length > 0) {
            // Tri par distance à la page visible pour privilégier ce que l'utilisateur regarde
            this.pendingTasks.sort((a, b) => {
                return (
                    Math.abs(a.pageNum - this.currentVisiblePage) - Math.abs(b.pageNum - this.currentVisiblePage)
                );
            });

            const task = this.pendingTasks.shift()!;

            const cached = this.cache.get(task.pageNum);
            if (cached) {
                task.resolve(cached);
                continue;
            }

            if (!this.isDocumentOpen) {
                task.reject(new Error('Document closed'));
                continue;
            }

            try {
                const uri = await ReactNativePdfToWebpModule.extractPage(task.pageNum, task.width);
                // Ajout d'un timestamp pour forcer le rafraîchissement si nécessaire
                const finalUri = `file://${uri}?w=${task.width}&t=${Date.now()}`;

                this.cache.set(task.pageNum, finalUri);
                this.evictOldPages();
                task.resolve(finalUri);
            } catch (error) {
                task.reject(error);
            }
        }

        this.isProcessing = false;
    }

    private evictOldPages() {
        if (this.cache.size <= this.maxCachedPages) return;

        const entries = Array.from(this.cache.entries());
        entries.sort((a, b) => {
            return (
                Math.abs(b[0] - this.currentVisiblePage) - Math.abs(a[0] - this.currentVisiblePage)
            );
        });

        while (this.cache.size > this.maxCachedPages) {
            const entry = entries.shift();
            if (!entry) break;
            this.cache.delete(entry[0]);
        }
    }

    /**
     * Extrait une région spécifique d'une page.
     */
    async extractPageRegion(
        pageNum: number,
        cropX: number,
        cropY: number,
        cropW: number,
        cropH: number,
        outputWidth: number,
        outputHeight: number
    ): Promise<string> {
        if (!this.isDocumentOpen) throw new Error('No document open');
        const uri = await ReactNativePdfToWebpModule.extractPageRegion(
            pageNum,
            cropX,
            cropY,
            cropW,
            cropH,
            outputWidth,
            outputHeight
        );
        return `file://${uri}?t=${Date.now()}`;
    }

    /**
     * Ferme le document et nettoie le cache mémoire.
     */
    async closeDocument() {
        if (this.isDocumentOpen) {
            await ReactNativePdfToWebpModule.closeDocument();
        }
        this.isDocumentOpen = false;
        this.currentDocId = null;
        this.cache.clear();
        this.pendingTasks = [];
        this.isProcessing = false;
    }

    /**
     * Nettoie le cache disque (fichiers WebP temporaires).
     */
    async clearDiskCache(): Promise<boolean> {
        return await ReactNativePdfToWebpModule.clearCache();
    }

    /**
     * Retourne la taille du cache disque en octets.
     */
    async getDiskCacheSize(): Promise<number> {
        return await ReactNativePdfToWebpModule.getCacheSize();
    }
}

export const PdfToWebp = new PdfToWebpService();
