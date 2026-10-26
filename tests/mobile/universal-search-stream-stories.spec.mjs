/** Storybook streaming/loading/error states render through the same production consumer as the native page.
 * Layout, theme and keyboard contracts at 320/440/1280 in light and dark; transport behaviour is proven in
 * universal-search-stream.spec.mjs against a real chunked HTTP server.
 */
import {test,expect} from '@playwright/test';

const story=(page,id)=>page.goto('/iframe.html?id=search-universal-search--'+id+'&viewMode=story');
const dialog=page=>page.locator('#hgh-universal-search');
const options=page=>dialog(page).getByRole('option');
const retry=(page,name='Retry')=>dialog(page).getByRole('button',{name});
const SIGN_IN='Sign in to search repositories you can access.';
const UNAVAILABLE='Search is temporarily unavailable. Please try again later.';

test('loading story holds the streaming state without rendering any result',async({page})=>{
  await story(page,'stream-loading');
  await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','streaming');
  await expect(dialog(page).locator('.hgh-search-status')).toHaveText('Searching…');
  await expect(dialog(page).locator('.hgh-search-results')).toHaveAttribute('aria-busy','true');
  await expect(options(page)).toHaveCount(0);
  await expect(dialog(page).locator('.hgh-search-coverage')).toBeHidden();
  await expect(dialog(page).getByRole('searchbox')).toBeFocused();
  await page.waitForTimeout(400);
  await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','streaming');
});

test('result story shows the staged envelope with coverage once the stream is done',async({page})=>{
  await story(page,'stream-result');
  await expect(options(page)).toHaveCount(1);
  await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','done');
  await expect(dialog(page).locator('.hgh-search-coverage summary')).toHaveText('Search details');
});

for(const id of ['stream-interrupted','stream-deadline'])test(`${id} story fails closed with a retry state`,async({page})=>{
  await story(page,id);
  await expect(dialog(page).locator('.hgh-search-status')).toContainText(UNAVAILABLE);
  await expect(options(page)).toHaveCount(0);
  await expect(dialog(page).locator('.hgh-search-coverage')).toBeHidden();
  await expect(retry(page)).toBeVisible();
  await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','error');
});

test('terminal authentication error uses the signed-out UI, not a retry',async({page})=>{
  await story(page,'stream-auth-required');
  await expect(dialog(page).locator('.hgh-search-status')).toHaveText(SIGN_IN);
  await expect(retry(page)).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-hgh-search-ready','true');
});

test('Russian interrupted story localizes the retry state',async({page})=>{
  await story(page,'stream-interrupted-russian');
  await expect(dialog(page).locator('.hgh-search-status')).toContainText('Поиск временно недоступен');
  await expect(retry(page,'Повторить')).toBeVisible();
});

test('retry reaches the stream again and keyboard focus returns to the field',async({page})=>{
  await story(page,'stream-interrupted');
  await expect(retry(page)).toBeVisible();
  await page.evaluate(()=>{
    window.states=[];
    const host=document.querySelector('#hgh-universal-search');
    new MutationObserver(()=>{if(host.dataset.hghSearchState)states.push(host.dataset.hghSearchState);}).observe(host,{attributes:true,attributeFilter:['data-hgh-search-state']});
  });
  await retry(page).focus();
  await page.keyboard.press('Enter');
  await expect.poll(()=>page.evaluate(()=>states.join(','))).toBe('loading,streaming,error');
  await expect(dialog(page).getByRole('searchbox')).toBeFocused();
  await expect(retry(page)).toBeVisible();
});

const pairs=[['stream-loading','stream-loading-dark','loading'],['stream-result','stream-result-truncated-dark','result'],['stream-interrupted','stream-interrupted-dark','interrupted']];
for(const width of [320,440,1280])for(const [light,dark,name] of pairs)for(const theme of ['light','dark'])
  test(`${name} story at ${width}px ${theme}: no overflow, themed canvas, in-viewport dialog`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:900});
    await story(page,theme==='dark'?dark:light);
    if(name==='loading')await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','streaming');
    if(name==='result')await expect(options(page)).toHaveCount(1);
    if(name==='interrupted')await expect(retry(page)).toBeVisible();
    await expect(dialog(page)).toHaveCSS('background-color',theme==='dark'?'rgb(13, 17, 23)':'rgb(255, 255, 255)');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    expect(await dialog(page).evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
    const box=await dialog(page).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(width+1);
    const shot=testInfo.outputPath(`story-${name}-${width}-${theme}.png`);
    await dialog(page).screenshot({path:shot});
    await testInfo.attach(`story-${name}-${width}-${theme}`,{path:shot,contentType:'image/png'});
  });
