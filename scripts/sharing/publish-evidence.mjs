import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {deployPrebuilt,readLinkedProject,hasUncommittedSource} from '../vercel-deploy.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const gallery=path.resolve(process.argv[2]||path.join(root,'../forgejo-github-skin-demo'));
readLinkedProject(gallery);
const output=path.join(gallery,'.vercel/output/static');
if(!(await fs.stat(output)).isDirectory())throw new Error('Build the existing static gallery first');
if(hasUncommittedSource(root))throw new Error('Publish only committed evidence');
const names=['slack-public-preview.png','slack-protected-preview.png','authorized-private-card.png','authorized-private-view.png','public-social.png','protected-social.png','walkthrough-desktop.png','walkthrough-mobile.png'];
execFileSync('git',['ls-files','--error-unmatch','--',...names.map(name=>'research/screenshots/sharing/'+name)],{cwd:root,stdio:'pipe'});
const destination=path.join(output,'sharing-evidence');
try{if((await fs.lstat(destination)).isSymbolicLink())throw new Error('Evidence destination symlink rejected');}catch(error){if(error.code!=='ENOENT')throw error;}
await fs.mkdir(destination,{recursive:true});
const manifest={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),scope:'Synthetic demo evidence; classic Slack cards and real web OAuth, not an authenticated Slack-app unfurl',files:{}};
for(const name of names){
 const source=path.join(root,'research/screenshots/sharing',name);
 const stat=await fs.lstat(source);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>3*1024*1024)throw new Error('Unexpected evidence file');
 const bytes=await fs.readFile(source);
 if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Only reviewed PNGs may be published');
 await fs.writeFile(path.join(destination,name),bytes);
 manifest.files[name]=createHash('sha256').update(bytes).digest('hex');
}
await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Staged '+names.length+' explicit synthetic PNGs into the existing reviewed static gallery; no sidecar config or source tree copied');
if(process.argv.includes('--deploy'))deployPrebuilt(gallery);
