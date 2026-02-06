/**
 * Application-wide constants and configuration.
 * Centralized to avoid duplication and ensure consistency.
 */

// Download configuration
export const DEFAULT_DOWNLOAD_PATH = "";
export const MAX_CONCURRENT_DOWNLOADS = 5;

// GitHub repository for update checks
export const GITHUB_REPO = "G-kylexy/vkomic";

// Theme color palette (for consistency across components)
export const COLORS = {
    // Backgrounds
    background: "#050B14",
    card: "#0f1523",
    cardSecondary: "#131926",
    cardHover: "#1a2233",
    input: "#161f32",

    // Borders
    border: "#1e293b",
    borderLight: "#2d3748",

    // Semantic colors
    primary: "#3b82f6", // blue-500
    success: "#10b981", // emerald-500
    warning: "#f59e0b", // amber-500
    danger: "#ef4444", // red-500
} as const;

// API configuration
export const VK_API = {
    VERSION: "5.131",
    LANG: 0, // Russian
    BASE_URL: "https://api.vk.com/method",
    DEFAULT_GROUP: "203785966",
    DEFAULT_TOPIC: "47515406",
} as const;

// UI configuration
export const UI = {
    SEARCH_DEBOUNCE_MS: 300,
    DOWNLOAD_THROTTLE_MS: 200,
    PING_INTERVAL_MS: 3000,
} as const;
