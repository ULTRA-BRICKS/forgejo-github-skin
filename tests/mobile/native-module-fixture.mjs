// Serves a native-shaped fixture and the repository's real ES modules from one synthetic origin,
// so specs load production modules exactly as browsers do (local imports included) instead of
// stripping keywords from source text and evaluating it as a classic script.
import fs from 'node:fs/promises';

const origin='https://native-modules.test';
const modulePath=/^\/src\/[\w-]+\.mjs$/;

export async function openNativeFixture(page,html){
  await page.route(origin+'/**',async route=>{
    const {pathname}=new URL(route.request().url());
    if(modulePath.test(pathname))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(new URL('../..'+pathname,import.meta.url),'utf8')});
    return route.fulfill({contentType:'text/html',body:html});
  });
  await page.goto(origin+'/');
}

/** Imports src modules in the page and exposes their exports as globals for page.evaluate callers. */
export async function exposeModules(page,...names){
  await page.evaluate(async names=>{for(const name of names)Object.assign(window,await import('/src/'+name));},names);
}
