import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  renderCodeExample,
  closeRenderer,
  pngPixelsMatch,
  sourceFingerprint,
  sourceFiles,
  readManifest,
} from "../../scripts/sharing/code-example-fingerprint.mjs";
import { acquireBrowser } from "../../integrations/link-preview/raster.mjs";

test("assets/slack-examples/code.png.manifest.json fingerprint matches the current renderer source", async () => {
  // Portable across OSes: this only hashes the renderer's own source inputs and compares
  // against the fingerprint recorded when the PNG was last generated. It never renders or
  // compares pixels, so it carries no font-hinting/Chromium-version cross-environment risk
  // (see the module comment in code-example-fingerprint.mjs).
  const manifest = await readManifest();
  assert.ok(
    manifest,
    "assets/slack-examples/code.png.manifest.json is missing; run " +
      "`node scripts/sharing/build-code-example.mjs` and commit the result",
  );
  assert.equal(
    await sourceFingerprint(),
    manifest.sourceFingerprint,
    "assets/slack-examples/code.png is stale relative to the current renderer source; " +
      "run `node scripts/sharing/build-code-example.mjs` and commit the refreshed PNG and manifest",
  );
});

test("sourceFingerprint changes when renderer source changes, catching a reintroduced regression like the #44 halo", async () => {
  const real = await sourceFingerprint();
  const buffers = await Promise.all(sourceFiles.map((file) => fs.readFile(file)));
  const graphicIndex = sourceFiles.findIndex((file) => file.endsWith("graphic.mjs"));
  const tampered = buffers.with(
    graphicIndex,
    Buffer.concat([buffers[graphicIndex], Buffer.from("/* simulated renderer regression */")]),
  );
  assert.notEqual(
    await sourceFingerprint(tampered),
    real,
    "sourceFingerprint must change when a renderer source file (e.g. graphic.mjs) changes, " +
      "so `build-code-example.mjs --check` fails instead of shipping a regressed renderer",
  );
});

// A 1x1 red PNG: a deliberately different-dimensioned image. Guards pngPixelsMatch itself —
// without this, a comparator bug that always returns true would go undetected forever.
const oneByOneRedPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64",
);

test("pngPixelsMatch distinguishes different images and treats identical bytes as a match", async () => {
  try {
    const fresh = await renderCodeExample();
    assert.equal(await pngPixelsMatch(fresh, fresh), true);
    assert.equal(await pngPixelsMatch(fresh, oneByOneRedPng), false);
  } finally {
    await closeRenderer();
  }
});

test("pngPixelsMatch rejects a same-dimension image with different pixel content", async () => {
  // The 1x1 case above only exercises the width/height short-circuit; this forces the
  // per-byte comparison loop itself to detect a mismatch, not just a dimension mismatch.
  try {
    const fresh = await renderCodeExample();
    const browser = await acquireBrowser();
    const page = await browser.newPage();
    let sameSizeDifferentPixels;
    try {
      const dataUrl = await page.evaluate((freshUrl) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ff00ff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png"));
        };
        image.onerror = reject;
        image.src = freshUrl;
      }), "data:image/png;base64," + fresh.toString("base64"));
      sameSizeDifferentPixels = Buffer.from(dataUrl.split(",")[1], "base64");
    } finally {
      await page.close();
    }
    assert.equal(await pngPixelsMatch(fresh, sameSizeDifferentPixels), false);
  } finally {
    await closeRenderer();
  }
});
