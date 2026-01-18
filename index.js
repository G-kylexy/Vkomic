import { registerRootComponent } from 'expo';
import notifee from '@notifee/react-native';
import { Platform } from 'react-native';

// CRITICAL: Register foreground service BEFORE importing App
// This must happen at the very top of the entry point
if (Platform.OS === 'android') {
  notifee.registerForegroundService(() => {
    return new Promise(() => {
      // This promise intentionally never resolves
      // The foreground service stays alive until stopForegroundService() is called
    });
  });
}

// Now import and register the app
import App from './App';

registerRootComponent(App);
