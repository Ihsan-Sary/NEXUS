import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nexus.commandcenter',
  appName: 'NEXUS',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  },
  android: {
    backgroundColor: '#111113'
  },
  ios: {
    backgroundColor: '#111113',
    contentInset: 'automatic'
  }
};

export default config;
