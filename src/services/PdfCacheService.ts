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

interface PendingTask {
    pageNum: number;
    width: number;
    priority: 'thumb' | 'hd';
    resolve: (uri: string) => void;
    reject: (err: any) => void;
}

class PdfCacheService {
    private ramCache: Map<number, PageCacheEntry> = new Map();
    private thumbnailCache: Map<number, string> = new Map();
    private maxRamPages = 15; // Un peu plus large pour éviter les rechargements fréquents
    private currentDocId: string | null = null;
    private totalPages: number = 0;
    private isDocumentOpen: boolean = false;

    private currentVisiblePage: number = 0;
    private pendingTasks: PendingTask[] = [];
    private activeExtractions: number = 0;
    private readonly MAX_CONCURRENT_EXTRACTIONS = 2; // Limite stricte pour la fluidité

    private renderWidth: number = 1080;

    calculateRenderWidth(screenWidth: number): number {
        const pixelRatio = PixelRatio.get();
        // Qualité maximale : x3 pour des traits ultra-nets même au zoom maximal
        this.renderWidth = Math.floor(screenWidth * pixelRatio * 3.0);
        return this.renderWidth;
    }

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

        // On ne nettoie plus brutalement à l'ouverture, on lance le pruning intelligent
        this.pruneCacheIfNeeded(800);
        return info;
    }

    /**
     * Informe le service de la page actuellement affichée pour prioriser les chargements
     */
    updateVisiblePage(pageNum: number) {
        this.currentVisiblePage = pageNum;

        // CLEANUP STALE TASKS: Supprimer les tâches en attente qui sont trop loin de la vue actuelle
        const initialSize = this.pendingTasks.length;
        this.pendingTasks = this.pendingTasks.filter(task => {
            const distance = Math.abs(task.pageNum - this.currentVisiblePage);
            // On annule les requêtes HD à > 3 pages d'écart, et les vignettes à > 10 pages d'écart
            const maxDistance = task.priority === 'hd' ? 3 : 10;
            if (distance > maxDistance) {
                task.reject(new Error("Canceled: Page out of render window"));
                return false;
            }
            return true;
        });

        // if (this.pendingTasks.length < initialSize) {
        //     console.log(`Aborted ${initialSize - this.pendingTasks.length} stale tasks`);
        // }
    }

    async smartExtract(pageNum: number, screenWidth: number, priority: 'thumb' | 'hd' = 'hd'): Promise<string> {
        if (!this.isDocumentOpen) throw new Error("No doc");

        // 1. Retour rapide si déjà en cache
        if (priority === 'hd' && this.ramCache.has(pageNum)) return this.ramCache.get(pageNum)!.uri;
        if (priority === 'thumb' && this.thumbnailCache.has(pageNum)) return this.thumbnailCache.get(pageNum)!;
        if (priority === 'thumb' && this.ramCache.has(pageNum)) return this.ramCache.get(pageNum)!.uri; // Full HD suffices for thumb

        const width = priority === 'hd'
            ? this.calculateRenderWidth(screenWidth)
            : this.calculateThumbnailWidth(screenWidth);

        // 2. Ajouter à la liste des tâches
        return new Promise((resolve, reject) => {
            // Éviter les doublons exacts dans la queue
            const existing = this.pendingTasks.find(t => t.pageNum === pageNum && t.priority === priority);
            if (existing) {
                const oldResolve = existing.resolve;
                const oldReject = existing.reject;
                existing.resolve = (uri) => { oldResolve(uri); resolve(uri); };
                existing.reject = (err) => { oldReject(err); reject(err); };
                return;
            }

            this.pendingTasks.push({ pageNum, width, priority, resolve, reject });
            this.processQueue();
        });
    }

    private async processQueue() {
        if (this.activeExtractions >= this.MAX_CONCURRENT_EXTRACTIONS || this.pendingTasks.length === 0) {
            return;
        }

        // TRI DE LA QUEUE : On prend la tâche la plus "urgente"
        // Urgence = distance minimale par rapport à la page visible actuelle
        this.pendingTasks.sort((a, b) => {
            const distA = Math.abs(a.pageNum - this.currentVisiblePage);
            const distB = Math.abs(b.pageNum - this.currentVisiblePage);

            if (distA === distB) {
                return a.priority === 'thumb' ? -1 : 1;
            }
            return distA - distB;
        });

        const task = this.pendingTasks.shift();
        if (!task) return;

        this.activeExtractions++;

        try {
            // Vérification cache de dernière seconde
            if (task.priority === 'hd' && this.ramCache.has(task.pageNum)) {
                task.resolve(this.ramCache.get(task.pageNum)!.uri);
            } else if (task.priority === 'thumb' && this.thumbnailCache.has(task.pageNum)) {
                task.resolve(this.thumbnailCache.get(task.pageNum)!);
            } else {
                const uri = await PdfPageExtractor.extractPage(task.pageNum, task.width);
                const cacheBuster = task.priority === 'hd' ? `&t=${Date.now()}` : '';
                const finalUri = `${uri}?type=${task.priority}&w=${task.width}${cacheBuster}`;

                if (task.priority === 'hd') {
                    this.ramCache.set(task.pageNum, { uri: finalUri, pageNum: task.pageNum, timestamp: Date.now(), isThumbnail: false });
                    this.evictOldPages(this.currentVisiblePage);
                } else {
                    this.thumbnailCache.set(task.pageNum, finalUri);
                }
                task.resolve(finalUri);
            }
        } catch (error) {
            console.warn(`PdfCacheService: Priority extraction failed for page ${task.pageNum}`, error);
            task.reject(error);
        } finally {
            this.activeExtractions--;
            // Lancer la suite si possible
            this.processQueue();
        }

        // Relancer processQueue si on n'a pas atteint la limite
        if (this.activeExtractions < this.MAX_CONCURRENT_EXTRACTIONS && this.pendingTasks.length > 0) {
            this.processQueue();
        }
    }

    getCachedPageUri(pageNum: number): string | null {
        return this.ramCache.get(pageNum)?.uri || this.thumbnailCache.get(pageNum) || null;
    }

    getHdUri(pageNum: number): string | null {
        const entry = this.ramCache.get(pageNum);
        return (entry && !entry.isThumbnail) ? entry.uri : null;
    }

    evictOldPages(latestPageNum: number) {
        if (this.ramCache.size <= this.maxRamPages) return;

        const entries = Array.from(this.ramCache.entries());
        entries.sort((a, b) => {
            const distA = Math.abs(a[0] - latestPageNum);
            const distB = Math.abs(b[0] - latestPageNum);
            return distB - distA; // Descending dist
        });

        while (this.ramCache.size > this.maxRamPages) {
            const entryToRemove = entries.shift();
            if (!entryToRemove) break;
            this.ramCache.delete(entryToRemove[0]);
        }
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
        this.ramCache.clear();
        this.thumbnailCache.clear();

        // Abort all pending tasks
        this.pendingTasks.forEach(t => t.reject(new Error("Document closed")));
        this.pendingTasks = [];
        this.activeExtractions = 0;

        // On ne planifie plus un delete total. On lance un nettoyage intelligent.
        this.pruneCacheIfNeeded(800);
    }

    // --- GESTION DU CACHE INTELLIGENT (LRU) ---

    /**
     * Nettoie le dossier de cache si sa taille dépasse maxUsageMb
     * Supprime les fichiers les plus anciens en premier.
     */
    async pruneCacheIfNeeded(maxUsageMb: number = 800) {
        try {
            const cacheDir = `${FileSystem.cacheDirectory}pdf_cache/`; // ou pdf_pages_cache
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
                    fileInfos.push({
                        path: filePath,
                        size: info.size,
                        modificationTime: info.modificationTime
                    });
                }
            }

            const maxSizeBytes = maxUsageMb * 1024 * 1024;
            if (totalSize <= maxSizeBytes) return; // Cache dans les limites

            // Trier par date de modification (les plus vieux en premier)
            fileInfos.sort((a, b) => a.modificationTime - b.modificationTime);

            let freedSize = 0;
            const targetFreeSize = totalSize - (maxSizeBytes * 0.8);

            for (const fileInfo of fileInfos) {
                if (freedSize >= targetFreeSize) break;

                // Ne pas supprimer un fichier du document actuellement ouvert
                if (this.currentDocId && fileInfo.path.includes(this.currentDocId)) continue;

                await FileSystem.deleteAsync(fileInfo.path, { idempotent: true });
                freedSize += fileInfo.size;
            }

            console.log(`Cache pruned: Freed ${(freedSize / 1024 / 1024).toFixed(2)} MB`);

        } catch (e) {
            console.warn("Smart cache pruning failed", e);
        }
    }

    async prefetchPages(centerPage: number, screenWidth: number) {
        if (!this.isDocumentOpen) return;

        // 1. La page suivante (Priorité HD)
        const nextPage = centerPage + 1;
        if (nextPage < this.totalPages) {
            this.smartExtract(nextPage, screenWidth, 'thumb').catch(() => { });
            this.smartExtract(nextPage, screenWidth, 'hd').catch(() => { });
        }

        // 2. La page d'après (Vignette seulement)
        const nextNextPage = centerPage + 2;
        if (nextNextPage < this.totalPages) {
            this.smartExtract(nextNextPage, screenWidth, 'thumb').catch(() => { });
        }

        // 3. La page précédente (Vignette pour retour rapide)
        const prevPage = centerPage - 1;
        if (prevPage >= 0) {
            this.smartExtract(prevPage, screenWidth, 'thumb').catch(() => { });
        }
    }

    /**
     * Préchargement asynchrone progressif :
     * Limité aux N pages suivantes pour éviter l'engorgement CPU.
     */
    async preloadNeighbors(centerPage: number, screenWidth: number, countHD = 2, countThumb = 4) {
        if (!this.isDocumentOpen) return;

        // On lance d'abord les vignettes (très rapides) pour N pages
        for (let i = 1; i <= countThumb; i++) {
            if (centerPage + i < this.totalPages) {
                this.smartExtract(centerPage + i, screenWidth, 'thumb').catch(() => { });
            }
            if (centerPage - i >= 0) {
                this.smartExtract(centerPage - i, screenWidth, 'thumb').catch(() => { });
            }
        }

        // Puis les HD pour seulement les 2 prochaines pages
        for (let i = 1; i <= countHD; i++) {
            if (centerPage + i < this.totalPages) {
                this.smartExtract(centerPage + i, screenWidth, 'hd').catch(() => { });
            }
        }
    }
}

export const pdfCacheService = new PdfCacheService();

