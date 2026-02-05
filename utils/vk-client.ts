import { VkNode } from "../types";
import {
  fetchRootIndex as vkFetchRootIndex,
  fetchNodeContent as vkFetchNodeContent,
  fetchFolderTreeUpToDepth as vkFetchFolderTree,
} from "./vk-service";

// Utilise le code TypeScript natif (comme sur mobile) pour la synchronisation VK
// Les téléchargements restent en Rust pour les performances
export const fetchRootIndex = vkFetchRootIndex;
export const fetchNodeContent = vkFetchNodeContent;
export const fetchFolderTreeUpToDepth = vkFetchFolderTree;
