import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'tests/slack',timeout:25000,workers:2,
 expect:{timeout:6000,toHaveScreenshot:{animations:'disabled',maxDiffPixelRatio:0.002}},
 reporter:[['list'],['json',{outputFile:'.qa/slack-story-tests.json'}]],
 use:{baseURL:process.env.SLACK_QA_URL||'http://127.0.0.1:6127',headless:true,screenshot:'only-on-failure'},
 snapshotPathTemplate:'{testDir}/snapshots/{projectName}/{arg}{ext}',
 projects:[
  {name:'desktop',use:{browserName:'chromium',viewport:{width:900,height:900}}},
  {name:'mobile-320',use:{browserName:'chromium',viewport:{width:320,height:812}}},
  {name:'mobile-440',use:{browserName:'chromium',viewport:{width:440,height:956}}},
  {name:'webkit-440',use:{browserName:'webkit',viewport:{width:440,height:956}}},
 ],
});
