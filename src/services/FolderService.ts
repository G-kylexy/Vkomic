import { Platform, Linking } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import ReactNativeBlobUtil from "react-native-blob-util";

import SafX from "react-native-saf-x";

// Uses react-native-saf-x for native SAF operations (no base64 memory issues)

// For opening file locations
let IntentLauncher: any = null;
if (Platform.OS === "android") {
    try {
        IntentLauncher = require("expo-intent-launcher");
    } catch {
        console.warn("expo-intent-launcher not available");
    }
}

/**
 * Error types for SAF operations
 */
export enum SafErrorType {
    PERMISSION_DENIED = "PERMISSION_DENIED",
    FOLDER_NOT_FOUND = "FOLDER_NOT_FOUND",
    DISK_FULL = "DISK_FULL",
    FILE_NOT_FOUND = "FILE_NOT_FOUND",
    NO_APP_AVAILABLE = "NO_APP_AVAILABLE",
    UNKNOWN = "UNKNOWN",
}

export class SafError extends Error {
    type: SafErrorType;
    originalError?: Error;

    constructor(type: SafErrorType, message: string, originalError?: Error) {
        super(message);
        this.type = type;
        this.originalError = originalError;
        this.name = "SafError";
    }
}

export interface FolderInfo {
    uri: string;
    name: string;
}

export interface FileInfo {
    uri: string;
    name: string;
    size: number;
    lastModified: number;
    isDirectory: boolean;
    mime?: string;
}

/**
 * Ensures a SAF tree URI with a filename is converted to a proper document URI
 *
 * SAF URI formats:
 * - Tree URI (folder): content://provider/tree/treeId
 * - Document URI (file): content://provider/document/docId
 * - Tree+Document URI (file with tree permission): content://provider/tree/treeId/document/docId
 *
 * The docId format is usually: volumeId:path/to/file (e.g., primary:bd/DearS.pdf)
 */
export const ensureDocumentUri = (uri: string): string => {
    if (!uri || !uri.startsWith("content://")) return uri;

    // Already a valid tree+document URI - return as-is
    if (uri.includes("/tree/") && uri.includes("/document/")) {
        return uri;
    }

    // Pure document URI (no tree) - return as-is (we can't add tree without knowing it)
    if (uri.includes("/document/") && !uri.includes("/tree/")) {
        // Warning: This URI might not be persistent if permission was granted on the Tree, not the Document.
        // But we can't reconstruct the tree part here.
        return uri;
    }

    // Tree URI with appended filename: content://provider/tree/treeId/filename.pdf
    // Convert to: content://provider/tree/treeId/document/treeId%2Ffilename.pdf
    const treeMatch = uri.match(/^(content:\/\/[^/]+)\/tree\/([^/]+)\/(.+)$/);
    if (treeMatch) {
        const provider = treeMatch[1];
        const treeIdEncoded = treeMatch[2];
        const treeIdDecoded = decodeURIComponent(treeIdEncoded);
        const relativePath = decodeURIComponent(treeMatch[3]);

        // docId = treeId/relativePath (e.g., primary:bd/DearS.pdf)
        const docId = `${treeIdDecoded}/${relativePath}`;
        const docIdEncoded = encodeURIComponent(docId);

        const finalUri = `${provider}/tree/${treeIdEncoded}/document/${docIdEncoded}`;
        console.log(`ensureDocumentUri: tree+path -> tree+document: [${finalUri}]`);
        return finalUri;
    }

    // Plain tree URI without filename - can't convert, return as-is
    return uri;
};

/**
 * Ensures a SAF tree URI is converted to a browseable document URI for folders
 */
/**
 * Enforces SAF URI encoding for colon and slash in the ID part
 */
