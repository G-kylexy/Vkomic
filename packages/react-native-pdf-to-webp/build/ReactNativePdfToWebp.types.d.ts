import type { StyleProp, ViewStyle } from 'react-native';
export type OnLoadEventPayload = {
    url: string;
};
export type ReactNativePdfToWebpModuleEvents = {
    onChange: (params: ChangeEventPayload) => void;
};
export type ChangeEventPayload = {
    value: string;
};
export type ReactNativePdfToWebpViewProps = {
    url: string;
    onLoad: (event: {
        nativeEvent: OnLoadEventPayload;
    }) => void;
    style?: StyleProp<ViewStyle>;
};
//# sourceMappingURL=ReactNativePdfToWebp.types.d.ts.map