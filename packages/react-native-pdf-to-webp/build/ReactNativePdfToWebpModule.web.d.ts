import { NativeModule } from 'expo';
import { ReactNativePdfToWebpModuleEvents } from './ReactNativePdfToWebp.types';
declare class ReactNativePdfToWebpModule extends NativeModule<ReactNativePdfToWebpModuleEvents> {
    PI: number;
    setValueAsync(value: string): Promise<void>;
    hello(): string;
}
declare const _default: typeof ReactNativePdfToWebpModule;
export default _default;
//# sourceMappingURL=ReactNativePdfToWebpModule.web.d.ts.map