const encodeSafUriIfNeeded = (uri: string): string => {
    if (!uri || !uri.startsWith("content://")) return uri;

    // Si l'URI contient des caractères bruts qui devraient être encodés dans le segment ID
    // On split après /tree/ ou /document/ pour encoder proprement les segments
    if (uri.includes("/tree/")) {
        const parts = uri.split("/tree/");
        const provider = parts[0];
        const rest = parts[1];

        if (rest.includes("/document/")) {
            const subParts = rest.split("/document/");
            const treeId = subParts[0];
            const docId = subParts[1];

            const encodedTreeId = treeId.replace(/:/g, "%3A").replace(/\//g, "%2F");
            const encodedDocId = docId.replace(/:/g, "%3A").replace(/\//g, "%2F");

            return `${provider}/tree/${encodedTreeId}/document/${encodedDocId}`;
        } else {
            const encodedTreeId = rest.replace(/:/g, "%3A").replace(/\//g, "%2F");
            return `${provider}/tree/${encodedTreeId}`;
        }
    }
    return uri;
};

/**
 * Ensures a SAF tree URI is converted to a browseable document URI for folders
 */
export const ensureFolderUri = (uri: string): string => {
    if (!uri || !uri.startsWith("content://") || !uri.includes("/tree/")) {
        return uri;
    }

    if (uri.includes("/document/")) {
        return encodeSafUriIfNeeded(uri);
    }

    // Transformer l'URI Tree en URI Document exploitable pour les opérations sur le dossier
    try {
        const parts = uri.split("/tree/");
        const provider = parts[0];
        const treeId = parts[1];

        if (treeId) {
            const folderDocumentUri = `${provider}/tree/${treeId}/document/${treeId}`;
            return encodeSafUriIfNeeded(folderDocumentUri);
        }
    } catch (e) {
        console.warn("ensureFolderUri failure:", e);
    }

    return encodeSafUriIfNeeded(uri);
};

/**
 * Gets the parent folder URI from a file URI (SAF or local)
 */
export const getParentFolderUri = (fileUri: string): string => {
    if (!fileUri) return "";

    // Local file
    if (fileUri.startsWith("file://") || fileUri.startsWith("/")) {
        const lastSlash = fileUri.lastIndexOf("/");
        return lastSlash > 0 ? fileUri.substring(0, lastSlash) : fileUri;
    }

    // SAF URI
    if (fileUri.startsWith("content://")) {
        try {
            // content://.../tree/[treeId]/document/[docId]
            if (fileUri.includes("/document/")) {
                const parts = fileUri.split("/document/");
                const base = parts[0]; // .../tree/[treeId]
                const docIdEncoded = parts[1];
                const docId = decodeURIComponent(docIdEncoded);

                // docId format: volume:path/to/file or treeId/path/to/file
                const lastSlash = docId.lastIndexOf("/");
                if (lastSlash > 0) {
                    const parentDocId = docId.substring(0, lastSlash);
                    const parentDocIdEncoded = encodeURIComponent(parentDocId);
                    return `${base}/document/${parentDocIdEncoded}`;
                } else {
                    // Root of the tree?
                    return base;
                }
            }
        } catch (e) {
            console.warn("getParentFolderUri error:", e);
        }
    }

    return fileUri;
};


/**
 * Retourne la forme Tree pure de l'URI (sans /document/)
 */
export const getTreeUri = (uri: string): string => {
    if (!uri || !uri.includes("/tree/")) return uri;

    // On prend tout ce qui est avant "/document/" si présent
    if (uri.includes("/document/")) {
        return encodeSafUriIfNeeded(uri.split("/document/")[0]);
    }

    return encodeSafUriIfNeeded(uri);
};

/**
 * Opens Android folder picker (SAF) and returns the selected folder URI
 */
/**
 * Opens Android folder picker (SAF) and returns the selected folder URI
 */
export const pickFolder = async (): Promise<FolderInfo | null> => {
    if (Platform.OS !== "android") {
        // iOS: use document directory
        const iosDir = FileSystem.documentDirectory;
        if (iosDir) {
            return { uri: iosDir, name: "Documents" };
        }
        return null;
    }

    try {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
            const uri = encodeSafUriIfNeeded(permissions.directoryUri);
            const name = getFolderDisplayName(uri);
            return { uri, name };
        }
        return null;
    } catch (error) {
        console.error("Error picking folder:", error);
        return null;
    }
};

/**
 * Lists all files in the selected folder
 */
export const listFiles = async (folderUri: string): Promise<FileInfo[]> => {
    if (Platform.OS !== "android") {
        // iOS: use FileSystem
        try {
            const files = await FileSystem.readDirectoryAsync(folderUri);
            const fileInfos: FileInfo[] = [];

            for (const fileName of files) {
                const fileUri = `${folderUri}${fileName}`;
                try {
                    const info = await FileSystem.getInfoAsync(fileUri);
                    if (info.exists) {
                        fileInfos.push({
                            uri: fileUri,
                            name: fileName,
                            size: (info as any).size || 0,
                            lastModified: (info as any).modificationTime || Date.now(),
                            isDirectory: (info as any).isDirectory || false,
                        });
                    }
                } catch {
                    // Skip files we can't read
                }
            }
            return fileInfos;
        } catch (error) {
            console.error("Error listing iOS files:", error);
            return [];
        }
    }
    if (Platform.OS === "android" && folderUri.startsWith("content://")) {
        try {
            // Use EXPO to list files
            const treeUri = getTreeUri(folderUri);

            const uris = await FileSystem.StorageAccessFramework.readDirectoryAsync(treeUri);

            // Parallelize getInfoAsync calls for better performance
            const fileInfoPromises = uris.map(async (uri): Promise<FileInfo | null> => {
                try {
                    const info = await FileSystem.getInfoAsync(uri);
                    if (info.exists) {
                        // Extract name from URI (SAF URIs end with the encoded filename/docId)
                        const decodedUri = decodeURIComponent(uri);
                        const parts = decodedUri.split("/");
                        const name = parts[parts.length - 1] || "Sans nom";

                        return {
                            uri: uri,
                            name: name,
                            size: (info as any).size || 0,
                            lastModified: (info as any).modificationTime || Date.now(),
                            isDirectory: (info as any).isDirectory || false,
                            mime: (info as any).mimeType,
                        };
                    }
                    return null;
                } catch (e) {
                    console.warn(`listFiles: Error getting info for ${uri}:`, e);
                    return null;
                }
            });

            const results = await Promise.all(fileInfoPromises);
            const fileInfos = results.filter((f): f is FileInfo => f !== null);

            return fileInfos;
        } catch (error) {
            console.error("Error listing files via Expo SAF:", error);
            return [];
        }
    }

    // Default empty array if no matches
    return [];
};


/**
 * Ensures a file URI has the proper tree+document format for persistent access
 * If fileUri is missing /tree/, adds it from folderUri
 *
 * @param fileUri - The file URI (may be document-only or tree+document)
 * @param folderUri - The folder tree URI to extract tree info from
 * @returns A properly formatted tree+document URI
 */
const ensureProperFileUri = (fileUri: string, folderUri: string): string => {
    // Already has tree+document - good
    if (fileUri.includes("/tree/") && fileUri.includes("/document/")) {
        return fileUri;
    }

    // Has only /document/ - need to add /tree/
    if (fileUri.includes("/document/") && !fileUri.includes("/tree/")) {
        const treeMatch = folderUri.match(/\/tree\/([^/]+)/);
        if (treeMatch) {
            const treeId = treeMatch[1];
            const docMatch = fileUri.match(/^(content:\/\/[^/]+)\/document\/(.+)$/);
            if (docMatch) {
                const provider = docMatch[1];
                const docId = docMatch[2];
                return `${provider}/tree/${treeId}/document/${docId}`;
            }
        }
    }

    // Has /tree/ but no /document/ - it's a tree+path format, convert it
    if (fileUri.includes("/tree/") && !fileUri.includes("/document/")) {
        return ensureDocumentUri(fileUri);
    }

    return fileUri;
};

/**
 * Creates a file in the selected folder and returns the URI for writing
 * If file already exists, DELETES it first then creates new one (overwrite mode)
 */

/**
 * Writes data to a file URI (for SAF content:// URIs)
 */
export const writeToFile = async (
    fileUri: string,
    data: string,
    encoding: "utf8" | "base64" = "utf8"
): Promise<boolean> => {
    if (Platform.OS !== "android") {
        try {
            await FileSystem.writeAsStringAsync(fileUri, data, {
                encoding: encoding === "base64"
                    ? FileSystem.EncodingType.Base64
                    : FileSystem.EncodingType.UTF8,
            });
            return true;
        } catch (error) {
            console.error("Error writing file (iOS):", error);
            return false;
        }
    }

    if (Platform.OS === "android") {
        try {
            if (fileUri.startsWith("content://")) {
                await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, data, {
                    encoding: encoding === "base64"
                        ? FileSystem.EncodingType.Base64
                        : FileSystem.EncodingType.UTF8,
                });
            } else {
                // Use ReactNativeBlobUtil for local paths (more reliable)
                const localPath = fileUri.startsWith("file://") ? fileUri.substring(7) : fileUri;
                await ReactNativeBlobUtil.fs.writeFile(localPath, data, encoding);
            }
            return true;
        } catch (error) {
            console.error("Error writing file (Android):", error);
            return false;
        }
    }

    return false;
};

/**
 * Copies a file from local path to SAF URI using native copy (no memory issues)
 */
export const copyFileToSaf = async (
    sourcePath: string,
    destUri: string
): Promise<boolean> => {
    if (Platform.OS !== "android") {
        try {
            await FileSystem.copyAsync({ from: sourcePath, to: destUri });
            return true;
        } catch (error) {
            console.error("Error copying file (iOS):", error);
            return false;
        }
    }

    if (Platform.OS === "android") {
        try {
            const finalDestUri = ensureDocumentUri(destUri);
            const sourceUri = sourcePath.startsWith("file://") ? sourcePath : `file://${sourcePath}`;

            // Use SafX native copy - no base64 memory issues
            const result = await SafX.copyFile(sourceUri, finalDestUri, { replaceIfDestinationExists: true });

            if (result) {
                return true;
            } else {
                console.error("SafX.copyFile returned false or null");
                return false;
            }
        } catch (error: any) {
            const errorMsg = error?.message?.toLowerCase() || "";
            if (errorMsg.includes("no space") || errorMsg.includes("enospc") || errorMsg.includes("disk full")) {
                throw new Error("DISK_FULL");
            }
            console.error("Error copying file to SAF:", error);
            return false;
        }
    }

    return false;
};

/**
 * Copies a file from SAF URI to local path using native copy
 */
export const copySafToLocal = async (
    safUri: string,
    localPath: string
): Promise<boolean> => {
    if (Platform.OS !== "android") {
        try {
            await FileSystem.copyAsync({ from: safUri, to: localPath });
            return true;
        } catch (error) {
            console.error("Error copying file (iOS):", error);
            return false;
        }
    }

    try {
        const sourceUri = ensureDocumentUri(safUri);
        const destUri = localPath.startsWith("file://") ? localPath : `file://${localPath}`;

        // Use SafX native copy - no base64 memory issues
        const result = await SafX.copyFile(sourceUri, destUri, { replaceIfDestinationExists: true });

        if (result) {
            return true;
        } else {
            console.error("SafX.copyFile returned false or null");
            return false;
        }
    } catch (error) {
        console.error("Error copying from SAF to local:", error);
        return false;
    }
};

/**
 * Reads a file content
 */
export const readFile = async (
    fileUri: string,
    encoding: "utf8" | "base64" = "utf8"
): Promise<string | null> => {
    if (Platform.OS !== "android") {
        try {
            return await FileSystem.readAsStringAsync(fileUri, {
                encoding: encoding === "base64"
                    ? FileSystem.EncodingType.Base64
                    : FileSystem.EncodingType.UTF8,
            });
        } catch (error) {
            console.error("Error reading file (iOS):", error);
            return null;
        }
    }

    if (Platform.OS === "android") {
        try {
            if (fileUri.startsWith("content://")) {
                return await FileSystem.StorageAccessFramework.readAsStringAsync(fileUri, {
                    encoding: encoding === "base64"
                        ? FileSystem.EncodingType.Base64
                        : FileSystem.EncodingType.UTF8,
                });
            } else {
                const localPath = fileUri.startsWith("file://") ? fileUri.substring(7) : fileUri;
                return await ReactNativeBlobUtil.fs.readFile(localPath, encoding);
            }
        } catch (error) {
            console.error("Error reading file (Android):", error);
            return null;
        }
    }

    return null;
};

/**
 * Deletes a file
 */
export const deleteFile = async (fileUri: string): Promise<boolean> => {
    try {
        if (Platform.OS === "android" && fileUri.startsWith("content://")) {
            await FileSystem.deleteAsync(fileUri);
            return true;
        }

        if (Platform.OS === "android") {
            await ReactNativeBlobUtil.fs.unlink(fileUri);
            return true;
        }

        await FileSystem.deleteAsync(fileUri, { idempotent: true });
        return true;
    } catch (error) {
        console.error("deleteFile error:", error);
        return false;
    }
};

/**
 * Checks if we have permission to access a folder
 */
export const hasPermission = async (folderUri: string): Promise<boolean> => {
    if (Platform.OS !== "android") {
        return true; // iOS always has permission to its own document directory
    }

    if (!folderUri || !folderUri.startsWith("content://")) {
        return true;
    }

    return await ensureFolderPermission(folderUri);
};

/**
 * Checks if a file exists (works with SAF URIs)
 */
export const fileExists = async (fileUri: string): Promise<boolean> => {
    try {
        if (Platform.OS === "android" && fileUri.startsWith("content://")) {
            const info = await FileSystem.getInfoAsync(fileUri);
            return info.exists;
        }

        if (Platform.OS === "android") {
            return await ReactNativeBlobUtil.fs.exists(fileUri);
        }

        const info = await FileSystem.getInfoAsync(fileUri);
        return info.exists;
    } catch {
        return false;
    }
};

/**
 * Gets a display name for a folder URI (real filesystem path)
 */
export const getFolderDisplayName = (folderUri: string): string => {
    if (!folderUri) return "Non défini";

    if (Platform.OS !== "android") {
        return "Documents";
    }

    // If it's a SAF content:// URI
    if (folderUri.startsWith("content://")) {
        try {
            // content://com.android.externalstorage.documents/tree/primary%3ADownload%2FVKomic
            // Extract volume and path
            const decoded = decodeURIComponent(folderUri);
            const match = decoded.match(/tree\/([^:]+):(.+)/);
            if (match) {
                const volume = match[1];
                const path = match[2].replace(/%2F/g, "/");
                // Convert to real filesystem path
                if (volume === "primary") {
                    return `/storage/emulated/0/${path}`;
                }
                // External SD card or USB
                return `/storage/${volume}/${path}`;
            }
            return decoded.split("/").pop() || folderUri;
        } catch {
            return folderUri;
        }
    }

    // If it's a simple folder name
    return folderUri;
};

/**
 * Checks if SAF permissions are still valid for a folder URI
 * Returns true if permissions are persistent, false if lost
 */
export const checkSafPermission = async (folderUri: string): Promise<boolean> => {
    if (Platform.OS !== "android") {
        return true;
    }

    if (!folderUri.startsWith("content://")) {
        return true; // Not a SAF URI, no check needed
    }

    // Verify permission with persisted URI rights
    try {
        const hasAccess = await FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri);
        return !!hasAccess;
    } catch (e) {
        console.warn("checkSafPermission: Failed to read directory, permission might be lost", e);
        return false;
    }
};

