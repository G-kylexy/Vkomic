import { useState, useEffect } from "react";
import { GITHUB_REPO } from "../utils/constants";

export interface UpdateInfo {
    version: string;
    url?: string;
    notes: string;
    status: "available" | "downloading" | "ready";
    progress?: number;
}

export const useAppUpdate = () => {
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

    useEffect(() => {
        const checkUpdate = async () => {
            if ((window as any).app?.checkUpdate) {
                const result = await (window as any).app.checkUpdate();
                if (result.updateAvailable && result.version) {
                    setUpdateInfo({
                        version: result.version,
                        url: result.url,
                        notes: result.notes || "",
                        status: "available",
                    });
                }
            }
        };

        const unsubAvailable =
            (window as any).app?.onUpdateAvailable?.((payload: any) => {
                if (!payload?.version) return;
                setUpdateInfo({
                    version: payload.version,
                    notes: payload.notes || "",
                    url: `https://github.com/${GITHUB_REPO}/releases`,
                    status: "available",
                });
            }) || null;

        const unsubProgress =
            (window as any).app?.onUpdateProgress?.((payload: any) => {
                setUpdateInfo((prev) =>
                    prev
                        ? {
                            ...prev,
                            status: "downloading",
                            progress:
                                typeof payload?.percent === "number"
                                    ? Math.min(Math.max(payload.percent, 0), 100)
                                    : prev.progress,
                        }
                        : prev
                );
            }) || null;

        const unsubReady =
            (window as any).app?.onUpdateReady?.((payload: any) => {
                setUpdateInfo((prev) => ({
                    version: payload?.version || prev?.version || "",
                    notes: payload?.notes || prev?.notes || "",
                    url: `https://github.com/${GITHUB_REPO}/releases`,
                    status: "ready",
                    progress: 100,
                }));
            }) || null;

        const unsubError =
            (window as any).app?.onUpdateError?.(() => {
                setUpdateInfo(null);
            }) || null;

        // Vérifier après 2 secondes pour ne pas ralentir le démarrage
        const timer = setTimeout(checkUpdate, 2000);
        return () => {
            clearTimeout(timer);
            unsubAvailable && unsubAvailable();
            unsubProgress && unsubProgress();
            unsubReady && unsubReady();
            unsubError && unsubError();
        };
    }, []);

    const handleDownloadUpdate = async () => {
        if (updateInfo?.url) {
            setUpdateInfo(null);
            if (window.shell?.openExternal) {
                window.shell.openExternal(updateInfo.url);
            } else {
                window.open(updateInfo.url, "_blank");
            }
        }
    };

    const handleInstallUpdate = async () => {
        if (updateInfo?.url) {
            setUpdateInfo(null);
            if (window.shell?.openExternal) {
                window.shell.openExternal(updateInfo.url);
            } else {
                window.open(updateInfo.url, "_blank");
            }
        }
    };

    return {
        updateInfo,
        setUpdateInfo,
        handleDownloadUpdate,
        handleInstallUpdate,
    };
};
