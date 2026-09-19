import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'tests/mobile', timeout:25000, expect:{timeout:5000,toHaveScreenshot:{animations:'disabled',maxDiffPixelRatio:0.002}},
  workers:2, reporter:[['list'],['json',{outputFile:'docs/proofs/mobile-tests.json'}]],
  use:{baseURL:process.env.MOBILE_QA_URL||'http://127.0.0.1:6119',headless:true,screenshot:'only-on-failure'},
  snapshotPathTemplate:'{testDir}/snapshots/{projectName}/{arg}{ext}',
  projects:[{name:'webkit-440',use:{browserName:'webkit',viewport:{width:440,height:956},deviceScaleFactor:1}},{name:'chromium-440',use:{browserName:'chromium',viewport:{width:440,height:956},deviceScaleFactor:1}},{name:'chromium-390',use:{browserName:'chromium',viewport:{width:390,height:844},deviceScaleFactor:1}},{name:'chromium-320',use:{browserName:'chromium',viewport:{width:320,height:812},deviceScaleFactor:1}}],
});
