// Minimal logger for mobile
// Disable logs in production
const isDev = __DEV__;
export const logSync = (msg: string) => isDev && console.log(`[SYNC] ${msg}`);
export const logDownload = (msg: string, ...args: any[]) => isDev && console.log(`[DOWNLOAD] ${msg}`, ...args);
export const logWarn = (msg: string, ...args: any[]) => console.warn(`[WARN] ${msg}`, ...args);
export const logError = (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args);
