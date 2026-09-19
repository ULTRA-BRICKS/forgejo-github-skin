import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {Sources} from '../../integrations/link-preview/sources.mjs';

export function nativeConfiguration(current,{team,app,reader,owners=[]}) {
 if(current.slack?.teamId!==team||current.slack?.appId!==app)throw new Error('Installed workspace/app identity does not match');
 if(!/^T[A-Z0-9]+$/.test(team)||!/^A[A-Z0-9]+$/.test(app)||!/^U[A-Z0-9]+$/.test(reader))throw new Error('Explicit workspace, app and reader identities are required');
 if(!owners.every(owner=>/^[A-Za-z0-9_.-]{1,100}$/.test(owner)&&!['.','..'].includes(owner)))throw new Error('Invalid approved repository owner');
 const next=structuredClone(current);
 next.slack.workObjectsEnabled=true;
 next.slack.publicReaderUser=reader;
 next.slack.summaryOwners=[...new Set(owners)].map(owner=>({workspaceId:team,instanceOrigin:new URL(current.forgejo).origin,owner}));
 new Sources(next,{});
 return next;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const {values:a}=parseArgs({options:{config:{type:'string'},team:{type:'string'},app:{type:'string'},reader:{type:'string'},owner:{type:'string',multiple:true},apply:{type:'boolean',default:false}}});
 if(!a.config)throw new Error('--config is required');
 const file=path.resolve(a.config),stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.mode&0o077)throw new Error('Use a private regular configuration file');
 const old=fs.readFileSync(file,'utf8'),next=nativeConfiguration(JSON.parse(old),{team:a.team,app:a.app,reader:a.reader,owners:a.owner||[]});
 if(a.apply) {
  const backup=file+'.before-native-'+Date.now(),temporary=file+'.native-'+process.pid;
  fs.writeFileSync(backup,old,{mode:0o600,flag:'wx'});
  try{fs.writeFileSync(temporary,JSON.stringify(next,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temporary,file);}
  finally{fs.rmSync(temporary,{force:true});}
 }
 console.log(JSON.stringify({applied:a.apply,workObjectsEnabled:next.slack.workObjectsEnabled,workspace:next.slack.teamId,app:next.slack.appId,publicReader:next.slack.publicReaderUser,approvedOwners:next.slack.summaryOwners.map(rule=>rule.owner),credentials:'Unchanged; no values displayed'},null,2));
}
