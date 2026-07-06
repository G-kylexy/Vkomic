import { registerWebModule, NativeModule } from 'expo';
class ReactNativePdfToWebpModule extends NativeModule {
    PI = Math.PI;
    async setValueAsync(value) {
        this.emit('onChange', { value });
    }
    hello() {
        return 'Hello world! 👋';
    }
}
export default registerWebModule(ReactNativePdfToWebpModule, 'ReactNativePdfToWebpModule');
//# sourceMappingURL=ReactNativePdfToWebpModule.web.js.map