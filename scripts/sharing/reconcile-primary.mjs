import fs from 'node:fs';
import path from 'node:path';
import { Sources } from '../../integrations/link-preview/sources.mjs';

/** Repair a verified primary migration without copying credentials across origins. */
export function reconcilePrimary(input, { origin, clientId }) {
  const next = structuredClone(input);
  if (next.forgejo !== origin || next.oauth?.clientId !== clientId)
    throw new Error('Primary source does not match the independently verified registration');
  const duplicates = (next.instances || []).filter(source => source.base === origin);
  if (duplicates.length !== 1 || duplicates[0].oauth)
    throw new Error('Expected one unconfigured duplicate; preserve all other source settings');
  const duplicate = duplicates[0];
  next.primaryId = duplicate.id;
  next.brand ??= duplicate.brand;
  next.organizationBrands = { ...duplicate.organizationBrands, ...next.organizationBrands };
  next.instances = next.instances.filter(source => source !== duplicate);
  new Sources(next, {});
  return next;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  const value = flag => args[args.indexOf(flag) + 1];
  const file = path.resolve(value('--config'));
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw new Error('Use a private regular configuration file');
  const original = fs.readFileSync(file, 'utf8');
  const next = reconcilePrimary(JSON.parse(original), {
    origin: value('--origin'), clientId: value('--client-id'),
  });
  const applied = args.includes('--apply');
  if (applied) {
    const backup = file + '.before-primary-repair-' + Date.now();
    fs.writeFileSync(backup, original, { mode: 0o600, flag: 'wx' });
    const temporary = file + '.repair-' + process.pid;
    try {
      fs.writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, file);
    } finally { fs.rmSync(temporary, { force: true }); }
  }
  console.log(JSON.stringify({ applied, origin: next.forgejo, primaryId: next.primaryId,
    remainingSources: next.instances.map(source => source.base),
    credentials: 'Preserved in their verified source; no values displayed' }, null, 2));
}
