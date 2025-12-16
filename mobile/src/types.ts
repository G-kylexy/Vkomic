export interface VkNode {
    id: string;
    title: string;
    type: 'category' | 'series' | 'volume' | 'chapter' | 'file' | 'genre';
    children?: VkNode[];
    url?: string; // URL web VK ou lien de téléchargement direct
    vkGroupId?: string; // Pour les appels API
    vkTopicId?: string; // Pour les appels API
    isLoaded?: boolean; // Si le contenu a déjà été fetché
    extension?: string; // PDF, CBR, CBZ, etc.
    sizeBytes?: number;
    structureOnly?: boolean; // Si true, on a fetché les sous-titres mais pas les fichiers pour aller vite
    path?: string; // Chemin local du fichier téléchargé
}

export type VkConnectionStatus = {
    connected: boolean;
    latencyMs: number | null;
    lastSync: number | null;
    region: string | null;
    regionAggregate: string | null;
};

export interface DownloadItem {
    id: string;
    title: string;
    url: string;
    progress: number;
    status: 'pending' | 'downloading' | 'paused' | 'completed' | 'canceled' | 'error';
    extension?: string;
    speed: string;
    createdAt: string;
    size?: string;
    path?: string; // Chemin local une fois terminé
    subFolder?: string; // Sous-dossier optionnel
}
