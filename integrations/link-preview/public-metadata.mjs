import {isAccessDenied} from './forgejo.mjs';
/** Shared reader is explicitly configured and can publish only positively public data. */
export async function publicMetadata({config,forgejo,oauth},raw) {
  if(!forgejo.parse(raw))return null;
  try {
    const meta=await forgejo.metadata(raw,undefined,{enrich:true,publicOnly:true});
    if(meta?.private===false)return meta;
  }catch(error){if(!isAccessDenied(error.status))throw error;}
  const reader=config.slack?.publicReaderUser;
  if(!/^U[A-Z0-9]+$/.test(reader||''))return null;
  const credential=await oauth.access(config.slack.teamId,reader,raw);
  if(!credential)return null;
  try {
    const meta=await forgejo.metadata(raw,credential,{enrich:true,publicOnly:true});
    return meta?.private===false?meta:null;
  }catch(error){if(!isAccessDenied(error.status))throw error;return null;}
}

/** Resolve old and new snapshot locators against current public source access.
 * The additive-only image variant ('code' for a file excerpt, 'activity' for a
 * repository chart) is a pure function of the freshly resolved `kind`, never trusted
 * blindly from the locator: a locator can be up to 30 days old, and this policy has
 * changed over time. A current-schema (version>=3) locator's explicit `view` is
 * cross-checked against that fresh kind and rejected outright on mismatch (which would
 * indicate a corrupted/tampered store entry, not staleness); a legacy locator
 * (version<3, or no `view` at all) is remapped by kind so it can never keep rendering a
 * stale, pre-fix full card.
 */
export async function publicImageMetadata(runtime, locator) {
  const raw=locator?.sourceUrl || locator?.link?.originalUrl;
  if(typeof raw!=="string" || !runtime.forgejo.parse(raw))return null;
  const meta=await publicMetadata(runtime,raw);
  if(!meta)return null;
  const kind=meta.summary?.kind;
  const safeView=kind==='file'?'code':kind==='repository'?'activity':null;
  const current=Number.isInteger(locator?.version) && locator.version>=3;
  const view=current?(locator.view===safeView?safeView:null):safeView;
  if(view==='code'){if(!meta.summary?.code?.length)return null;return {...meta,previewVariant:'code'};}
  if(view==='activity'){if(!meta.summary?.activity?.days?.some(n=>Number.isFinite(n)&&n>0))return null;return {...meta,previewVariant:'activity'};}
  return null;
}
