// Shared by the build-code-example CLI and its freshness test: one source of truth for
// "what does the current renderer produce for the public code-example fixture" plus two
// ways to compare that against the tracked PNG.
//
// sourceFingerprint() hashes the renderer's actual source inputs (graphic.mjs, raster.mjs,
// the fixture data and both token files) and is portable across OSes: it never depends on
// font hinting, Chromium version, or anything else that varies by host. build-code-example.mjs
// --check uses it as the pre-commit/CI staleness gate, comparing against the fingerprint
// recorded in assets/slack-examples/code.png.manifest.json when the PNG was last generated.
//
// pngPixelsMatch() decodes two PNGs to canvas ImageData inside a real browser page and compares
// pixels directly (same pattern as scripts/sharing/check-preview-layout.mjs). PNG encoder output
// is not portable across environments, so this comparison is only valid between two images
// produced in the same process/run (see scripts/publish-gallery.mjs) — never against a
// git-committed binary that may have been rendered on a different OS.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  renderGraphic,
  closeRenderer,
  acquireBrowser,
} from "../../integrations/link-preview/raster.mjs";
import { previewFixtures } from "../../stories/preview-fixtures.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");

export const codeExamplePath = path.resolve(
  repoRoot,
  "assets/slack-examples/code.png",
);

export const manifestPath = codeExamplePath + ".manifest.json";

/** The exact renderer source inputs that determine the code-example fixture's pixels:
 * the SVG builder, the screenshot harness (viewport/scale/color-scheme), the fixture data
 * it renders, and both token files it reads. Anything outside this set (e.g. Playwright's
 * own Chromium build) is a host concern pngPixelsMatch/sourceFingerprint cannot and should
 * not police — see the module comment above. */
export const sourceFiles = [
  "integrations/link-preview/graphic.mjs",
  "integrations/link-preview/raster.mjs",
  "stories/preview-fixtures.mjs",
  "tokens.json",
  "tokens/preview.tokens.json",
].map((relative) => path.resolve(repoRoot, relative));

/** Hex sha256 over the concatenated bytes of `sourceFiles`, read fresh from disk unless
 * `buffers` is supplied (tests use that to fingerprint tampered content without touching
 * the real files on disk). */
export async function sourceFingerprint(buffers) {
  const contents = buffers ?? (await Promise.all(sourceFiles.map((file) => fs.readFile(file))));
  const hash = createHash("sha256");
  // Length-prefix each file's bytes before hashing them: without this, two different byte
  // splits across the fixed file-list boundary (e.g. a trailing byte moved from one source
  // file into the next) could concatenate to the same stream and hash identically, silently
  // missing a real source change.
  for (const content of contents) {
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(content.length));
    hash.update(length);
    hash.update(content);
  }
  return hash.digest("hex");
}

export async function readManifest() {
  try {
    return JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeManifest(fingerprint) {
  await fs.writeFile(manifestPath, JSON.stringify({ sourceFingerprint: fingerprint }, null, 2) + "\n");
}

/** Renders the exact bytes the public "code on dark background" fixture should contain. */
export async function renderCodeExample() {
  return renderGraphic({ ...previewFixtures.file, previewVariant: "code" });
}

export { closeRenderer };

const toDataUrl = (buffer) => "data:image/png;base64," + buffer.toString("base64");

/** True only when both PNG buffers decode to identical dimensions and RGBA pixels.
 * Reuses the process-wide render browser (see raster.mjs) instead of launching a
 * second Chromium alongside the one `renderCodeExample` already keeps open. */
export async function pngPixelsMatch(bufferA, bufferB) {
  const browser = await acquireBrowser();
  const page = await browser.newPage();
  try {
    return await page.evaluate(
      async ([urlA, urlB]) => {
        async function pixels(url) {
          const image = new Image();
          image.src = url;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0);
          return {
            width: canvas.width,
            height: canvas.height,
            data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          };
        }
        const [a, b] = await Promise.all([pixels(urlA), pixels(urlB)]);
        if (a.width !== b.width || a.height !== b.height) return false;
        if (a.data.length !== b.data.length) return false;
        for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
        return true;
      },
      [toDataUrl(bufferA), toDataUrl(bufferB)],
    );
  } finally {
    await page.close();
  }
}
