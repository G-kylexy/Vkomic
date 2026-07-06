import { registerWebModule, NativeModule } from 'expo';

import { ReactNativePdfToWebpModuleEvents } from './ReactNativePdfToWebp.types';

class ReactNativePdfToWebpModule extends NativeModule<ReactNativePdfToWebpModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(ReactNativePdfToWebpModule, 'ReactNativePdfToWebpModule');
