import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { linkRecord } from "./support.js";

const {
  decodePngDataUrl,
  normalizeTheme,
  validateStoredLinkRecord,
} = await import("../.test-dist/src/link-records.js");

test("decodes PNG data URLs and rejects non-PNG bytes", () => {
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const decoded = new Uint8Array(
    decodePngDataUrl(`data:image/png;base64,${pngBytes.toString("base64")}`),
  );

  assert.deepEqual([...decoded], [...pngBytes]);
  assert.throws(() => decodePngDataUrl("data:image/png;base64,AAAA"), {
    message: "imageDataUrl must contain PNG bytes.",
  });
});

test("normalizes themes to the supported set", () => {
  assert.equal(normalizeTheme("paper"), "paper");
  assert.equal(normalizeTheme("mint"), "mint");
  assert.equal(normalizeTheme("dusk"), "dusk");
  assert.equal(normalizeTheme("unknown"), "paper");
  assert.equal(normalizeTheme(undefined), "paper");
});

test("validates stored share records before use", () => {
  const record = validateStoredLinkRecord(linkRecord({ sharePath: "/old" }), "newslug");

  assert.equal(record.slug, "newslug");
  assert.equal(record.sharePath, "/s/newslug");
  assert.equal(record.githubUrl, "https://github.com/octocat/Hello-World");

  assert.throws(
    () =>
      validateStoredLinkRecord(
        linkRecord({
          githubUrl: "https://example.com/phishing",
        }),
        "badtarget",
      ),
    { message: "Stored share link target is invalid." },
  );
});
