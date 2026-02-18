import { NativeModules, Platform, PixelRatio } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

const { PdfPageExtractor } = NativeModules;

export interface PdfDocumentInfo {
    pageCount: number;
    docId: string;
}

export interface PageCacheEntry {
    uri: string;
    pageNum: number;
    timestamp: number;
    isThumbnail: boolean;
}

class PdfCacheService {
    private ramCache: Map<number, PageCacheEntry> = new Map();
    private thumbnailCache: Map<number, string> = new Map();
    private maxRamPages = 10;
    private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
    private currentDocId: string | null = null;
    private totalPages: number = 0;
    private isDocumentOpen: boolean = false;
    private pendingExtractions: Map<string, Promise<string>> = new Map();
    private renderWidth: number = 1080;

    calculateRenderWidth(screenWidth: number): number {
        const pixelRatio = PixelRatio.get();
        this.renderWidth = Math.floor(screenWidth * pixelRatio * 2.5);
        return this.renderWidth;
    }

    // Calcul d'une largeur minuscule pour l'affichage instantané
    calculateThumbnailWidth(screenWidth: number): number {
        return Math.floor(screenWidth * 0.3);
    }

    async openDocument(uri: string): Promise<PdfDocumentInfo> {
        if (Platform.OS !== "android") throw new Error("Android only");
        await this.closeDocument();
        const info = await PdfPageExtractor.openDocument(uri);
        this.currentDocId = info.docId;
        this.totalPages = info.pageCount;
        this.isDocumentOpen = true;
        this.cancelCleanup();
        return info;
    }

    /**
     * Extraction Intelligente :
     * Tente de retourner la version HD, ou lance une extraction rapide.
     */
    async smartExtract(pageNum: number, screenWidth: number, priority: 'thumb' | 'hd' = 'hd'): Promise<string> {
        if (!this.isDocumentOpen) throw new Error("No doc");

        const cacheKey = `${pageNum}_${priority}`;

        // 1. Retourner le cache immédiatement si dispo
        if (priority === 'hd' && this.ramCache.has(pageNum)) return this.ramCache.get(pageNum)!.uri;
        if (priority === 'thumb' && this.thumbnailCache.has(pageNum)) return this.thumbnailCache.get(pageNum)!;

        // 2. Éviter les extractions en doublon
        if (this.pendingExtractions.has(cacheKey)) return this.pendingExtractions.get(cacheKey)!;

        const width = priority === 'hd'
            ? this.calculateRenderWidth(screenWidth)
            : this.calculateThumbnailWidth(screenWidth);

        const extractionPromise = (async () => {
            try {
                // Utilisation du bridge natif WebP
                const uri = await PdfPageExtractor.extractPage(pageNum, width);

                if (priority === 'hd') {
                    this.ramCache.set(pageNum, { uri, pageNum, timestamp: Date.now(), isThumbnail: false });
                    this.evictOldPages(pageNum);
                } else {
                    this.thumbnailCache.set(pageNum, uri);
                }
                return uri;
            } finally {
                this.pendingExtractions.delete(cacheKey);
            }
        })();

        this.pendingExtractions.set(cacheKey, extractionPromise);
        return extractionPromise;
    }

    getCachedPageUri(pageNum: number): string | null {
        return this.ramCache.get(pageNum)?.uri || this.thumbnailCache.get(pageNum) || null;
    }

    async prefetchPages(currentPage: number, screenWidth: number): Promise<void> {
        if (!this.isDocumentOpen) return;

        // Stratégie prédictive : n+1 HD, n+2 HD, n+3 Thumbnail
        const tasks = [
            { p: currentPage + 1, type: 'hd' as const },
            { p: currentPage + 2, type: 'hd' as const },
            { p: currentPage + 3, type: 'thumb' as const },
            { p: currentPage - 1, type: 'thumb' as const },
        ];

        for (const task of tasks) {
            if (task.p >= 0 && task.p < this.totalPages) {
                this.smartExtract(task.p, screenWidth, task.type).catch(() => { });
            }
        }
    }

    private evictOldPages(keepAroundPage: number): void {
        if (this.ramCache.size <= this.maxRamPages) return;
        const pagesToKeep = new Set([keepAroundPage - 1, keepAroundPage, keepAroundPage + 1]);
        const entries = Array.from(this.ramCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
        for (const [pageNum] of entries) {
            if (this.ramCache.size <= this.maxRamPages) break;
            if (pagesToKeep.has(pageNum)) continue;
            this.ramCache.delete(pageNum);
        }
    }

    scheduleCleanup(delayMs: number = 300000): void {
        this.cancelCleanup();
        this.cleanupTimer = setTimeout(async () => await this.clearAll(), delayMs);
    }

    cancelCleanup(): void {
        if (this.cleanupTimer) { clearTimeout(this.cleanupTimer); this.cleanupTimer = null; }
    }

    async closeDocument(): Promise<void> {
        this.cancelCleanup();
        if (this.isDocumentOpen && PdfPageExtractor) {
            try { await PdfPageExtractor.closeDocument(); } catch (e) { }
        }
        this.ramCache.clear();
        this.thumbnailCache.clear();
        this.pendingExtractions.clear();
        this.isDocumentOpen = false;
        this.currentDocId = null;
        this.totalPages = 0;
    }

    async clearAll(): Promise<void> {
        await this.closeDocument();
        if (PdfPageExtractor) {
            try { await PdfPageExtractor.clearCache(); } catch (e) { }
        }
    }
}

export const pdfCacheService = new PdfCacheService();
