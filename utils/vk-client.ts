import { VkNode } from "../types";

type VkBridge = NonNullable<Window["vk"]>;

const getBridge = (): VkBridge | null => {
  if (typeof window === "undefined") return null;
  return window.vk ?? null;
};

const loadLegacyService = () => import("./vk-service");

export const fetchRootIndex = async (
  token: string,
  groupId?: string,
  topicId?: string,
): Promise<VkNode[]> => {
  const bridge = getBridge();
  if (bridge?.fetchRootIndex) {
    return bridge.fetchRootIndex(token, groupId, topicId);
  }

  const legacy = await loadLegacyService();
  return legacy.fetchRootIndex(token, groupId, topicId);
};

export const fetchNodeContent = async (
  token: string,
  node: VkNode,
): Promise<VkNode> => {
  const bridge = getBridge();
  if (bridge?.fetchNodeContent) {
    return bridge.fetchNodeContent(token, node);
  }

  const legacy = await loadLegacyService();
  return legacy.fetchNodeContent(token, node);
};

export const fetchFolderTreeUpToDepth = async (
  token: string,
  groupId?: string,
  topicId?: string,
  maxDepth?: number,
): Promise<VkNode[]> => {
  const bridge = getBridge();
  if (bridge?.fetchFolderTreeUpToDepth) {
    return bridge.fetchFolderTreeUpToDepth(token, groupId, topicId, maxDepth);
  }

  const legacy = await loadLegacyService();
  return legacy.fetchFolderTreeUpToDepth(token, groupId, topicId, maxDepth);
};

