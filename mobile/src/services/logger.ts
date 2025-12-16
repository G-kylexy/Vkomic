// Minimal logger for mobile
export const logSync = (msg: string) => console.log(`[SYNC] ${msg}`);
export const logWarn = (msg: string, ...args: any[]) => console.warn(`[WARN] ${msg}`, ...args);
export const logError = (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args);
