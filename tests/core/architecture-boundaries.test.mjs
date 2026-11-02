import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

test("shared and application boundaries reject runtime adapters and indirect dependencies", () => {
  for (const filename of ["src/shared/documents.ts", "src/shared/bim/publication.ts", "server/src/application/import-ifc.ts"]) {
    for (const [input, rule] of [
      ['import { db } from "firebase/firestore";', "no-restricted-imports"],
      ['import type { Firestore } from "firebase-admin/firestore";', "no-restricted-imports"],
      ['export { adapter } from "../../server/src/repositories/adapter.js";', "no-restricted-imports"],
      ['import { view } from "../../client/app/ui/view.js";', "no-restricted-imports"],
      ['const adapter = import("firebase/firestore");', "no-restricted-syntax"],
      ['const adapter = require("firebase-admin");', "no-restricted-syntax"],
      ['export const view = document;', "no-restricted-globals"],
      ['export const view = globalThis.document;', "no-restricted-globals"]
    ]) {
      const result = spawnSync(process.execPath, ["node_modules/eslint/bin/eslint.js", "--stdin", "--stdin-filename", filename, "--format", "json"], { input, encoding: "utf8" });
      assert.equal(result.status, 1, `${filename}: ${input}`);
      assert.ok(JSON.parse(result.stdout).flatMap(file => file.messages).some(message => message.ruleId === rule), `${filename}: ${input}`);
    }
  }
});

test("application policy can consume shared contracts and explicit Node capabilities", () => {
  const result = spawnSync(process.execPath, ["node_modules/eslint/bin/eslint.js", "--stdin", "--stdin-filename", "server/src/application/upload-document.ts", "--format", "json"], {
    input: 'import { createHash } from "node:crypto"; import type { IfcModelData } from "../../../src/shared/bim/types"; export const hash = createHash; export type Model = IfcModelData;', encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("a newly added inspection evaluator enters mandatory strict checking", async () => {
  const root = await mkdtemp(join(tmpdir(), "axis-strict-"));
  const directory = join(root, "src/client/features/inspections/architecture-probe");
  try {
    await mkdir(directory, { recursive: true });
    const profile = JSON.parse(await readFile("tsconfig.engineering.json", "utf8"));
    // Preserve the real include patterns/options, isolate the probe from concurrent tests.
    profile.extends = resolve("tsconfig.base.json");
    profile.files = [];
    await writeFile(join(root, "tsconfig.json"), JSON.stringify(profile));
    await writeFile(`${directory}/evaluation.ts`, "export function evaluate(value) { return value; }");
    const result = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", join(root, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stdout.replaceAll("\\", "/"), /architecture-probe\/evaluation.ts.*TS7006/);
  } finally {
    await rm(root, { recursive: true });
  }
});