/**
 * Ensures folder permission is still valid using Expo FileSystem
 * This is the recommended way to check persistent SAF permissions
 * @returns true if permissions are valid, false otherwise
 */
export const ensureFolderPermission = async (uri: string): Promise<boolean> => {
    if (Platform.OS !== "android") {
        return true;
    }

    if (!uri.startsWith("content://")) {
        return true;
    }

    try {
        // Use Expo to check if we can read the directory
        // This verifies we still have persistent access
        await FileSystem.StorageAccessFramework.readDirectoryAsync(uri);
        return true;
    } catch (error) {
        console.log("ensureFolderPermission: permission lost or folder invalid for", uri, error);
        return false;
    }
};

/**
 * Opens a file with the system's default app
 */
export const openFile = async (fileUri: string): Promise<boolean> => {
    if (Platform.OS !== "android") {
        // iOS: use Linking or share
        return false;
    }

    try {
        console.log("openFile: input URI:", fileUri);

        // If it's a tree URI with a filename appended (not a proper document URI),
        // convert it to the proper document URI format
        let documentUri = fileUri;

        if (fileUri.includes("/tree/") && !fileUri.includes("/document/")) {
            documentUri = ensureDocumentUri(fileUri);
            console.log("openFile: converted to document URI:", documentUri);
        }

        // Determine MIME type from extension
        let mimeType = "application/octet-stream";
        const lowerUri = documentUri.toLowerCase();
        if (lowerUri.endsWith(".pdf")) mimeType = "application/pdf";
        else if (lowerUri.endsWith(".cbz") || lowerUri.endsWith(".zip")) mimeType = "application/zip";
        else if (lowerUri.endsWith(".cbr") || lowerUri.endsWith(".rar")) mimeType = "application/x-rar-compressed";
        else if (lowerUri.endsWith(".jpg") || lowerUri.endsWith(".jpeg")) mimeType = "image/jpeg";
        else if (lowerUri.endsWith(".png")) mimeType = "image/png";

        if (IntentLauncher) {
            await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
                data: documentUri,
                type: mimeType,
                flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
            });
            return true;
        }

        // Fallback to Linking
        const canOpen = await Linking.canOpenURL(documentUri);
        if (canOpen) {
            await Linking.openURL(documentUri);
            return true;
        }

        return false;
    } catch (error: any) {
        console.error("Error opening file:", error);
        // Check if no app is available to open this file type
        const msg = error?.message?.toLowerCase() || "";
        if (msg.includes("no activity") || msg.includes("no application")) {
            throw new SafError(SafErrorType.NO_APP_AVAILABLE, "Aucune application pour ouvrir ce fichier", error);
        }
        return false;
    }
};

