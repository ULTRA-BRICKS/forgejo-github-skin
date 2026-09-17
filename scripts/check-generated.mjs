import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist');
async function snapshot(dir){const out={};async function walk(d){for(const e of await fs.readdir(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())await walk(p);else if(e.isFile())out[path.relative(dir,p)]=crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');}}await walk(dir);return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b)));}
const before=await snapshot(dist);
const run=spawnSync(process.execPath,[path.join(root,'scripts/build.mjs')],{cwd:root,encoding:'utf8'});process.stdout.write(run.stdout||'');process.stderr.write(run.stderr||'');if(run.status)process.exit(run.status);
const after=await snapshot(dist);
if(JSON.stringify(before)!==JSON.stringify(after)){console.error('Generated dist/ was stale. Build output has been refreshed; review and commit it.');process.exit(1);}
console.log('Generated dist/ matches source and tokens.');
