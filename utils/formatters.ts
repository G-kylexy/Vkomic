/**
 * Centralized formatting utilities for the VKomic application.
 * These functions handle byte sizes, speeds, and dates consistently across the app.
 */

/**
 * Format bytes into a human-readable string (B, KB, MB, GB)
 * @param bytes - Number of bytes to format
 * @returns Formatted string or undefined if bytes is undefined
 */
export const formatBytes = (bytes?: number | null): string | undefined => {
    if (bytes === null || bytes === undefined) return undefined;
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
};

/**
 * Format bytes into a human-readable string with fallback for null/undefined
 * @param bytes - Number of bytes to format
 * @returns Formatted string or "--" if bytes is null/undefined
 */
export const formatBytesWithFallback = (bytes?: number | null): string => {
    return formatBytes(bytes) ?? "--";
};

/**
 * Format download speed in bytes per second to human-readable format
 * @param bytesPerSecond - Speed in bytes per second
 * @returns Formatted speed string (e.g., "1.5 MB/s")
 */
export const formatSpeed = (bytesPerSecond?: number | null): string => {
    if (bytesPerSecond === null || bytesPerSecond === undefined) return "";
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    const kbps = bytesPerSecond / 1024;
    if (kbps < 1024) return `${kbps.toFixed(1)} KB/s`;
    const mbps = kbps / 1024;
    if (mbps < 1024) return `${mbps.toFixed(1)} MB/s`;
    const gbps = mbps / 1024;
    return `${gbps.toFixed(2)} GB/s`;
};

/**
 * Format an ISO date string to locale string
 * @param iso - ISO date string
 * @returns Formatted date string or "--" if invalid
 */
export const formatDateISO = (iso?: string): string => {
    if (!iso) return "--";
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "--";
    return date.toLocaleString();
};

/**
 * Format a timestamp (milliseconds) to locale string
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date string or "--" if invalid
 */
export const formatDateTimestamp = (timestamp?: number): string => {
    if (!timestamp) return "--";
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "--";
    return date.toLocaleString();
};
