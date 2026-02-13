/**
 * Path manipulation utilities
 * Centralized to avoid duplication across components
 */

/**
 * Normalizes a path for consistent comparison
 * Handles Windows backslashes and trailing slashes
 */
export const normalizePath = (path: string): string => {
  if (!path) return "";
  return path.replace(/\\/g, "/").replace(/\/$/, "");
};

/**
 * Joins multiple path segments with proper separator handling
 */
export const joinPaths = (...segments: string[]): string => {
  return segments
    .filter((s) => s && s.trim().length > 0)
    .map((s) => s.replace(/\\/g, "/").replace(/\/$/, ""))
    .join("/");
};

/**
 * Gets the folder name from a full path
 */
export const getFolderFromPath = (path: string): string => {
  if (!path) return "";
  const normalized = normalizePath(path);
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "";
};

/**
 * Computes the parent folder path within a base directory
 * Returns null if outside base directory
 */
export const computeParentWithinBase = (
  currentPath: string,
  basePath: string,
): string | null => {
  const normalizedCurrent = normalizePath(currentPath);
  const normalizedBase = normalizePath(basePath);

  if (normalizedCurrent === normalizedBase) {
    return null;
  }

  const lastSlash = normalizedCurrent.lastIndexOf("/");
  if (lastSlash <= 0) {
    return null;
  }

  const parentPath = normalizedCurrent.substring(0, lastSlash);

  // Vérifie que le parent est bien dans le dossier de base
  if (!parentPath.startsWith(normalizedBase)) {
    return null;
  }

  return parentPath;
};

/**
 * Checks if a path is within a base directory
 */
export const isPathWithinBase = (path: string, basePath: string): boolean => {
  const normalizedPath = normalizePath(path);
  const normalizedBase = normalizePath(basePath);
  return normalizedPath.startsWith(normalizedBase);
};
