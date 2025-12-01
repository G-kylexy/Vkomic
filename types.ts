
import { LucideIcon } from 'lucide-react';

// Structure pour les boutons de navigation (Sidebar)
export interface NavItem {
  label: string;
  icon: LucideIcon;
  id: string;
}

// (Non utilisé actuellement) Structure pour un profil utilisateur
export interface UserProfile {
  initials: string;
  status: 'online' | 'offline';
  region: string;
  latency: number;
}

// Types possibles pour un élément dans l'explorateur
// category/genre/series = Dossiers | file = Fichiers (PDF/CBZ)
export type NodeType = 'category' | 'genre' | 'series' | 'topic' | 'file';

// Structure principale de l'arbre de données VK
export interface VkNode {
  id: string;           // Identifiant unique
  title: string;        // Titre affiché
  url?: string;         // Lien vers VK ou lien de téléchargement direct
  type: NodeType;       // Type de noeud (Dossier ou Fichier)
  children?: VkNode[];  // Sous-dossiers (si c'est un dossier)
  count?: number;
  extension?: string;   // Extension du fichier (PDF, CBZ, etc.) pour l'affichage
  isLoaded?: boolean;   // Indique si on a déjà chargé le contenu de ce dossier
  vkGroupId?: string;   // ID du groupe VK (nécessaire pour l'API)
  vkTopicId?: string;   // ID du topic VK (nécessaire pour l'API)
  sizeBytes?: number;   // Taille du fichier (en octets) pour les noeuds de type "file"
}

export interface VkConnectionStatus {
  connected: boolean;
  latencyMs: number | null;
  lastSync: string | null;
  region?: string | null;
  regionAggregate?: string | null;
}

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  url: string | null;
  error?: string | null;
}

export interface DownloadItem {
  id: string;
  title: string;
  progress: number; // 0-100
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'canceled' | 'error';
  createdAt?: string; // ISO date de la derni��re tentative
  size?: string;
  speed?: string;
  url: string;
  path?: string; // Local save path
  extension?: string;
  subFolder?: string;
}
