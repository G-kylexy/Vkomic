import { NativeModule, requireNativeModule } from 'expo';

import { ReactNativePdfToWebpModuleEvents, PdfDocumentInfo } from './ReactNativePdfToWebp.types';

declare class ReactNativePdfToWebpModule extends NativeModule<ReactNativePdfToWebpModuleEvents> {
  openDocument(uri: string): Promise<PdfDocumentInfo>;
  extractPage(pageNum: number, width: number): Promise<string>;
  extractPageRegion(
    pageNum: number,
    cropX: number,
    cropY: number,
    cropW: number,
    cropH: number,
    outputWidth: number,
    outputHeight: number
  ): Promise<string>;
  getPageCount(): Promise<number>;
  closeDocument(): Promise<void>;
  clearCache(): Promise<boolean>;
  getCacheSize(): Promise<number>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ReactNativePdfToWebpModule>('ReactNativePdfToWebp');
