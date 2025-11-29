export {};

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
      downloadFile: (
        id: string,
        url: string,
        directory: string,
        fileName?: string
      ) => Promise<{ ok: boolean; path: string; size?: number | null }>;
      onDownloadProgress?: (
        callback: (payload: {
          id: string;
          receivedBytes: number;
          totalBytes: number | null;
          progress: number | null;
          speedBytes: number | null;
        }) => void,
      ) => () => void;
    };
    vk?: {
      ping: (token?: string) => Promise<{ ok: boolean; latency: number | null }>;
    };
  }
}
