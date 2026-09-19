import {createHash} from 'node:crypto';
import {richCard,previewDecision} from '../../ops/handoff/slack/preview-core.mjs';
import {buildPresentation,blockCard,workObject,objectReference,visualAddsInformation} from './slack-presentation.mjs';
export {visualAddsInformation};
export const objectLabel=objectReference;
export function composeSlackCard(meta,facts,policy,options={}) {
  if ((facts.visibility==='public' && meta.private!==false) || (facts.visibility==='private' && meta.private!==true))throw new Error('Source visibility does not match the authorization proof');
  // This is the server-side boundary. The browser-only model never authorizes access.
  richCard({facts,policy,link:meta.link,title:meta.title,description:meta.description,status:meta.status});
  const decision=previewDecision(facts,policy),limited=meta.private===true;
  const model=buildPresentation(meta,{...options,limited});
  const card=blockCard(model);
  if(['disclosed','summary'].includes(decision))card.blocks.splice(card.blocks.length-1,0,{type:'context',elements:[{type:'plain_text',text:'Shared copy · title and status summary. Private body and code stay in Forgejo.',emoji:false}]});
  const externalId=createHash('sha256').update(meta.link.kind==='file'?meta.link.originalUrl:meta.link.resourceUrl).digest('hex');
  return {card,model,entity:workObject(model,{postedUrl:options.postedUrl||meta.link.originalUrl,externalId}),decision};
}
export function unfurlLayout(meta,facts,policy,imageUrl) {
  return composeSlackCard(meta,facts,policy,{imageUrl}).card;
}
