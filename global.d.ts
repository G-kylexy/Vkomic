export { };

declare global {
  interface Window {
    win?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
    shell?: {
      openExternal: (url: string) => void;
    };
    dialog?: {
      selectFolder: () => Promise<string | null>;
    };
    fs?: {
      listDirectory: (path: string) => Promise<{
        path: string;
        entries: {
          name: string;
          path: string;
          isDirectory: boolean;
          size: number | null;
          modifiedAt: number;
        }[];
      }>;
      openPath: (path: string) => Promise<void>;
      revealPath?: (path: string) => Promise<void>;
      downloadFile: (
        id: string,
        url: string,
        directory: string,
        fileName?: string,
        token?: string,
        vkOwnerId?: string,
        vkDocId?: string,
        vkAccessKey?: string,
      ) => Promise<{
        ok: boolean;
        path: string;
        size?: number | null;
        status?: string;
      }>;
      queueDownload?: (
        id: string,
        url: string,
        directory: string,
        fileName?: string,
        token?: string,
        vkOwnerId?: string,
        vkDocId?: string,
        vkAccessKey?: string,
      ) => Promise<{
        ok: boolean;
        queued?: boolean;
        alreadyRunning?: boolean;
      }>;
      clearDownloadQueue?: () => Promise<boolean>;
      onDownloadProgress?: (
        callback: (payload: {
          id: string;
          receivedBytes: number;
          totalBytes: number | null;
          progress: number | null;
          speedBytes: number | null;
        }) => void,
      ) => () => void;
      onDownloadResult?: (
        callback: (payload: {
          id: string;
          ok: boolean;
          status?: string;
          path?: string;
          size?: number | null;
          error?: string;
        }) => void,
      ) => () => void;
      cancelDownload?: (id: string) => Promise<boolean>;
    };
    vk?: {
      ping: (
        token?: string,
      ) => Promise<{ ok: boolean; latency: number | null }>;
      request: (url: string) => Promise<any>;
      fetchRootIndex?: (
        token: string,
        groupId?: string,
        topicId?: string,
      ) => Promise<import("./types").VkNode[]>;
      fetchNodeContent?: (
        token: string,
        node: import("./types").VkNode,
      ) => Promise<import("./types").VkNode>;
      fetchFolderTreeUpToDepth?: (
        token: string,
        groupId?: string,
        topicId?: string,
        maxDepth?: number,
      ) => Promise<import("./types").VkNode[]>;
    };
    app?: {
      getVersion?: () => Promise<string>;
      checkUpdate?: () => Promise<{
        updateAvailable: boolean;
        version?: string;
        url?: string;
        notes?: string;
        error?: string | null;
      }>;
      downloadUpdate?: () => Promise<{ ok: boolean; error?: string }>;
      installUpdate?: () => Promise<boolean>;
      onUpdateAvailable?: (
        callback: (payload: { version?: string; notes?: string }) => void,
      ) => () => void;
      onUpdateProgress?: (
        callback: (payload: {
          percent?: number;
          bytesPerSecond?: number;
          transferred?: number;
          total?: number;
        }) => void,
      ) => () => void;
      onUpdateReady?: (
        callback: (payload: { version?: string; notes?: string }) => void,
      ) => () => void;
      onUpdateError?: (
        callback: (payload: { message?: string }) => void,
      ) => () => void;
    };
  }
}
