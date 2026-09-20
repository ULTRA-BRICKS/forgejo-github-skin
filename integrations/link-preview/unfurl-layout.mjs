import {createHash} from 'node:crypto';
import {richCard,previewDecision,assertValidatedLink} from '../../ops/handoff/slack/preview-core.mjs';
import {buildPresentation,blockCard,workObject,objectReference,visualAddsInformation} from './slack-presentation.mjs';
export {visualAddsInformation};
export const objectLabel=objectReference;
export function composeSlackCard(meta,facts,policy,options={}) {
  if ((facts.visibility==='public' && meta.private!==false) || (facts.visibility==='private' && meta.private!==true))throw new Error('Source visibility does not match the authorization proof');
  // This is the server-side boundary. The browser-only model never authorizes access.
  richCard({facts,policy,link:meta.link,title:meta.title,description:meta.description,status:meta.status});
  const decision=previewDecision(facts,policy),limited=meta.private===true;
  const model=buildPresentation(meta,{...options,limited,audience:'conversation'});
  const card=blockCard(model);
  if(['disclosed','summary'].includes(decision))card.blocks.splice(card.blocks.length-1,0,{type:'context',elements:[{type:'plain_text',text:'Use … → Connect my account to view the details available to you.',emoji:false}]});
  const {id:externalId}=externalReference(meta.link);
  return {card,model,entity:workObject(model,{postedUrl:options.postedUrl||meta.link.originalUrl,externalId}),decision};
}
export function unfurlLayout(meta,facts,policy,imageUrl) {
  return composeSlackCard(meta,facts,policy,{imageUrl}).card;
}

/** User-specific response only: never send this result through chat.unfurl. */
export function composePersonalCard(meta,proof,options={}) {
  assertValidatedLink(meta.link);
  if(proof?.accessChecked!==true || !/^U[A-Z0-9]+$/.test(proof.user||'') || !/^T[A-Z0-9]+$/.test(proof.team||'') || proof.resourceUrl!==meta.link.resourceUrl)
    throw new Error('Personal access proof does not match the viewer or resource');
  const model=buildPresentation(meta,{...options,limited:false,audience:'viewer'});
  return {model,card:blockCard(model)};
}
export function externalReference(link) {
  assertValidatedLink(link);
  return {id:createHash('sha256').update(link.kind==='file'?link.originalUrl:link.resourceUrl).digest('hex'),type:link.kind};
}
