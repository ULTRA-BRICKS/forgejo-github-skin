const plain=text=>({type:'plain_text',text,emoji:false});
const section=text=>({type:'section',text:plain(text)});
const button=(text,action_id,extra={})=>({type:'button',text:plain(text),action_id,...extra});
/** A private, permanent entry point; never stores or displays source credentials. */
export function homeView(prefs={}, {origin,connected=false,connectionError=false,connectUrl=null}={}) {
 const source=new URL(origin);
 if(source.protocol!=='https:'||source.username||source.password)throw new TypeError('Configured HTTPS source required');
 const density=prefs.density==='detailed'?'Detailed':'Compact';
 const visuals=prefs.visuals==='off'?'Off':'Only when useful';
 const format=prefs.format==='blocks'?'Compatible Block Kit':'Native Work Objects';
 const connection=connectionError?'Refresh your connection':connected?'Linked':'Not connected';
 const blocks=[
  {type:'header',text:plain('Forgejo link previews')},
  section('Paste a Forgejo link into a Slack message to show its title and icon. Open, Files and other source actions take you directly to Forgejo.'),
  {type:'section',fields:[plain('Source\n'+source.host),plain('Your connection\n'+connection),plain('Information density\n'+density),plain('Supplemental charts\n'+visuals),plain('Slack presentation\n'+format)]},
  {type:'actions',elements:[button('Edit preview settings','forgejo_home_settings',{style:'primary'}),button('Refresh status','forgejo_home_refresh')]},
  {type:'divider'},
  section('Public repositories show native facts without requiring every reader to connect. Private links show only the approved internal summary; code and protected descriptions stay in Forgejo.'),
  {type:'actions',elements:[...(connectUrl?[button(connected?'Reconnect Forgejo':'Connect Forgejo','forgejo_connect',{url:connectUrl})]:[]),button('Open Forgejo','forgejo_open_original',{url:source.origin})]},
  {type:'context',elements:[plain('Settings belong to your Slack account and apply to links you share next. This Home tab also works when another app’s message cannot open an interactive preview action.')]},
 ];
 return {type:'home',callback_id:'forgejo_home',blocks};
}
