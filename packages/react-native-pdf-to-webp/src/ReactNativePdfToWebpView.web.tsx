import * as React from 'react';

import { ReactNativePdfToWebpViewProps } from './ReactNativePdfToWebp.types';

export default function ReactNativePdfToWebpView(props: ReactNativePdfToWebpViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
