
import { useState, useEffect } from "react";
import { VkConnectionStatus } from "../types";
import { UI } from "../utils/constants";
import { mapRegion } from "../utils/region";

export const useVkConnection = (vkToken: string) => {
    const [vkStatus, setVkStatus] = useState<VkConnectionStatus>({
        connected: false,
        latencyMs: null,
        lastSync: null,
        region: null,
        regionAggregate: null,
    });

    useEffect(() => {
        if (!vkToken) {
            setVkStatus((prev) => ({
                ...prev,
                connected: false,
                latencyMs: null,
                lastSync: null,
            }));
        }
    }, [vkToken]);

    useEffect(() => {
        // Déduit une région agrégée à partir de la timezone/locale
        const rawRegion =
            Intl?.DateTimeFormat?.().resolvedOptions().timeZone ||
            (typeof navigator !== "undefined" ? navigator.language : null) ||
            null;

        const regionAggregate = mapRegion(rawRegion);

        // Mesure la latence vers VK (via IPC) avec backoff et pause en arrière-plan
        const BASE_INTERVAL_MS = UI.PING_INTERVAL_MS;
        const HIDDEN_INTERVAL_MS = Math.max(BASE_INTERVAL_MS * 5, 15000);
        const NO_TOKEN_INTERVAL_MS = Math.max(BASE_INTERVAL_MS * 10, 30000);
        const MAX_BACKOFF_MS = 60000;

        let timeoutId: number | null = null;
        let cancelled = false;
        let consecutiveFailures = 0;

        const computeBackoff = () =>
            Math.min(
                BASE_INTERVAL_MS * 2 ** Math.min(consecutiveFailures, 5),
                MAX_BACKOFF_MS,
            );

        const schedule = (delayMs: number) => {
            if (cancelled) return;
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
            timeoutId = window.setTimeout(loop, delayMs);
        };

        const measurePing = async (): Promise<"success" | "failure" | "no-token"> => {
            if (!vkToken) {
                setVkStatus((prev) => {
                    if (
                        prev.connected === false &&
                        prev.latencyMs === null &&
                        prev.lastSync === null &&
                        prev.region === rawRegion &&
                        prev.regionAggregate === regionAggregate
                    ) {
                        return prev;
                    }
                    return {
                        ...prev,
                        connected: false,
                        latencyMs: null,
                        lastSync: null,
                        region: rawRegion,
                        regionAggregate,
                    };
                });
                return "no-token";
            }

            try {
                let latency: number | null = null;

                if ((window as any).vk?.ping) {
                    const res = await (window as any).vk.ping(vkToken);
                    latency = res.latency !== null ? res.latency : null;
                } else {
                    // Fallback pour le développement web
                    throw new Error("VK IPC not available");
                }

                setVkStatus((prev) => {
                    const threshold = 50;
                    const latencyStable =
                        prev.latencyMs !== null &&
                        latency !== null &&
                        Math.abs(prev.latencyMs - latency) < threshold;

                    const nextLatency = latencyStable ? prev.latencyMs : latency;

                    if (
                        prev.connected === true &&
                        prev.latencyMs === nextLatency &&
                        prev.region === rawRegion &&
                        prev.regionAggregate === regionAggregate
                    ) {
                        return prev;
                    }

                    return {
                        ...prev,
                        connected: true,
                        latencyMs: nextLatency,
                        // lastSync est mis à jour par les actions "Sync", pas par le ping
                        region: rawRegion,
                        regionAggregate,
                    };
                });
                return "success";
            } catch (e) {
                setVkStatus((prev) => {
                    if (
                        prev.connected === false &&
                        prev.latencyMs === null &&
                        prev.region === rawRegion &&
                        prev.regionAggregate === regionAggregate
                    ) {
                        return prev;
                    }
                    return {
                        ...prev,
                        connected: false,
                        latencyMs: null,
                        region: rawRegion,
                        regionAggregate,
                    };
                });
                return "failure";
            }
        };

        const loop = async () => {
            if (cancelled) return;

            const isHidden =
                typeof document !== "undefined" && Boolean(document.hidden);
            if (isHidden) {
                schedule(HIDDEN_INTERVAL_MS);
                return;
            }

            const result = await measurePing();
            if (cancelled) return;

            if (result === "failure") {
                consecutiveFailures += 1;
                schedule(computeBackoff());
                return;
            }

            consecutiveFailures = 0;

            if (result === "no-token") {
                schedule(NO_TOKEN_INTERVAL_MS);
                return;
            }

            schedule(BASE_INTERVAL_MS);
        };

        const handleVisibilityChange = () => {
            if (cancelled) return;
            if (typeof document === "undefined") return;
            if (!document.hidden) {
                schedule(0);
            }
        };

        if (typeof document !== "undefined") {
            document.addEventListener("visibilitychange", handleVisibilityChange);
        }

        schedule(0);

        return () => {
            cancelled = true;
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
            if (typeof document !== "undefined") {
                document.removeEventListener("visibilitychange", handleVisibilityChange);
            }
        };
    }, [vkToken]);

    return { vkStatus, setVkStatus };
};
