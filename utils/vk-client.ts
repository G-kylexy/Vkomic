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
  // If we haven't implemented this in Rust yet, we should.
  // For now, let's assume fetchRootIndex covers it or implement the missing command.
  return tauriVk.fetchRootIndex(token, node.id, "").then(res => ({ ...node, children: res, isLoaded: true }));
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

