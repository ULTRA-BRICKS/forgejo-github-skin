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

/** Resolve old and new snapshot locators against current public source access. */
export async function publicImageMetadata(runtime, locator) {
  const raw=locator?.sourceUrl || locator?.link?.originalUrl;
  if(typeof raw!=="string" || !runtime.forgejo.parse(raw))return null;
  return publicMetadata(runtime,raw);
}
