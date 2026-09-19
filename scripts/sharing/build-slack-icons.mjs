import fs from 'node:fs/promises';
import path from 'node:path';
import octicons from '@primer/octicons';
import {loadPlaywright} from '../playwright.mjs';
const output=path.resolve(import.meta.dirname,'../../assets/slack-icons');await fs.mkdir(output,{recursive:true});
const {chromium}=await loadPlaywright(),browser=await chromium.launch({headless:true});
try {for(const [kind,glyph,color] of [['repository','repo','#59636e'],['pull','git-pull-request','#1a7f37'],['issue','issue-opened','#0969da'],['commit','git-commit','#59636e'],['file','file-code','#59636e'],['pull-merged','git-merge','#8250df'],['pull-draft','git-pull-request-draft','#59636e'],['pull-closed','git-pull-request-closed','#cf222e'],['issue-closed','issue-closed','#8250df']]) {
 const svg=octicons[glyph].toSVG({width:40,height:40,fill:color});
 const page=await browser.newPage({viewport:{width:64,height:64},deviceScaleFactor:1});
 await page.setContent('<body style="margin:0;display:grid;place-items:center;height:64px;background:#f6f8fa;border-radius:12px">'+svg);
 await page.screenshot({path:path.join(output,kind+'.png'),omitBackground:true});await page.close();
}}
finally{await browser.close();}
console.log('Built nine static type/state-specific Slack icons');
