/** Pure, bounded presentation shared by Slack serializers and Storybook. */
export function cleanText(value, limit = 160) {
  const chars=[...String(value ?? '').slice(0, limit * 2 + 2).toWellFormed().replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim()];
  return chars.length>limit ? chars.slice(0,Math.max(0,limit-1)).join('').trimEnd()+'…' : chars.join('');
}
export const slackEscape = value => cleanText(value, 1800).replace(/[&<>|*_~`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','|':'¦','*':'∗','_':'＿','~':'˜','`':'ˋ'})[c]);
const numeric = value => Number.isSafeInteger(value) && value >= 0;
const visible = value => typeof value === 'number' ? numeric(value) : typeof value === 'string' && value.trim().length > 0;
const epoch = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Math.floor(Date.parse(value)/1000) : null;
const labels = {repository:'Repository',pull:'Pull request',issue:'Issue',commit:'Commit',file:'File'};
export function objectReference(meta) {
  const link=meta.link, kind=link?.kind || meta.summary?.kind;
  if(kind==='pull') return 'PR #'+(link?.number ?? meta.summary?.number ?? '?');
  if(kind==='issue') return 'Issue #'+(link?.number ?? meta.summary?.number ?? '?');
  if(kind==='commit') return 'Commit '+cleanText(link?.sha || meta.summary?.sha, 64).slice(0,8);
  if(kind==='file') return cleanText(link?.path || meta.title, 100);
  return cleanText(meta.repository || meta.title, 100);
}
export function visualAddsInformation(meta) {
  const summary=meta.summary;
  return summary?.kind==='repository' && Array.isArray(summary.activity?.days) && summary.activity.days.some(n=>numeric(n)&&n>0);
}
function safeDestination(url, origin) {
  try {const u=new URL(url);return u.protocol==='https:' && u.origin===origin && !u.username && !u.password && u.href.length<=3000 ? u.href.replace(/[<>|]/g,c=>encodeURIComponent(c)) : null;}catch{return null;}
}
export function linkActions(link, settingsReference) {
  const origin=new URL(link.repositoryUrl).origin, primary=[], overflow=[];
  const add=(list,text,url,id)=>{const safe=safeDestination(url,origin);if(safe)list.push({text,action_id:id,url:safe,accessibility_label:cleanText(text+' in Forgejo',75)});};
  add(primary,link.kind==='pull'?'Open PR':link.kind==='issue'?'Open issue':link.kind==='file'?'Open file':link.kind==='commit'?'Open commit':'Open repository',link.originalUrl,'forgejo_open_original');
  if(link.kind==='pull'){
    add(primary,'Files',link.resourceUrl+'/files','forgejo_open_files');
    add(overflow,'Commits',link.resourceUrl+'/commits','forgejo_open_commits');
  } else if(link.kind==='repository') {
    add(primary,'Issues',link.repositoryUrl+'/issues','forgejo_open_issues');
    add(overflow,'Pull requests',link.repositoryUrl+'/pulls','forgejo_open_pulls');
    add(overflow,'Branches',link.repositoryUrl+'/branches','forgejo_open_branches');
  } else if(link.kind==='commit') {
    add(primary,'Browse files',link.repositoryUrl+'/src/commit/'+link.sha,'forgejo_browse_revision');
  } else if(link.kind==='file') {
    const file=link.path.split('/').map(encodeURIComponent).join('/');
    add(primary,'Raw file',link.repositoryUrl+'/raw/commit/'+link.sha+'/'+file,'forgejo_open_raw');
    add(overflow,'Blame',link.repositoryUrl+'/blame/commit/'+link.sha+'/'+file,'forgejo_open_blame');
    add(overflow,'Commit',link.repositoryUrl+'/commit/'+link.sha,'forgejo_open_commit');
  }
  if(link.kind!=='repository')add(overflow,'Repository',link.repositoryUrl,'forgejo_open_repository');
  if(/^[a-f0-9]{48}$/.test(settingsReference||''))overflow.push({text:'Preview settings',action_id:'forgejo_settings',value:settingsReference});
  return {primary_actions:primary.slice(0,2),overflow_actions:overflow.slice(0,5)};
}
export function buildPresentation(meta,{settingsReference,iconOrigin,imageUrl,density='compact',visuals='auto',limited=false}={}) {
  limited = limited || meta.private === true;
  const link=meta.link, kind=link.kind, summary=meta.summary||{}, reference=objectReference(meta);
  const canonical=safeDestination(link.originalUrl,new URL(link.repositoryUrl).origin);
  if(!canonical)throw new TypeError('Unsafe original destination');
  if(!labels[kind])throw new TypeError('Unsupported preview kind');
  const rawTitle=cleanText(meta.title,160).replace(/^(?:PR|Issue) #\d+:?\s*/,'');
  const title=kind==='repository'||kind==='file'||rawTitle===reference?reference:cleanText(reference+' · '+rawTitle,180);
  const fields=[];
  const put=(key,label,value,extra={})=>{if(visible(value))fields.push({key,label,value:cleanText(value,160),type:'string',...extra});};
  const state=summary.metrics?.find(m=>m.label==='State')?.value;
  const statusColor=state==='Merged'?'blue':state==='Open'?'green':state==='Draft'?'yellow':'gray';
  if(state)put('status','Status',state,{tag_color:statusColor});
  if(kind!=='repository')put('repository','Repository',meta.repository,{link:link.repositoryUrl});
  if(kind==='pull'||kind==='commit') {
    const counts=Object.fromEntries((summary.metrics||[]).filter(m=>numeric(m.value)).map(m=>[m.label,m.value]));
    if(numeric(counts.Added)||numeric(counts.Removed))put('changes','Changes',(numeric(counts.Files)?counts.Files+' files · ':'')+(numeric(counts.Added)?'+'+counts.Added:'?')+' / '+(numeric(counts.Removed)?'−'+counts.Removed:'?'));
    if(density==='detailed')put('files','Files',counts.Files);
    if(summary.checks && numeric(summary.checks.total))put('checks','Checks',summary.checks.total===0?'No checks reported':summary.checks.passed+'/'+summary.checks.total+' · '+summary.checks.state,{tag_color:summary.checks.state==='success'?'green':['failure','error'].includes(summary.checks.state)?'red':'yellow'});
    if(!limited && density==='detailed' && summary.base && summary.head)put('branches','Branches',summary.base+' ← '+summary.head);
    if(density==='detailed')put('reviewers','Requested reviewers',summary.reviewers);
  } else if(kind==='repository') {
    for(const [label,key] of [['Stars','stars'],['Open issues','issues'],['Open PRs','pulls'],['Forks','forks']])put(key,label,summary.metrics?.find(m=>m.label===label)?.value);
    put('language','Language',summary.language);
  } else if(kind==='issue') {
    put('replies','Comments',summary.metrics?.find(m=>m.label==='Replies')?.value);
    if(!limited && summary.labels?.length)put('labels','Labels',summary.labels.slice(0,5).map(x=>cleanText(x,32)).join(' · '));
    if(!limited && summary.assignees?.length)put('assignees','Assignees',summary.assignees.slice(0,3).map(x=>cleanText(x,40)).join(', '));
  } else if(kind==='file') {
    put('file_size','Size',numeric(summary.metrics?.find(m=>m.label==='Bytes')?.value)?summary.metrics.find(m=>m.label==='Bytes').value+' bytes':null);
    put('revision','Revision',cleanText(link.sha,64).slice(0,8));
    if(link.lines)put('lines','Lines',link.lines.start+'–'+link.lines.end);
  }
  if(limited)put('visibility','Visibility','Private · shared summary',{tag_color:'gray'});
  const iconKey=kind==='pull'&&['Merged','Draft','Closed'].includes(state)?'pull-'+state.toLowerCase():kind==='issue'&&state==='Closed'?'issue-closed':kind;
  const icon=iconOrigin?new URL('/icons/'+iconKey+'.png',iconOrigin).href:null;
  return {kind,reference,title,density,description:limited||kind==='file'?'':cleanText(meta.description,density==='detailed'?600:140),
    repository:cleanText(meta.repository,120),author:limited?'':cleanText(summary.author||meta.author,80),
    created:epoch(summary.created),updated:epoch(meta.updatedAt||summary.updated),url:canonical,resourceUrl:link.resourceUrl,
    entityType:kind==='file'?'slack#/entities/file':['issue','pull'].includes(kind)?'slack#/entities/task':'slack#/entities/item',
    fields:fields.slice(0,density==='detailed'?9:4),actions:linkActions(link,settingsReference),icon,
    code:kind==='file'&&!limited? (summary.code||[]).slice(0,5).map(line=>String(line).slice(0,300).toWellFormed()):[],
    imageUrl:!limited&&visuals!=='off'&&visualAddsInformation(meta)&&imageUrl?imageUrl:null, limited,
  };
}
export function workObject(model,{postedUrl,externalId}) {
  const attributes={title:{text:model.title},display_id:model.reference,display_type:labels[model.kind],product_name:'Forgejo'};
  if(model.icon)attributes.product_icon={url:model.icon,alt_text:labels[model.kind]};
  if(model.updated)attributes.metadata_last_modified=model.updated;
  const custom=[], fields={}, order=[];
  const addCustom=field=>{custom.push(field);order.push(field.key);};
  if(model.description){if(model.entityType!=='slack#/entities/task')addCustom({key:'summary',label:'Summary',value:model.description,type:'string',long:true});else {fields.description={value:model.description,type:'string',long:true};order.push('description');}}
  for(const field of model.fields){if(field.key==='status'&&model.entityType==='slack#/entities/task'){const {key,label,...rest}=field;fields.status=rest;order.push('status');}
    else if(field.key==='file_size'&&model.entityType==='slack#/entities/file'){fields.file_size={value:field.value};order.push('file_size');}
    else addCustom(field);}
  if(model.density==='detailed' && model.author && model.entityType!=='slack#/entities/item'){fields.created_by={type:'slack#/types/user',user:{text:model.author}};order.push('created_by');}
  if(model.density==='detailed' && model.updated && model.entityType!=='slack#/entities/item')fields.date_updated={value:model.updated,type:'slack#/types/timestamp'};
  if(model.code.length)addCustom({key:'code_excerpt',label:'Code excerpt',value:model.code.join('\n'),type:'string',long:true});
  if(model.imageUrl)addCustom({key:'activity',label:'Recent activity',type:'slack#/types/image',image_url:model.imageUrl,alt_text:'Daily commit activity over the last 28 days'});
  const entity_payload={attributes,custom_fields:custom,display_order:order,actions:model.actions};
  if(model.entityType!=='slack#/entities/item')entity_payload.fields=fields;
  return {app_unfurl_url:postedUrl,url:model.url,external_ref:{id:externalId,type:model.kind},entity_type:model.entityType,entity_payload};
}
export function blockCard(model) {
  const blocks=[{type:'context',elements:[...(model.icon?[{type:'image',image_url:model.icon,alt_text:labels[model.kind]}]:[]),{type:'plain_text',text:'Forgejo · '+model.repository,emoji:false}]},
    {type:'section',text:{type:'mrkdwn',text:'*<'+model.url+'|'+slackEscape(model.title)+'>*',verbatim:true}}];
  if(model.description)blocks.push({type:'section',text:{type:'plain_text',text:model.description,emoji:false}});
  if(model.fields.length)blocks.push({type:'section',fields:model.fields.map(f=>({type:'mrkdwn',text:'*'+slackEscape(f.label)+'*\n'+slackEscape(f.value),verbatim:true}))});
  if(model.code.length)blocks.push({type:'rich_text',elements:[{type:'rich_text_preformatted',elements:[{type:'text',text:model.code.join('\n')}]}]});
  if(model.imageUrl)blocks.push({type:'image',image_url:model.imageUrl,alt_text:'Daily commit activity over the last 28 days'});
  const elements=model.actions.primary_actions.map(a=>({type:'button',...a,text:{type:'plain_text',text:a.text,emoji:false}}));
  if(model.actions.overflow_actions.length)elements.push({type:'overflow',action_id:'forgejo_more',options:model.actions.overflow_actions.map(a=>({text:{type:'plain_text',text:a.text,emoji:false},value:a.action_id==='forgejo_settings'?'settings:'+a.value:a.action_id,...(a.url?{url:a.url}:{})}))});
  blocks.push({type:'actions',elements});
  return {blocks,preview:{title:{type:'plain_text',text:cleanText(model.title,150)},...(model.icon?{icon_url:model.icon}:{})}};
}

/** Preserve useful text when an older Slack surface rejects rich/image blocks. */
export function textOnlyCard(card) {
  const blocks=card.blocks.flatMap(block=>{
    if(block.type==='image')return [];
    if(block.type==='context')return [{...block,elements:block.elements.filter(element=>element.type!=='image')}];
    if(block.type!=='rich_text')return [block];
    const text=block.elements.flatMap(section=>(section.elements||[]).filter(element=>element.type==='text').map(element=>element.text)).join('\n');
    return text?[{type:'section',text:{type:'plain_text',text:text.slice(0,2800),emoji:false}}]:[];
  });
  return {...card,blocks,preview:card.preview?{title:card.preview.title}:undefined};
}