/**
 * Creates a file in the SAF folder with robust error handling
 * Cleans filename, checks for existing file, returns existing URI if found
 * This is the recommended function for SAF file creation
 */
export const createFileRobust = async (
    folderUri: string,
    fileName: string,
    mimeType: string = "application/octet-stream"
): Promise<string> => {
    if (Platform.OS !== "android") {
        // iOS: simple path
        const safeName = sanitizeFileName(fileName);
        return `${folderUri}${safeName}`;
    }

    // CRITICAL: Validate fileName is NOT a URI (common mistake)
    if (fileName.startsWith("content://") || fileName.startsWith("file://")) {
        console.error("createFileRobust: ERROR - fileName is a URI, not a filename!", fileName);
        throw new SafError(SafErrorType.UNKNOWN, "fileName ne doit pas être une URI");
    }

    // Step 1: Validate and clean folderUri to be a Document URI of the folder
    const cleanFolderUri = ensureFolderUri(folderUri);

    // Step 2: Verify folder permissions
    const hasPermission = await ensureFolderPermission(cleanFolderUri);
    if (!hasPermission) {
        throw new SafError(SafErrorType.PERMISSION_DENIED, "Permission perdue pour le dossier de destination");
    }

    // Step 3: Sanitize fileName - remove forbidden characters
    const cleanFileName = sanitizeFileName(fileName);
    if (!cleanFileName || cleanFileName.length === 0) {
        throw new SafError(SafErrorType.UNKNOWN, "Nom de fichier invalide après nettoyage");
    }

    console.log("createFileRobust: INPUT folderUri =", folderUri);
    console.log("createFileRobust: INPUT fileName =", fileName);
    console.log("createFileRobust: CLEAN folderUri =", cleanFolderUri);
    console.log("createFileRobust: CLEAN fileName =", cleanFileName);

    // Step 4 & 5: Find and delete existing file
    try {
        const files = await listFiles(cleanFolderUri);
        const existingFile = files.find((f: any) =>
            f.name === cleanFileName || f.name.toLowerCase() === cleanFileName.toLowerCase()
        );
        if (existingFile) {
            console.log("createFileRobust: Found existing file, deleting:", existingFile.uri);
            await FileSystem.deleteAsync(existingFile.uri, { idempotent: true });
            await new Promise(r => setTimeout(r, 150));
        }
    } catch (e) {
        console.warn("createFileRobust: Early check/delete failed, continuing anyway:", e);
    }

    // Step 6: Create new file using Expo StorageAccessFramework
    try {
        const folderDocUri = ensureFolderUri(cleanFolderUri);
        console.log("createFileRobust: Attempting creation with Expo SAF on:", folderDocUri, "name:", cleanFileName);

        const resultUri = await FileSystem.StorageAccessFramework.createFileAsync(
            folderDocUri,
            cleanFileName,
            mimeType
        );

        if (!resultUri) {
            throw new Error("Expo createFileAsync a retourné une URI vide");
        }

        const finalUri = ensureProperFileUri(resultUri, cleanFolderUri);
        console.log("createFileRobust: success, finalUri =", finalUri);
        return finalUri;
    } catch (error: any) {
        const msg = error?.message?.toLowerCase() || "";
        console.error("createFileRobust: CRITICAL ERROR:", msg);

        // Ultimate fallback: if it STILL says it exists, try to find it one last time and just return it
        if (msg.includes("already exist") || msg.includes("file exists")) {
            console.log("createFileRobust: Persistence of 'Already exists' error. Forcing last list scan...");
            const lastScan = await listFiles(cleanFolderUri);
            const foundFinal = lastScan.find((f: any) => f.name === cleanFileName || f.name.toLowerCase() === cleanFileName.toLowerCase());
            if (foundFinal) {
                console.log("createFileRobust: Recovery successful, found existing via last scan.");
                return ensureProperFileUri(foundFinal.uri, cleanFolderUri);
            }
        }

        if (error instanceof SafError) {
            console.error("createFileRobust: SAF error:", error.type, error.message);
            throw error;
        }

        if (msg.includes("no space") || msg.includes("enospc") || msg.includes("disk full")) {
            console.error("createFileRobust: DISK FULL");
            throw new SafError(SafErrorType.DISK_FULL, "Espace disque insuffisant", error);
        }

        if (msg.includes("not found") || msg.includes("doesn't exist") || msg.includes("no such")) {
            console.error("createFileRobust: PATH NOT FOUND", cleanFolderUri);
            throw new SafError(SafErrorType.FOLDER_NOT_FOUND, "Dossier de destination introuvable (clé USB débranchée ?)", error);
        }

        if (msg.includes("permission") || msg.includes("denied") || msg.includes("security")) {
            console.error("createFileRobust: PERMISSION DENIED", cleanFolderUri);
            throw new SafError(SafErrorType.PERMISSION_DENIED, "Permission refusée ou expirée pour ce dossier", error);
        }

        console.error("createFileRobust: Unknown error during creation:", error);
        throw new SafError(SafErrorType.UNKNOWN, `Erreur lors de la création (${error?.message || "Inconnue"})`, error);
    }
};

