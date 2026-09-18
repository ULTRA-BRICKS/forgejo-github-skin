/** External browser smoke checks. Run only after deploying; not full workflow acceptance.
 * PLAYWRIGHT_MODULE=/path/to/repo/node_modules/@playwright/test/index.mjs
 * STORYBOOK_URL=https://... FORGEJO_DEMO_URL=https://... node scripts/smoke-browser.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const {PLAYWRIGHT_MODULE, STORYBOOK_URL, FORGEJO_DEMO_URL} = process.env;
if (!PLAYWRIGHT_MODULE || !STORYBOOK_URL || !FORGEJO_DEMO_URL) throw new Error('Supply the three documented environment variables');
for (const raw of [STORYBOOK_URL, FORGEJO_DEMO_URL]) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.hostname === 'git.hyperide.ai' || url.username || url.password || url.search || url.hash) {
    throw new Error('Use dedicated HTTPS demo URLs, never production or credential-bearing URLs');
  }
}
const {chromium} = await import(pathToFileURL(path.resolve(PLAYWRIGHT_MODULE)));
const output = path.resolve(process.env.ARTIFACT_DIR ?? 'artifacts/external-smoke');
await fs.mkdir(output, {recursive:true});
const browser = await chromium.launch({headless:true});
const checks = [];
const failureMessages = [];
try {
  for (const [name, viewport, storyId] of [
    ['repository-desktop',{width:1440,height:1000},'screens-repository--desktop'],
    ['repository-mobile',{width:390,height:844},'screens-repository--mobile'],
    ['issues',{width:1440,height:1000},'screens-workflows--issues'],
    ['pull-requests',{width:1440,height:1000},'screens-workflows--pull-requests'],
  ]) {
    const page = await browser.newPage({viewport});
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => failureMessages.push(`${name}: ${e.message}`));
    const url = new URL('/iframe.html',STORYBOOK_URL);
    url.searchParams.set('id',storyId);
    url.searchParams.set('viewMode','story');
    const response = await page.goto(url.href,{waitUntil:'networkidle',timeout:30000});
    if (!response?.ok()) throw new Error(`${name}: HTTP did not succeed`);
    await page.locator('#storybook-root .gh-canvas').waitFor();
    const brandSelector='#storybook-root .gh-mark svg[aria-label="Forgejo"], #storybook-root .fj-preview-brand';
    await page.locator(brandSelector).first().waitFor();
    if (await page.locator('#storybook-root .octicon-mark-github').count()) throw new Error(`${name}: GitHub mark leaked into the product fixture`);
    await page.waitForFunction(selector => {
      const marks=[...document.querySelectorAll(selector)];
      return marks.length>0 && marks.every(mark => mark instanceof HTMLImageElement
        ? mark.complete && mark.naturalWidth>0
        : mark.getBoundingClientRect().width>0 && mark.getBoundingClientRect().height>0);
    }, brandSelector, {timeout:10000});
    const overflow = await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth+1);
    if (overflow) throw new Error(`${name}: horizontal page overflow`);
    await page.screenshot({path:path.join(output,`${name}.png`)});
    checks.push({name,status:'pass',kind:'deployed-gallery-smoke'});
    await page.close();
  }
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>failureMessages.push(`forgejo-login: ${e.message}`));
  const response = await page.goto(new URL('/user/login',FORGEJO_DEMO_URL).href,{waitUntil:'networkidle',timeout:30000});
  if (!response?.ok()) throw new Error('Demo Forgejo login is unavailable');
  await page.locator('input[name="user_name"]').waitFor();
  await page.locator('input[name="password"]').waitFor();
  await page.screenshot({path:path.join(output,'forgejo-login.png')});
  checks.push({name:'forgejo-login',status:'pass',kind:'unauthenticated-server-smoke'});
  if (failureMessages.length) throw new Error('Browser JS errors detected');
} catch (error) {
  failureMessages.push(error instanceof Error ? error.message : 'Unknown browser failure');
  throw error;
} finally {
  await browser.close();
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({
    checkedAt:new Date().toISOString(),
    overallStatus:checks.length === 5 && !failureMessages.length ? 'pass' : 'fail',
    expectedChecks:5,checks,failureMessages,
    authenticatedWorkflowAcceptance:'not-run-by-this-script',
    slackWorkspaceAcceptance:'not-run-by-this-script',
  },null,2)+'\n');
}
console.info('PASS: deployed gallery render and Forgejo login smoke checks. Authenticated flows remain a separate gate.');
