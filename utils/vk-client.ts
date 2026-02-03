import { VkNode } from "../types";
import { tauriVk } from "../lib/tauri";

export const fetchRootIndex = async (
  token: string,
  groupId?: string,
  topicId?: string,
): Promise<VkNode[]> => {
  return tauriVk.fetchRootIndex(token, groupId || "203785966", topicId || "47515406");
};

export const fetchNodeContent = async (
  token: string,
  node: VkNode,
): Promise<VkNode> => {
  if (!node.vkGroupId || !node.vkTopicId) {
    return { ...node, isLoaded: true, children: [] };
  }

  const result = await tauriVk.fetchNodeContent(token, node.vkGroupId, node.vkTopicId);

  // Merge with existing node data (keep original title, etc.)
  return {
    ...node,
    ...result,
    title: node.title, // Keep original title
    isLoaded: true,
    structureOnly: false,
  };
};

export const fetchFolderTreeUpToDepth = async (
  token: string,
  groupId?: string,
  topicId?: string,
): Promise<VkNode[]> => {
  return tauriVk.fetchFullIndex(
    token,
    groupId || "203785966",
    topicId || "47515406"
  );
};

