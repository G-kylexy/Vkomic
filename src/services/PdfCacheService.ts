import { NativeModules, Platform, PixelRatio } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

const { PdfPageExtractor } = NativeModules;

export interface PdfDocumentInfo {
    pageCount: number;
    docId: string;
}

class PdfCacheService {
    private cache: Map<number, string> = new Map();
    private maxCachedPages = 15;
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

    private renderWidth: number = 1080;

    calculateRenderWidth(screenWidth: number): number {
        const pixelRatio = PixelRatio.get();
        // Qualité maximale : x3 pour des traits ultra-nets même au zoom maximal
        this.renderWidth = Math.floor(screenWidth * pixelRatio * 3.0);
        return this.renderWidth;
    }

    async openDocument(uri: string): Promise<PdfDocumentInfo> {
        if (Platform.OS !== "android") throw new Error("Android only");

        await this.closeDocument();
        const info = await PdfPageExtractor.openDocument(uri);
        this.currentDocId = info.docId;
        this.totalPages = info.pageCount;
        this.isDocumentOpen = true;
        this.pruneCacheIfNeeded(800);
        return info;
    }

    updateVisiblePage(pageNum: number) {
        this.currentVisiblePage = pageNum;
    }

    /**
     * Extrait une page en HD. Retour immédiat si déjà en cache.
     */
    async extractPage(pageNum: number, screenWidth: number): Promise<string> {
        if (!this.isDocumentOpen) throw new Error("No document open");

        // Retour immédiat si en cache
        const cached = this.cache.get(pageNum);
        if (cached) return cached;

        const width = this.calculateRenderWidth(screenWidth);

        return new Promise((resolve, reject) => {
            // Éviter les doublons
            const existing = this.pendingTasks.find(t => t.pageNum === pageNum);
            if (existing) {
                const oldResolve = existing.resolve;
                existing.resolve = (uri) => { oldResolve(uri); resolve(uri); };
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
            // Tri par distance à la page visible
            this.pendingTasks.sort((a, b) => {
                return Math.abs(a.pageNum - this.currentVisiblePage) - Math.abs(b.pageNum - this.currentVisiblePage);
            });

            const task = this.pendingTasks.shift()!;

            // Vérification cache de dernière seconde
            const cached = this.cache.get(task.pageNum);
            if (cached) {
                task.resolve(cached);
                continue;
            }

            if (!this.isDocumentOpen) {
                task.reject(new Error("Document closed"));
                continue;
            }

            try {
                const uri = await PdfPageExtractor.extractPage(task.pageNum, task.width);
                const finalUri = `${uri}?w=${task.width}&t=${Date.now()}`;

                this.cache.set(task.pageNum, finalUri);
                this.evictOldPages();
                task.resolve(finalUri);
            } catch (error) {
                console.warn(`PdfCacheService: extraction failed page ${task.pageNum}`, error);
                task.reject(error);
            }
        }

        this.isProcessing = false;
    }

    private evictOldPages() {
        if (this.cache.size <= this.maxCachedPages) return;

        const entries = Array.from(this.cache.entries());
        entries.sort((a, b) => {
            return Math.abs(b[0] - this.currentVisiblePage) - Math.abs(a[0] - this.currentVisiblePage);
        });

        while (this.cache.size > this.maxCachedPages) {
            const entry = entries.shift();
            if (!entry) break;
            this.cache.delete(entry[0]);
        }
    }

    /**
     * Pré-charge les pages voisines en HD silencieusement.
     */
    prefetchAround(centerPage: number, screenWidth: number, count = 3) {
        if (!this.isDocumentOpen) return;
        for (let i = 1; i <= count; i++) {
            if (centerPage + i < this.totalPages) {
                this.extractPage(centerPage + i, screenWidth).catch(() => { });
            }
            if (centerPage - i >= 0) {
                this.extractPage(centerPage - i, screenWidth).catch(() => { });
            }
        }
    }

    getCachedUri(pageNum: number): string | null {
        return this.cache.get(pageNum) || null;
    }

    async closeDocument() {
        if (this.isDocumentOpen) {
            try {
                await PdfPageExtractor.closeDocument();
            } catch (e) {
                console.error("Error closing doc", e);
            }
        }
        this.isDocumentOpen = false;
        this.currentDocId = null;
        this.cache.clear();
        this.pendingTasks = [];
        this.isProcessing = false;
        this.pruneCacheIfNeeded(800);
    }

    async pruneCacheIfNeeded(maxUsageMb: number = 800) {
        try {
            const cacheDir = `${FileSystem.cacheDirectory}pdf_pages_cache/`;
            const dirInfo = await FileSystem.getInfoAsync(cacheDir);
            if (!dirInfo.exists) return;

            const files = await FileSystem.readDirectoryAsync(cacheDir);
            if (files.length === 0) return;

            let totalSize = 0;
            const fileInfos: { path: string; size: number; modificationTime: number }[] = [];

            for (const file of files) {
                const filePath = `${cacheDir}${file}`;
                const info = await FileSystem.getInfoAsync(filePath);
                if (info.exists && !info.isDirectory) {
                    totalSize += info.size;
                    fileInfos.push({ path: filePath, size: info.size, modificationTime: info.modificationTime });
                }
            }

            const maxSizeBytes = maxUsageMb * 1024 * 1024;
            if (totalSize <= maxSizeBytes) return;

            fileInfos.sort((a, b) => a.modificationTime - b.modificationTime);

            let freedSize = 0;
            const targetFreeSize = totalSize - (maxSizeBytes * 0.8);

            for (const fileInfo of fileInfos) {
                if (freedSize >= targetFreeSize) break;
                if (this.currentDocId && fileInfo.path.includes(this.currentDocId)) continue;
                await FileSystem.deleteAsync(fileInfo.path, { idempotent: true });
                freedSize += fileInfo.size;
            }

            console.log(`Cache pruned: Freed ${(freedSize / 1024 / 1024).toFixed(1)} MB`);
        } catch (e) {
            console.warn("Cache pruning failed", e);
        }
    }
}

export const pdfCacheService = new PdfCacheService();
