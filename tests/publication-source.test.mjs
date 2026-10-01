import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {hasUncommittedSource} from '../scripts/vercel-deploy.mjs';

const root=path.resolve(import.meta.dirname,'..');
for(const publisher of ['scripts/publish-gallery.mjs','scripts/sharing/publish-evidence.mjs']){
  for(const name of ['stories/Unreviewed.stories.js','stories/credentials-demo.stories.js','public/credentials.json','public/__pycache__/draft.json','public/node_modules/example/draft.json','stories/__pycache__/Unreviewed.stories.js','vite.config.mjs','extra-input/credentials.txt']){
    test(`${publisher} rejects untracked source ${name} even when Git hides it`,t=>{
      const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'publication-source-'));
      t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
      fs.mkdirSync(path.join(cwd,'scripts/sharing'),{recursive:true});
      for(const file of [publisher,'scripts/vercel-deploy.mjs'])fs.copyFileSync(path.join(root,file),path.join(cwd,file));
      fs.symlinkSync(path.join(root,'scripts/sharing/code-example-fingerprint.mjs'),path.join(cwd,'scripts/sharing/code-example-fingerprint.mjs'));
      fs.writeFileSync(path.join(cwd,'.gitignore'),fs.readFileSync(path.join(root,'.gitignore'),'utf8'));
      fs.mkdirSync(path.join(cwd,'.vercel/output/static'),{recursive:true});
      fs.writeFileSync(path.join(cwd,'.vercel/project.json'),JSON.stringify({projectId:'prj_hxsrijXn3RG2SQt7AhAuyMASFvuW',orgId:'team_lKA0l5FGJudwmRlkdeF1h4VD',projectName:'forgejo-ui'}));
      fs.mkdirSync(path.join(cwd,'.vercel/bin'));
      fs.writeFileSync(path.join(cwd,'.vercel/bin/npm'),`#!${process.execPath}\nrequire('node:fs').writeFileSync('.vercel/build-started','true');process.exit(73);\n`,{mode:0o755});
      const git=args=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
      git(['init','--quiet']);
      git(['add','.']);
      const tree=git(['write-tree']);
      const commit=git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit-tree',tree,'-m','Publication fixture']);
      git(['update-ref','HEAD',commit]);
      assert.equal(git(['status','--porcelain','--untracked-files=all']),'');
      assert.equal(hasUncommittedSource(cwd),false);
      fs.mkdirSync(path.join(cwd,'.git/info'),{recursive:true});
      fs.appendFileSync(path.join(cwd,'.git/info/exclude'),'\nvite.config.mjs\n');
      fs.mkdirSync(path.dirname(path.join(cwd,name)),{recursive:true});
      fs.writeFileSync(path.join(cwd,name),'export default {title:"Unreviewed"};\n');
      git(['config','status.showUntrackedFiles','no']);
      const result=spawnSync(process.execPath,[path.join(cwd,publisher),cwd],{cwd,env:{...process.env,PATH:path.join(cwd,'.vercel/bin')+path.delimiter+process.env.PATH},encoding:'utf8',timeout:10000});
      assert.notEqual(result.status,0);
      assert.equal(fs.existsSync(path.join(cwd,'.vercel/build-started')),false,'unreviewed source must be rejected before building');
      assert.match(result.stderr,/Publish (committed sources and evidence only|only committed evidence)/);
    });
  }
}
