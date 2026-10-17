// Bundles test.mjs with the Capacitor plugins swapped for the fakes next to it (npm run android:test).
import path from 'node:path'

const here = import.meta.dirname
export default {
  input: path.join(here, 'test.mjs'),
  output: { file: path.join(here, '..', '..', 'node_modules', '.cache', 'android-bridge-test.mjs'), format: 'esm' },
  platform: 'node',
  resolve: {
    alias: {
      '@capacitor/app': path.join(here, 'fake-app.mjs'),
      '@capacitor/browser': path.join(here, 'fake-browser.mjs'),
      '@capacitor/local-notifications': path.join(here, 'fake-ln.mjs'),
    },
  },
  transform: { define: { 'import.meta.env.VITE_GOOGLE_ANDROID_CLIENT_ID': '"123-test.apps.googleusercontent.com"' } },
}
