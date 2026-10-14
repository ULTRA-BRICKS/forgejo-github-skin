import {test,expect} from '@playwright/test';

const story=(page,id)=>page.goto('/iframe.html?id='+id+'&viewMode=story');

test('universal search opens focused, hides legacy repo search, and has no mobile overflow',async({page})=>{
  await story(page,'search-universal-search--symbol');
  const dialog=page.locator('#hgh-universal-search');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('searchbox')).toBeFocused();
  await expect(page.locator('.code-search')).toBeHidden();
  await expect(dialog.getByRole('option')).toHaveCount(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});

test('keyboard selection and Escape preserve a useful focus path',async({page})=>{
  await story(page,'search-universal-search--symbol');
  const dialog=page.locator('#hgh-universal-search'),input=dialog.getByRole('searchbox');
  await input.press('ArrowDown');
  await expect(dialog.getByRole('option').nth(1)).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  const trigger=page.locator('.hgh-native-search');
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(input).toBeFocused();
});

test('search scopes are compact and discoverable in the inline dropdown',async({page})=>{
  await story(page,'search-universal-search--symbol');
  const dialog=page.locator('#hgh-universal-search'),trigger=dialog.locator('.hgh-search-scope-trigger');
  await expect(trigger).toHaveAttribute('data-scope-value','repo');
  for(const [name,value] of [['ultrabricks','owner'],['Everywhere','global']]){
    await trigger.click();await dialog.getByRole('menuitemradio',{name,exact:true}).click();
    await expect(trigger).toHaveAttribute('data-scope-value',value);await expect(dialog.getByRole('searchbox')).toBeFocused();
  }
});

