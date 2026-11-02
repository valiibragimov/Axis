import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const { validatePdfBytes, MAX_PDF_BYTES } = require("../../server/dist/src/shared/documents.js");
const { createDocumentUploader } = require("../../server/dist/server/src/application/upload-document.js");
const bytes = Buffer.from("%PDF-1.7\nsynthetic fixture\n%%EOF");
const target = { projectId: "p", documentId: "d", versionId: "v" };

test("PDF validation rejects non-byte representations with a stable validation error", () => {
  for (const value of [undefined, null, "", bytes.toString(), [], [...bytes], { length: 0 }, { length: bytes.length }, new DataView(new ArrayBuffer(8)), new Uint16Array(8)]) {
    assert.throws(() => validatePdfBytes(value), { message: "PDF_INVALID_OR_TOO_LARGE" });
  }
  for (const value of [new Uint8Array(), new Uint8Array(MAX_PDF_BYTES + 1)]) {
    assert.throws(() => validatePdfBytes(value), { message: "PDF_INVALID_OR_TOO_LARGE" });
  }
  for (const value of [bytes, new Uint8Array(bytes)]) assert.doesNotThrow(() => validatePdfBytes(value));
});

test("invalid upload types cannot bypass validation through the empty-body finalize path", async () => {
  let saved = 0, finalized = 0;
  const upload = createDocumentUploader({
    loadAuthorized: async () => ({ sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, status: "uploading", createdBy: "owner" }),
    saveImmutable: async () => { saved++; },
    finalizeAuthorized: async () => { finalized++; }
  });
  for (const value of [undefined, null, "", [], {}, { length: 0 }, bytes.toString(), [...bytes]]) {
    await assert.rejects(upload(target, "owner", value), { message: "PDF_INVALID_OR_TOO_LARGE" });
  }
  assert.equal(saved, 0);
  assert.equal(finalized, 0);
  await upload(target, "owner", bytes);
  await upload(target, "owner", new Uint8Array(bytes));
  await upload(target, "owner", new Uint8Array());
  assert.equal(saved, 2);
  assert.equal(finalized, 3);
  await assert.rejects(upload(target, "owner", Buffer.from("%PDF-1.7\nchanged\n%%EOF")), { status: 422 });
  assert.equal(finalized, 3);
});
