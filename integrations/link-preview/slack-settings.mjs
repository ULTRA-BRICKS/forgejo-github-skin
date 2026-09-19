const option=(text,value)=>({text:{type:'plain_text',text,emoji:false},value});
export function settingsView(id,prefs,{connect,url}) {
  const select=(block,label,name,choices)=>({type:'input',block_id:block,label:{type:'plain_text',text:label},element:{type:'static_select',action_id:name,initial_option:choices.find(o=>o.value===prefs[name]),options:choices}});
  return {type:'modal',callback_id:'forgejo_preview_preferences',private_metadata:id,title:{type:'plain_text',text:'Preview settings'},submit:{type:'plain_text',text:'Save'},close:{type:'plain_text',text:'Cancel'},blocks:[
    {type:'section',text:{type:'plain_text',text:'These preferences apply to links you share next. Other people’s settings are unchanged.'}},
    select('density','Information density','density',[option('Compact','compact'),option('Detailed','detailed')]),
    select('visuals','Supplemental charts','visuals',[option('Only when they add information','auto'),option('Text and fields only','off')]),
    select('format','Slack presentation','format',[option('Native work objects','native'),option('Compatible Block Kit cards','blocks')]),
    {type:'actions',elements:[...(connect?[{type:'button',action_id:'forgejo_connect',text:{type:'plain_text',text:'Connect Forgejo'},url:connect}]:[]),{type:'button',action_id:'forgejo_open_original',text:{type:'plain_text',text:'Open source'},url}]},
    {type:'context',elements:[{type:'plain_text',text:'Private previews share only an approved internal summary. Code and private descriptions remain in Forgejo.'}]},
  ]};
}
export function saveSettings(payload,config,store) {
  if(payload.type!=='view_submission'||payload.team?.id!==config.slack.teamId||payload.api_app_id!==config.slack.appId||payload.view?.callback_id!=='forgejo_preview_preferences')return null;
  const id=payload.view.private_metadata;
  if(!/^[a-f0-9]{48}$/.test(id||''))return {response_action:'errors',errors:{density:'Reopen preview settings.'}};
  const pending=store.get('settings:'+id);
  if(!pending||pending.user!==payload.user?.id||pending.team!==payload.team.id)return {response_action:'errors',errors:{density:'This settings session expired. Reopen it from a preview.'}};
  const values=payload.view.state?.values,prefs={};
  for(const [name,allowed] of [['density',['compact','detailed']],['visuals',['auto','off']],['format',['native','blocks']]]) {
    const value=values?.[name]?.[name]?.selected_option?.value;
    if(!allowed.includes(value))return {response_action:'errors',errors:{[name]:'Choose one of the listed options.'}};
    prefs[name]=value;
  }
  store.put('prefs:'+pending.team+':'+pending.user,prefs,365*86400);store.take('settings:'+id);
  return {};
}
