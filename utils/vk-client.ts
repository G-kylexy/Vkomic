import { VkNode } from "../types";
import {
  fetchRootIndex as vkFetchRootIndex,
  fetchNodeContent as vkFetchNodeContent,
  fetchFolderTreeUpToDepth as vkFetchFolderTree,
} from "./vk-service";

// Utilise le code TypeScript natif (optimisé avec VK execute batching)
export const fetchRootIndex = vkFetchRootIndex;
export const fetchNodeContent = vkFetchNodeContent;
export const fetchFolderTreeUpToDepth = vkFetchFolderTree;

