/**
 * Centralized logging utility.
 * Set DEBUG to false to disable all debug logs in production.

 */

// Set to false to disable all debug logging
const DEBUG = false;

// Prefix for all log messages
const PREFIX = '[VKomic]';

/**
 * Debug log - only shows when DEBUG is true
 */
export const logDebug = (...args: unknown[]): void => {
    if (DEBUG) {
        console.log(PREFIX, ...args);
    }
};

/**
 * Info log - always shows
 */
export const logInfo = (...args: unknown[]): void => {
    console.log(PREFIX, ...args);
};

/**
 * Warning log - always shows
 */
export const logWarn = (...args: unknown[]): void => {
    console.warn(PREFIX, ...args);
};

/**
 * Error log - always shows
 */
export const logError = (...args: unknown[]): void => {
    console.error(PREFIX, ...args);
};

/**
 * Sync-specific logger
 */
export const logSync = (...args: unknown[]): void => {
    if (DEBUG) {
        console.log('[Sync]', ...args);
    }
};
