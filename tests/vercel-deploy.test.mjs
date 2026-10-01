import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {deployPrebuilt,vercelDeployArgs} from '../scripts/vercel-deploy.mjs';

const linked={projectId:'prj_hxsrijXn3RG2SQt7AhAuyMASFvuW',orgId:'team_lKA0l5FGJudwmRlkdeF1h4VD',projectName:'forgejo-ui'};
function fixture(t){
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'vercel-scope-'));
  fs.mkdirSync(path.join(cwd,'.vercel'));
  fs.writeFileSync(path.join(cwd,'.vercel/project.json'),JSON.stringify(linked));
  const bin=path.join(cwd,'bin');fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin,'vercel'),`#!${process.execPath}\nrequire('node:fs').appendFileSync('invocation.json',JSON.stringify({args:process.argv.slice(2),project:process.env.VERCEL_PROJECT_ID,org:process.env.VERCEL_ORG_ID})+'\\n');process.exit(Number(process.env.TEST_VERCEL_EXIT||0));\n`,{mode:0o755});
  const keys=['PATH','VERCEL_SCOPE','VERCEL_PROJECT_ID','VERCEL_ORG_ID','TEST_VERCEL_EXIT'];
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  for(const key of keys)delete process.env[key];
  process.env.PATH=bin+path.delimiter+previous.PATH;
  t.after(()=>{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}fs.rmSync(cwd,{recursive:true,force:true});});
  return cwd;
}
const invocations=cwd=>fs.readFileSync(path.join(cwd,'invocation.json'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
const invocation=cwd=>invocations(cwd).at(-1);

test('linked deployment omits forced scope and pins child project/team identity',t=>{
  const cwd=fixture(t);deployPrebuilt(cwd,{stdio:'pipe'});
  assert.deepEqual(invocation(cwd),{args:['deploy','--prebuilt','--prod','--yes'],project:linked.projectId,org:linked.orgId});
});
test('intentional linked scope supports team slug or ID, including environment',t=>{
  const cwd=fixture(t);
  deployPrebuilt(cwd,{scope:' inventorems-projects ',stdio:'pipe'});
  assert.deepEqual(invocation(cwd).args,['deploy','--prebuilt','--prod','--yes','--scope','inventorems-projects']);
  process.env.VERCEL_SCOPE=linked.orgId;
  deployPrebuilt(cwd,{stdio:'pipe'});
  assert.equal(invocation(cwd).args.at(-1),linked.orgId);
  assert.deepEqual(vercelDeployArgs('  '),['deploy','--prebuilt','--prod','--yes']);
});
for(const [name,change] of [
  ['missing link',cwd=>fs.unlinkSync(path.join(cwd,'.vercel/project.json'))],
  ['malformed link',cwd=>fs.writeFileSync(path.join(cwd,'.vercel/project.json'),'{')],
  ['wrong linked project',cwd=>fs.writeFileSync(path.join(cwd,'.vercel/project.json'),JSON.stringify({...linked,projectId:'prj_wrong'}))],
  ['wrong linked team',cwd=>fs.writeFileSync(path.join(cwd,'.vercel/project.json'),JSON.stringify({...linked,orgId:'team_wrong'}))],
  ['wrong project name',cwd=>fs.writeFileSync(path.join(cwd,'.vercel/project.json'),JSON.stringify({...linked,projectName:'other'}))],
  ['ambient project override',()=>{process.env.VERCEL_PROJECT_ID='prj_wrong';}],
  ['ambient team override',()=>{process.env.VERCEL_ORG_ID='team_wrong';}],
  ['ambient scope override',()=>{process.env.VERCEL_SCOPE='other-team';}],
])test(name+' fails closed before invoking Vercel',t=>{
  const cwd=fixture(t);change(cwd);
  assert.throws(()=>deployPrebuilt(cwd,{stdio:'pipe'}),/linked|scope|project|team/i);
  assert.equal(fs.existsSync(path.join(cwd,'invocation.json')),false);
});
test('explicit wrong scope cannot silently deploy elsewhere',t=>{
  const cwd=fixture(t);
  assert.throws(()=>deployPrebuilt(cwd,{scope:'other-team',stdio:'pipe'}),/scope/i);
  assert.equal(fs.existsSync(path.join(cwd,'invocation.json')),false);
});
test('Vercel failure propagates without retry or fallback',t=>{
  const cwd=fixture(t);process.env.TEST_VERCEL_EXIT='23';
  assert.throws(()=>deployPrebuilt(cwd,{stdio:'pipe'}),error=>error.status===23);
  assert.deepEqual(invocations(cwd),[{args:['deploy','--prebuilt','--prod','--yes'],project:linked.projectId,org:linked.orgId}]);
});
