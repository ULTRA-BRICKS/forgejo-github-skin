import { richCard, previewDecision } from "../../ops/handoff/slack/preview-core.mjs";
const escape = value => String(value ?? "").replace(/[&<>|]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","|":"¦"})[c]);
export function objectLabel(meta) {
  const s=meta.summary||{};
  if(s.kind==="pull") return "PR #"+(s.number??"?");
  if(s.kind==="issue") return "Issue #"+(s.number??"?");
  if(s.kind==="commit") return "Commit "+String(s.sha||"").slice(0,7);
  if(s.kind==="file") return "File · "+meta.title;
  return meta.repository||meta.title;
}
export function visualAddsInformation(meta) {
  const s=meta.summary||{};
  return !!(s.activity?.days?.some(n=>n>0)||(s.kind==="pull"&&s.metrics?.some(m=>["Added","Removed"].includes(m.label)&&Number(m.value)>0)));
}
function actions(meta) {
  const kind=meta.summary?.kind, els=[{type:"button",action_id:"forgejo_open_original",text:{type:"plain_text",text:"Open"},url:meta.link.originalUrl,accessibility_label:"Open "+objectLabel(meta)+" in Forgejo"}];
  if(kind==="pull") els.push({type:"button",action_id:"forgejo_open_files",text:{type:"plain_text",text:"Files"},url:meta.link.originalUrl.replace(/\/?$/,"/files"),accessibility_label:"Open changed files"});
  if(["pull","issue"].includes(kind)) els.push({type:"overflow",action_id:"forgejo_more",options:[{text:{type:"plain_text",text:"Copy reference"},value:"copy:"+kind+":"+(meta.summary.number??"")},{text:{type:"plain_text",text:"Open repository"},value:"repository"}]});
  return {type:"actions",elements:els};
}
export function unfurlLayout(meta,facts,policy,imageUrl) {
  const checked=richCard({facts,policy,link:meta.link,title:meta.title,description:meta.description,status:meta.status});
  const decision=previewDecision(facts,policy), name=meta.brand?.name||new URL(meta.link.originalUrl).host, s=meta.summary||{};
  const blocks=[{type:"context",elements:[{type:"mrkdwn",text:"*"+escape(name)+"* · "+escape(meta.repository||"")}]},
    {type:"section",text:{type:"mrkdwn",text:"*<"+meta.link.originalUrl+"|"+escape(objectLabel(meta))+">* · "+escape(meta.title),verbatim:true}}];
  if(meta.description) blocks.push({type:"section",text:{type:"plain_text",text:meta.description.slice(0,1200),emoji:false}});
  const metrics=(s.metrics||[]).filter(m=>m.value!==null&&m.value!==undefined).slice(0,4);
  if(metrics.length) blocks.push({type:"section",fields:metrics.map(m=>({type:"mrkdwn",text:"*"+escape(m.label)+"*\n"+escape(m.value)}))});
  if((decision==="public"||decision==="disclosed")&&imageUrl&&visualAddsInformation(meta))
    blocks.push({type:"image",image_url:imageUrl,alt_text:"Additional activity visualization"});
  blocks.push(actions(meta));
  if(decision==="disclosed"){const disclosure=checked.blocks.find(b=>b.type==="context");if(disclosure)blocks.push(disclosure);}
  return {blocks};
}
