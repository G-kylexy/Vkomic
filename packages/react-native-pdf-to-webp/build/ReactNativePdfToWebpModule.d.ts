import { NativeModule } from 'expo';
import { ReactNativePdfToWebpModuleEvents } from './ReactNativePdfToWebp.types';
declare class ReactNativePdfToWebpModule extends NativeModule<ReactNativePdfToWebpModuleEvents> {
    PI: number;
    hello(): string;
    setValueAsync(value: string): Promise<void>;
}
declare const _default: ReactNativePdfToWebpModule;
export default _default;
//# sourceMappingURL=ReactNativePdfToWebpModule.d.ts.map