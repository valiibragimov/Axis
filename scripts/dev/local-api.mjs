import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

// Authenticated local composition of the existing API, never a second document server.
const projectId = "demo-axis-test";
const port = process.env.PORT || "5050";
const { emulators } = JSON.parse(readFileSync("firebase.emulator.json", "utf8"));
const child = spawn(process.execPath, ["server/dist/server/src/index.js"], {
  stdio: "inherit", windowsHide: true,
  env: { ...process.env, LOCAL_FIREBASE_EMULATORS: "true", FIREBASE_PROJECT_ID: projectId,
    GCLOUD_PROJECT: projectId, FIRESTORE_EMULATOR_HOST: `127.0.0.1:${emulators.firestore.port}`,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${emulators.auth.port}`, FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${emulators.storage.port}`,
    FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`, AUTH_REQUIRED: "true",
    LOCAL_CLIENT_ROOT: resolve("build/emulator-hosting"), PORT: port,
    ALLOWED_ORIGINS: `http://127.0.0.1:${port},http://localhost:${port}` }
});
child.once("exit", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
