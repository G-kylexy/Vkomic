import { useState, useEffect, useCallback } from "react";
import { tauriUpdater, tauriShell } from "../lib/tauri";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
    version: string;
    url?: string;
    notes: string;
    status: "available" | "downloading" | "ready";
    progress?: number;
}

export const useAppUpdate = () => {
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [update, setUpdate] = useState<any>(null);

    // Vérifier les mises à jour au démarrage
    useEffect(() => {
        const checkForUpdates = async () => {
            try {
                const updateResult = await tauriUpdater.check();
                
                if (updateResult?.available) {
                    setUpdate(updateResult);
                    setUpdateInfo({
                        version: updateResult.version,
                        notes: updateResult.body || "Nouvelle version disponible",
                        status: "available",
                    });
                }
            } catch (error) {
                console.error("Error checking for updates:", error);
            }
        };

        // Vérifier au démarrage
        checkForUpdates();

        // Vérifier toutes les 30 minutes
        const interval = setInterval(checkForUpdates, 30 * 60 * 1000);
        
        return () => clearInterval(interval);
    }, []);

    const handleDownloadUpdate = useCallback(async () => {
        if (!update) return;

        try {
            setUpdateInfo((prev) => prev ? { ...prev, status: "downloading" } : null);
            
            // Télécharger et installer
            await update.downloadAndInstall((event: any) => {
                switch (event.event) {
                    case "Progress":
                        setUpdateInfo((prev) => 
                            prev ? { 
                                ...prev, 
                                status: "downloading", 
                                progress: event.data.percent 
                            } : null
                        );
                        break;
                    case "Finished":
                        setUpdateInfo((prev) => 
                            prev ? { ...prev, status: "ready" } : null
                        );
                        break;
                }
            });

            // Relancer l'application
            await relaunch();
        } catch (error) {
            console.error("Error downloading update:", error);
            setUpdateInfo((prev) => 
                prev ? { ...prev, status: "available" } : null
            );
        }
    }, [update]);

    const handleInstallUpdate = useCallback(async () => {
        // Relancer l'application pour appliquer la mise à jour
        try {
            await relaunch();
        } catch (error) {
            console.error("Error relaunching app:", error);
        }
    }, []);

    const checkForUpdatesManual = useCallback(async () => {
        try {
            const updateResult = await tauriUpdater.check();
            
            if (updateResult?.available) {
                setUpdate(updateResult);
                
                const yes = await ask(
                    `Mise à jour ${updateResult.version} disponible !\n\nNotes de version:\n${updateResult.body || "Nouvelle version disponible"}`,
                    {
                        title: "Mise à jour disponible",
                        kind: "info",
                        okLabel: "Mettre à jour",
                        cancelLabel: "Plus tard",
                    }
                );

                if (yes) {
                    setUpdateInfo({
                        version: updateResult.version,
                        notes: updateResult.body || "",
                        status: "available",
                    });
                    await handleDownloadUpdate();
                }
            } else {
                await message("Vous utilisez déjà la dernière version !", {
                    title: "Aucune mise à jour",
                    kind: "info",
                });
            }
        } catch (error) {
            console.error("Error checking for updates:", error);
            // Fallback: ouvrir la page GitHub
            tauriShell.openExternal("https://github.com/G-kylexy/vkomic/releases/latest");
        }
    }, [handleDownloadUpdate]);

    return {
        updateInfo,
        setUpdateInfo,
        handleDownloadUpdate,
        handleInstallUpdate,
        checkForUpdatesManual,
    };
};
