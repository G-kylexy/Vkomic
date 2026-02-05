import { useState, useEffect, useCallback } from "react";
import { tauriShell } from "../lib/tauri";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";

const GITHUB_RELEASES_URL = "https://github.com/G-kylexy/vkomic/releases/latest";
const GITHUB_API_URL = "https://api.github.com/repos/G-kylexy/vkomic/releases/latest";

export interface UpdateInfo {
    version: string;
    currentVersion: string;
    notes: string;
    url: string;
}

export const useAppUpdate = () => {
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

    // Vérifier les mises à jour au démarrage
    useEffect(() => {
        const checkForUpdates = async () => {
            try {
                const currentVersion = await getVersion();

                const response = await fetch(GITHUB_API_URL);
                if (!response.ok) return;

                const release = await response.json();
                const latestVersion = release.tag_name?.replace(/^v/, "") || "";

                // Comparer les versions (simple comparaison de string pour semver)
                if (latestVersion && latestVersion !== currentVersion && isNewerVersion(latestVersion, currentVersion)) {
                    setUpdateInfo({
                        version: latestVersion,
                        currentVersion,
                        notes: release.body || "Nouvelle version disponible",
                        url: release.html_url || GITHUB_RELEASES_URL,
                    });
                }
            } catch (error) {
                console.error("Error checking for updates:", error);
            }
        };

        // Vérifier au démarrage (avec délai pour ne pas bloquer)
        setTimeout(checkForUpdates, 3000);

        // Vérifier toutes les 30 minutes
        const interval = setInterval(checkForUpdates, 30 * 60 * 1000);

        return () => clearInterval(interval);
    }, []);

    const openReleasePage = useCallback(async () => {
        const url = updateInfo?.url || GITHUB_RELEASES_URL;
        await tauriShell.openExternal(url);
        setUpdateInfo(null);
    }, [updateInfo]);

    const dismissUpdate = useCallback(() => {
        setUpdateInfo(null);
    }, []);

    const checkForUpdatesManual = useCallback(async () => {
        try {
            const currentVersion = await getVersion();

            const response = await fetch(GITHUB_API_URL);
            if (!response.ok) throw new Error("Failed to fetch");

            const release = await response.json();
            const latestVersion = release.tag_name?.replace(/^v/, "") || "";

            if (latestVersion && isNewerVersion(latestVersion, currentVersion)) {
                const yes = await ask(
                    `Mise à jour ${latestVersion} disponible !\n\nVersion actuelle: ${currentVersion}\n\nVoulez-vous ouvrir la page de téléchargement ?`,
                    {
                        title: "Mise à jour disponible",
                        kind: "info",
                        okLabel: "Ouvrir GitHub",
                        cancelLabel: "Plus tard",
                    }
                );

                if (yes) {
                    await tauriShell.openExternal(release.html_url || GITHUB_RELEASES_URL);
                }
            } else {
                await message(`Vous utilisez la dernière version (${currentVersion}) !`, {
                    title: "Aucune mise à jour",
                    kind: "info",
                });
            }
        } catch (error) {
            console.error("Error checking for updates:", error);
            // Fallback: ouvrir la page GitHub
            await tauriShell.openExternal(GITHUB_RELEASES_URL);
        }
    }, []);

    return {
        updateInfo,
        openReleasePage,
        dismissUpdate,
        checkForUpdatesManual,
    };
};

// Compare deux versions semver (retourne true si v1 > v2)
function isNewerVersion(v1: string, v2: string): boolean {
    const parts1 = v1.split(".").map(Number);
    const parts2 = v2.split(".").map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return true;
        if (p1 < p2) return false;
    }
    return false;
}
