import { spawnSync } from 'node:child_process';
// The same entrypoints, SDKs and repositories as the main app; only Firebase endpoints change.
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'build'], {
  stdio: 'inherit', windowsHide: true,
  env: { ...process.env, FIREBASE_CONFIG_MODE: 'emulator',
    FIREBASE_WEB_API_KEY: 'demo-local-key', FIREBASE_WEB_PROJECT_ID: 'demo-axis-test',
    FIREBASE_WEB_AUTH_DOMAIN: 'localhost', FIREBASE_WEB_STORAGE_BUCKET: 'demo-axis-test.appspot.com',
    FIREBASE_WEB_MESSAGING_SENDER_ID: '000000000000', FIREBASE_WEB_APP_ID: '1:000000000000:web:local' }
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