/**
 * Sanitizes a filename by removing forbidden characters
 * Returns a valid filename or throws if input cannot be sanitized
 */
export const sanitizeFileName = (fileName: string): string => {
    if (!fileName || fileName.trim() === "") {
        throw new SafError(SafErrorType.UNKNOWN, "Nom de fichier vide");
    }

    let clean = fileName;

    // Extract only the last part if it contains slashes or encoded slashes
    if (clean.includes("/") || clean.includes("%2F")) {
        clean = decodeURIComponent(clean).split("/").pop() || fileName;
    }

    // Remove volume/drive prefixes (like "primary:")
    if (clean.includes(":") || clean.includes("%3A")) {
        clean = decodeURIComponent(clean).split(":").pop() || clean;
    }

    // Remove forbidden characters: \ / : * ? " < > |
    clean = clean.replace(/[\\\/:*?"<>|]/g, "_").trim();

    // Check if result is empty after sanitization
    if (!clean || clean.length === 0 || clean === "_") {
        throw new SafError(SafErrorType.UNKNOWN, "Nom de fichier invalide après nettoyage");
    }

    // Limit length
    if (clean.length > 200) {
        const ext = clean.includes(".") ? clean.substring(clean.lastIndexOf(".")) : "";
        const base = clean.substring(0, clean.lastIndexOf(".") || clean.length);
        clean = base.substring(0, 200 - ext.length) + ext;
    }

    return clean;
};

const ensureLocalUri = (path: string): string => {
    if (!path) return path;
    if (path.startsWith("file://") || path.startsWith("content://")) return path;
    return `file://${path}`;
};

/**
 * Copies a local temp file to SAF URI using native copy (no base64, no memory issues)
 * Uses react-native-saf-x copyFile for efficient native file copy
 */
export const copyLocalToSaf = async (
    tempPath: string,
    destSafUri: string
): Promise<boolean> => {
    if (Platform.OS !== "android") {
        try {
            await FileSystem.copyAsync({ from: tempPath, to: destSafUri });
            return true;
        } catch (error) {
            console.error("copyLocalToSaf (iOS):", error);
            return false;
        }
    }

    if (Platform.OS === "android") {
        try {
            console.log("copyLocalToSaf: copying to", destSafUri);

            // Ensure source path has file:// prefix for SafX
            const sourceUri = tempPath.startsWith("file://") ? tempPath : `file://${tempPath}`;

            // Use SafX native copy - no base64, no memory issues
            const result = await SafX.copyFile(sourceUri, destSafUri, { replaceIfDestinationExists: true });

            if (result) {
                console.log("copyLocalToSaf: success via SafX.copyFile");
                return true;
            } else {
                throw new Error("SafX.copyFile returned null");
            }
        } catch (error: any) {
            const msg = error?.message?.toLowerCase() || "";
            console.error("copyLocalToSaf: FAILED", { tempPath, destSafUri, error: msg });

            if (msg.includes("no space") || msg.includes("enospc") || msg.includes("disk full")) {
                throw new SafError(SafErrorType.DISK_FULL, "Espace disque insuffisant lors de l'écriture", error);
            }

            if (msg.includes("permission") || msg.includes("denied")) {
                throw new SafError(SafErrorType.PERMISSION_DENIED, "Permission refusée lors de l'écriture SAF", error);
            }

            throw new SafError(SafErrorType.UNKNOWN, `Erreur lors de la copie vers SAF: ${error.message}`, error);
        }
    }

    return false;
};

/**
 * Copies a file from SAF URI to local cache directory
 * Uses react-native-saf-x copyFile for native copy (no base64)
 * Used for modules that don't support SAF URIs (like PDF readers)
 * @param safUri The SAF content:// URI to read from
 * @param fileName The filename to use in the cache directory
 * @returns The local file:// path to the cached file
 */
export const copySafToCache = async (
    safUri: string,
    fileName: string
): Promise<string> => {
    if (Platform.OS !== "android") {
        // iOS: direct copy to cache
        const cacheDir = FileSystem.cacheDirectory;
        if (!cacheDir) {
            throw new SafError(SafErrorType.UNKNOWN, "Cache directory not available");
        }
        const destPath = `${cacheDir}${sanitizeFileName(fileName)}`;
        await FileSystem.copyAsync({ from: safUri, to: destPath });
        return destPath;
    }

    if (Platform.OS === "android") {
        try {
            const cacheDir = ReactNativeBlobUtil.fs.dirs.CacheDir + "/reader-temp";
            if (!(await ReactNativeBlobUtil.fs.exists(cacheDir))) {
                await ReactNativeBlobUtil.fs.mkdir(cacheDir);
            }

            const cleanFileName = sanitizeFileName(fileName);
            const destPath = `${cacheDir}/${cleanFileName}`;
            const destUri = `file://${destPath}`;

            console.log("copySafToCache: reading from", safUri);
            console.log("copySafToCache: writing to", destPath);

            // Use SafX native copy - no base64, no memory issues
            const sourceUri = ensureDocumentUri(safUri);
            const result = await SafX.copyFile(sourceUri, destUri, { replaceIfDestinationExists: true });

            if (result) {
                console.log("copySafToCache: success via SafX.copyFile");
                return destPath;
            } else {
                throw new Error("SafX.copyFile returned null");
            }
        } catch (error: any) {
            const msg = error?.message?.toLowerCase() || "";
            if (msg.includes("not found") || msg.includes("no such")) {
                throw new SafError(SafErrorType.FILE_NOT_FOUND, "Fichier SAF introuvable", error);
            }
            console.error("copySafToCache: error:", error);
            throw new SafError(SafErrorType.UNKNOWN, `Erreur de copie vers le cache: ${error?.message || "Inconnue"}`, error);
        }
    }

    throw new SafError(SafErrorType.UNKNOWN, "Platform non supportée");
};

/**
 * Opens the folder location in the system file manager
 * Uses expo-intent-launcher with proper SAF flags and MIME type
 * @param folderUri The SAF URI of the folder to open
 */
export const openFileLocation = async (folderUri: string): Promise<boolean> => {
    if (Platform.OS !== "android") {
        // iOS doesn't support opening file manager to a specific location
        return false;
    }

    try {
        const uriToOpen = ensureFolderUri(folderUri);
        console.log("openFileLocation: opening", uriToOpen);

        // Try using expo-intent-launcher first
        if (IntentLauncher) {
            try {
                // Use explicit string for action instead of enum which might be undefined/empty in some builds
                await IntentLauncher.startActivityAsync(
                    "android.intent.action.VIEW",
                    {
                        data: uriToOpen,
                        // CRITICAL: This MIME type tells Android to open file explorer
                        type: "vnd.android.document/directory",
                        // FLAG_GRANT_READ_URI_PERMISSION (1)
                        flags: 1,
                    }
                );
                return true;
            } catch (intentError) {
                console.log("openFileLocation: IntentLauncher failed, trying without MIME:", intentError);

                // Fallback: try without MIME type (some file managers don't support directory type)
                try {
                    await IntentLauncher.startActivityAsync(
                        "android.intent.action.VIEW",
                        {
                            data: uriToOpen,
                            flags: 1,
                        }
                    );
                    return true;
                } catch (fallbackError) {
                    console.log("openFileLocation: Fallback also failed:", fallbackError);
                }
            }
        }

        // Last resort: Use Linking
        const canOpen = await Linking.canOpenURL(uriToOpen);
        if (canOpen) {
            await Linking.openURL(uriToOpen);
            return true;
        }

        console.log("openFileLocation: Cannot open URI");
        return false;
    } catch (error) {
        console.error("openFileLocation: error:", error);
        return false;
    }
};

/**
 * Opens a file for reading, with fallback to copying to cache for incompatible readers
 * @param fileUri The SAF URI of the file
 * @param fileName The filename (used if copying to cache)
 * @returns Object with uri (possibly local cache path) and needsCleanup flag
 */
export const prepareFileForReading = async (
    fileUri: string,
    fileName: string
): Promise<{ uri: string; needsCleanup: boolean }> => {
    // If not a SAF URI, return as-is
    if (!fileUri.startsWith("content://")) {
        const localUri = fileUri.startsWith("file://") ? fileUri : `file://${fileUri}`;
        return { uri: localUri, needsCleanup: false };
    }

    if (Platform.OS !== "android") {
        return { uri: fileUri, needsCleanup: false };
    }

    // For SAF URIs, try to open directly first
    // If that fails (no compatible reader), copy to cache
    try {
        // Try opening directly with system
        const opened = await openFile(fileUri);
        if (opened) {
            return { uri: fileUri, needsCleanup: false };
        }
    } catch (error) {
        // If error is NO_APP_AVAILABLE, we'll handle it below
        if (error instanceof SafError && error.type === SafErrorType.NO_APP_AVAILABLE) {
            console.log("prepareFileForReading: No app available, will copy to cache");
        } else {
            throw error;
        }
    }

    // Copy to cache for readers that don't support SAF
    const cachePath = await copySafToCache(fileUri, fileName);
    return { uri: `file://${cachePath}`, needsCleanup: true };
};

/**
 * Cleans up a cached file after reading
 * @param cachePath The path to the cached file
 */
export const cleanupCachedFile = async (cachePath: string): Promise<void> => {
    try {
        const path = cachePath.startsWith("file://") ? cachePath.substring(7) : cachePath;
        if (Platform.OS === "android") {
            await ReactNativeBlobUtil.fs.unlink(path);
        } else {
            await FileSystem.deleteAsync(cachePath, { idempotent: true });
        }
        console.log("cleanupCachedFile: deleted", cachePath);
    } catch (error) {
        console.warn("cleanupCachedFile: failed to delete", cachePath, error);
    }
};

/**
 * Requests folder permission using SAF openDocumentTree with persistent access
 * This is the proper way to request folder access that persists across app restarts
 * @returns The folder info with URI and name, or null if user cancelled
 */
/**
 * Requests folder permission using SAF with persistent access
 * This is the proper way to request folder access that persists across app restarts
 * @returns The folder info with URI and name, or null if user cancelled
 */
export const requestFolderPermission = async (): Promise<FolderInfo | null> => {
    return pickFolder();
};

/**
 * Gets all persisted SAF permissions
 * Useful for debugging and checking existing permissions
 */
export const getPersistedPermissions = async (): Promise<string[]> => {
    return []; // Expo doesn't provide a way to list all persisted permissions
};

/**
 * Releases SAF permission for a folder URI
 * Call this when user wants to change the download folder
 */
export const releaseFolderPermission = async (folderUri: string): Promise<boolean> => {
    return true; // No explicit release in current Expo implementation
};
