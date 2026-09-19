import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const module=await fs.readFile(new URL('../../src/list-options.mjs',import.meta.url),'utf8');
const css=await fs.readFile(new URL('../../src/repository-ui.css',import.meta.url),'utf8');
const fixture=`<html lang="en" data-theme="hypergithub-light"><head><meta name="viewport" content="width=device-width"><style>body{margin:16px}#issue-filters{display:flex;justify-content:space-between}.issue-list-toolbar-right{position:relative}.filter.menu{display:flex}.dropdown{padding:8px}.item{border:1px solid #ddd;margin:4px}.issue.list>.item{padding:12px}</style></head><body><main class="page-content repository issue-list"><div id="issue-filters"><div>Open 6</div><div class="issue-list-toolbar-right"><div class="ui secondary filter menu"><button class="list-header-author dropdown" data-native="author">Author</button><button class="label-filter dropdown" data-native="label">Labels</button><button class="list-header-sort dropdown" data-native="sort">Sort</button></div></div></div><div class="issue list"><div class="item">A native row</div></div></main></body></html>`;
test('native grouping retains node identity, delegated handlers and desktop restoration',async({page})=>{
 await page.setContent(fixture);await page.addStyleTag({content:css});
 await page.addScriptTag({content:module.replaceAll('export ','')});
 await page.evaluate(()=>{
  window.nativeSort=document.querySelector('[data-native=sort]');window.nativeHits=0;
  document.querySelector('.filter.menu').addEventListener('click',event=>{if(event.target.matches('[data-native]'))window.nativeHits++;});
  enhanceNativeListOptions();enhanceNativeListOptions();
 });
 const disclosure=page.locator('[data-hgh-native-options]');await expect(disclosure).toHaveCount(1);
 await disclosure.locator('summary').click();await page.getByRole('button',{name:'Sort',exact:true}).click();
 expect(await page.evaluate(()=>window.nativeHits)).toBe(1);
 expect(await page.evaluate(()=>window.nativeSort===document.querySelector('[data-native=sort]'))).toBe(true);
 await page.locator('[name=hgh-density]').selectOption('compact');await expect(page.locator('.page-content')).toHaveAttribute('data-hgh-density','compact');
 await page.keyboard.press('Escape');await expect(disclosure).not.toHaveAttribute('open','');
 await page.setViewportSize({width:1280,height:956});await expect(disclosure).toBeHidden();
 await expect(page.locator('.issue-list-toolbar-right > .filter.menu > [data-native=sort]')).toBeVisible();
 await page.evaluate(()=>restoreNativeListOptions());await expect(disclosure).toHaveCount(0);
 expect(await page.evaluate(()=>window.nativeSort===document.querySelector('[data-native=sort]'))).toBe(true);
});
