import { spawnSync } from "node:child_process";

const run = args => {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], { stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run(["run", "build:local"]);
run(["exec", "--yes", "--package=firebase-tools@15.33.0", "--", "firebase", "emulators:exec", "--only", "auth,firestore,storage", "--project", "demo-axis-test", "--config", "firebase.emulator.json", "node --test --test-concurrency=1 tests/ui/*.test.mjs"]);
