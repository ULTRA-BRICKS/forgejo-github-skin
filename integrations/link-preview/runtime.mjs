import { Sources } from './sources.mjs';
import { SlackIntegration } from './slack.mjs';

/** Build a complete candidate before publishing it to request handlers. */
export function createRuntime(config, store) {
  const snapshot = structuredClone(config);
  const sources = new Sources(snapshot, store);
  return Object.freeze({
    config: snapshot,
    sources,
    forgejo: sources.primary.client,
    oauth: sources.primary.auth,
    slack: new SlackIntegration(snapshot, store, sources, sources),
  });
}

export function reloadRuntime(current, next, store) {
  for (const field of ['origin', 'forgejo', 'encryptionKey', 'port']) {
    if (next[field] !== current.config[field])
      throw new Error('Runtime identity changes require restart');
  }
  // Sources validates every origin/namespace before anything replaces current.
  return createRuntime(next, store);
}
