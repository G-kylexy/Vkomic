export type NodeType = "category" | "genre" | "series" | "topic" | "file";

export interface VkNode {
  id: string;
  title: string;
  type: NodeType;
  children?: VkNode[];
  url?: string; // Lien VK ou lien de telechargement direct
  vkGroupId?: string; // Pour les appels API
  vkTopicId?: string; // Pour les appels API
  isLoaded?: boolean; // Si le contenu a deja ete fetch
  structureOnly?: boolean; // Charge via sync structure (sans docs)
  extension?: string; // PDF, CBR, CBZ, etc.
  sizeBytes?: number;
  count?: number; // Compat PC: compteur enfants
  path?: string; // Chemin local du fichier telecharge
}

export type VkConnectionStatus = {
  connected: boolean;
  latencyMs: number | null;
  lastSync: number | null;
  region: string | null;
  regionAggregate: string | null;
  errorCode?: number | null; // Code d'erreur VK (ex: 5 = token invalide)
};

export interface DownloadItem {
  id: string;
  title: string;
  url: string;
  progress: number;
  status: "pending" | "downloading" | "paused" | "completed" | "canceled" | "error";
  extension?: string;
  speed: string;
  createdAt: string;
  size?: string;
  path?: string; // Chemin local une fois termine
  subFolder?: string; // Sous-dossier optionnel
  resumeData?: string | null; // Mobile: reprise pause/resume
  totalBytes?: number;
}

