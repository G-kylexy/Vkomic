/**
 * Text processing utilities for the VKomic application.
 */

/**
 * Normalize text for search comparison.
 * Removes accents, converts to lowercase, and normalizes whitespace.
 * @param text - Text to normalize
 * @returns Normalized text suitable for comparison
 */
export const normalizeText = (text: string): string => {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .toLowerCase()
        .replace(/[_\-\.]/g, " ") // Replace separators with spaces
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();
};

/**
 * Extract volume/issue number from a title string.
 * Supports formats like "T01", "#1", "Vol.1", "Volume 1"
 * @param title - Title to extract from
 * @returns Volume label like "#1" or "#1" as default
 */
export const extractVolumeLabel = (title: string): string => {
    const match =
        title.match(/T(\d+)/i) ||
        title.match(/#(\d+)/) ||
        title.match(/Vol\.?(\d+)/i) ||
        title.match(/Volume\s*(\d+)/i);
    return match ? `#${match[1]}` : "#1";
};

/**
 * Truncate text to a maximum length with ellipsis.
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with "..." if needed
 */
export const truncateText = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + "...";
};
