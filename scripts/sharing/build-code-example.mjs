import fs from 'node:fs/promises';
import path from 'node:path';
import {
  renderCodeExample,
  closeRenderer,
  codeExamplePath,
  manifestPath,
  sourceFingerprint,
  readManifest,
  writeManifest,
} from './code-example-fingerprint.mjs';

class CheckFailure extends Error {}

const check = process.argv.includes('--check');
try {
  if (check) {
    // Portable staleness gate: no rendering, no browser — just "does the source that
    // produced the committed PNG still match the source that exists right now".
    const manifest = await readManifest();
    const current = await sourceFingerprint();
    if (!manifest || manifest.sourceFingerprint !== current) {
      throw new CheckFailure(
        `assets/slack-examples/code.png is stale: ${path.relative(process.cwd(), manifestPath)} ` +
          (manifest ? "doesn't match the current renderer source." : 'is missing.') +
          '\nRun `node scripts/sharing/build-code-example.mjs` (without --check), review the diff, and commit the refreshed PNG and manifest.',
      );
    }
    console.log('assets/slack-examples/code.png matches the current renderer source fingerprint.');
  } else {
    const fresh = await renderCodeExample();
    await fs.mkdir(path.dirname(codeExamplePath), { recursive: true });
    await fs.writeFile(codeExamplePath, fresh);
    await writeManifest(await sourceFingerprint());
    console.log('Rendered syntax-highlighted public fixture:', codeExamplePath);
  }
} catch (error) {
  if (!(error instanceof CheckFailure)) throw error;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closeRenderer();
}
