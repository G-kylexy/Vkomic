export type ChangeEventPayload = {
  value: string;
};

export type ReactNativePdfToWebpModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
};

export interface PdfDocumentInfo {
  pageCount: number;
  docId: string;
}

export interface PdfCacheStats {
  size: number;
  count: number;
}
