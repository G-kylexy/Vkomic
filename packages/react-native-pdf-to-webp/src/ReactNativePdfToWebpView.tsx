import { requireNativeView } from 'expo';
import * as React from 'react';

import { ReactNativePdfToWebpViewProps } from './ReactNativePdfToWebp.types';

const NativeView: React.ComponentType<ReactNativePdfToWebpViewProps> =
  requireNativeView('ReactNativePdfToWebp');

export default function ReactNativePdfToWebpView(props: ReactNativePdfToWebpViewProps) {
  return <NativeView {...props} />;
}