test('AST, file and backend error states explain themselves',async({page})=>{
  await story(page,'search-universal-search--ast-structure');
  await expect(page.getByRole('status')).toContainText('AST');
  await expect(page.getByRole('option')).toContainText('structure');
  await story(page,'search-universal-search--file-name');
  await expect(page.getByRole('status')).toContainText('FILE');
  await story(page,'search-universal-search--error');
  await expect(page.getByRole('status')).toContainText('temporarily unavailable');
  await expect(page.locator('.code-search')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-hgh-search-mounted','true');
});

test('dark search retains readable surface and pixel regression',async({page})=>{
  await story(page,'search-universal-search--dark');
  const dialog=page.locator('#hgh-universal-search');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveScreenshot('universal-search-dark.png');
});

test('light search pixel regression',async({page})=>{
  await story(page,'search-universal-search--symbol');
  await expect(page.locator('#hgh-universal-search')).toHaveScreenshot('universal-search-light.png');
});


test('repository hit is rendered as repository, never as an empty file',async({page})=>{
  await story(page,'search-universal-search--repository-name');
  const option=page.getByRole('option');
  await expect(option).toContainText('ultrabricks/forgejo-search');
  await expect(option).toContainText('Repository · main');
  await expect(option).not.toContainText('line 0');
  expect(new URL(await option.getAttribute('href')).pathname).toBe('/ultrabricks/forgejo-search');
});


test('malicious result URLs, lines and owner labels never become DOM or navigation',async({page})=>{
  const dialogs=[];
  page.on('dialog',dialog=>{dialogs.push(dialog.message());dialog.dismiss();});
  await story(page,'search-universal-search--malicious-payload');
  const search=page.locator('#hgh-universal-search');
  await expect(search).toBeVisible();
  await expect(search.getByRole('option')).toHaveCount(0);
  await expect(search.locator('img')).toHaveCount(0);
  await expect(search).toContainText('<img src=x onerror=alert(1)>');
  expect(dialogs).toEqual([]);
  expect(await search.evaluate(node=>[...node.querySelectorAll('a')].every(a=>a.origin===location.origin))).toBe(true);
});


test('401 keeps universal header search as the sole visible search entry point',async({page})=>{
  await story(page,'search-universal-search--auth-required');
  const dialog=page.locator('#hgh-universal-search');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('Sign in');
  await expect(page.locator('.code-search')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-hgh-search-mounted','true');
  expect(await page.locator('html').getAttribute('data-hgh-search-ready')).toBeNull();
});

test('Russian UI is localized and restore returns the original native label',async({page})=>{
  await story(page,'search-universal-search--russian');
  const dialog=page.locator('#hgh-universal-search');
  await expect(dialog.getByRole('searchbox')).toHaveAttribute('placeholder','Искать код, символы, файлы…');
  await dialog.locator('.hgh-search-scope-trigger').click();
  await expect(dialog.getByRole('menuitemradio',{name:'Этот репозиторий'})).toBeVisible();
  await story(page,'search-universal-search--restored-russian');
  await expect(page.locator('#hgh-universal-search')).toHaveCount(0);
  await expect(page.locator('.hgh-native-search')).toHaveAttribute('aria-label','Поиск репозиториев');
  await expect(page.locator('.code-search')).toBeVisible();
  await page.waitForTimeout(50);
  expect(await page.locator('html').getAttribute('data-hgh-search-ready')).toBeNull();
  expect(await page.locator('html').getAttribute('data-hgh-search-mounted')).toBeNull();
});

test('arrow keys wrap and scope click issues a scoped re-search',async({page})=>{
  await story(page,'search-universal-search--symbol');
  const dialog=page.locator('#hgh-universal-search'),input=dialog.getByRole('searchbox');
  await input.press('ArrowUp');
  await expect(dialog.getByRole('option').nth(1)).toHaveAttribute('aria-selected','true');
  await input.press('ArrowDown');
  await expect(dialog.getByRole('option').nth(0)).toHaveAttribute('aria-selected','true');
  await dialog.locator('.hgh-search-scope-trigger').click();
  await dialog.getByRole('menuitemradio',{name:'ultrabricks'}).click();
  await expect.poll(()=>page.locator('body').getAttribute('data-last-search-url')).toContain('owner%3Aultrabricks');
});

test('Enter navigates to the selected same-origin search result',async({page})=>{
  await story(page,'search-universal-search--symbol');
  const input=page.locator('#hgh-universal-search').getByRole('searchbox');
  await input.press('Enter');
  await page.waitForURL(url=>url.pathname.includes('/ultrabricks/forgejo-github-skin/src/branch/main/src/skin.mjs'));
  expect(page.url()).toContain('#L136');
});

test('mark highlighting cannot unescape executable HTML',async({page})=>{
  await story(page,'search-universal-search--mark-safety');
  const dialog=page.locator('#hgh-universal-search');
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await expect(dialog.locator('script,img')).toHaveCount(0);
  await expect(dialog).toContainText('<script>alert(1)</script>');
});

for(const id of ['many-results-native-type','many-results-native-type-dark']){
  test(`${id}: kinds stay whole words and inline scope keeps full height while only results scroll`,async({page})=>{
    await story(page,'search-universal-search--'+id);
    await expect(page.locator('#hgh-universal-search').getByRole('option')).toHaveCount(30);
    const report=await page.evaluate(()=>{
      const dialog=document.querySelector('#hgh-universal-search'),scopes=dialog.querySelector('.hgh-search-scope-trigger');
      const lines=node=>{const range=document.createRange();range.selectNodeContents(node);return new Set([...range.getClientRects()].filter(r=>r.width>0).map(r=>Math.round(r.top))).size;};
      const scrollable=value=>value==='auto'||value==='scroll';
      return {
        splitKinds:[...dialog.querySelectorAll('.hgh-search-kind')].filter(pill=>lines(pill)!==1||pill.scrollWidth>pill.clientWidth).map(pill=>pill.textContent),
        clippedScopes:scopes.scrollHeight>scopes.clientHeight||[...scopes.children].some(button=>button.getBoundingClientRect().bottom>scopes.getBoundingClientRect().bottom+0.5),
        scrollers:[dialog,...dialog.querySelectorAll('*')].filter(node=>{const style=getComputedStyle(node);return (scrollable(style.overflowY)&&node.scrollHeight>node.clientHeight+1)||(scrollable(style.overflowX)&&node.scrollWidth>node.clientWidth+1);}).map(node=>node.className),
        overflow:document.documentElement.scrollWidth-innerWidth,
      };
    });
    expect(report.splitKinds).toEqual([]);
    expect(report.clippedScopes).toBe(false);
    expect(report.scrollers).toEqual(['hgh-search-results']);
    expect(report.overflow).toBeLessThanOrEqual(1);
  });
}

test('an instance opt-out leaves the native search as the only entry point',async({page})=>{
  await story(page,'search-universal-search--instance-opt-out');
  await expect(page.locator('.code-search')).toBeVisible();
  await expect(page.locator('.hgh-global-search-trigger')).toHaveCount(0);
  await expect(page.locator('#hgh-universal-search')).toHaveCount(0);
  expect(await page.locator('html').getAttribute('data-hgh-search-mounted')).toBeNull();
});
