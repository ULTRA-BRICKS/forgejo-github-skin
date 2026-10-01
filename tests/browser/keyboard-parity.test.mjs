/** Browser contracts for skin shortcut safety; fixture DOM is not native review proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';

const root = new URL('../../', import.meta.url);
let server, browser, base;
test.before(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/src/')) {
      res.setHeader('Content-Type', 'text/javascript');
      return res.end(await fs.readFile(new URL('.' + url.pathname, root)));
    }
    if (url.pathname === '/api/hypersearch') {
      res.writeHead(503); return res.end();
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html data-theme="hypergithub-light"><body>
      <nav id="navbar"><a href="/notifications">Notifications</a></nav>
      <main class="page-content repository issue-list">
        <div class="secondary-nav"><div class="overflow-menu-items"><a class="item" href="/lab/repo/issues">Issues</a></div></div>
        <div class="repo-button-row"><a href="/lab/repo/find/branch/feature%2Fkeyboard">Find a file</a></div>
        <label>Comment<textarea></textarea></label>
        <fieldset disabled><div class="select-label dropdown" tabindex="0">Labels</div></fieldset>
        <a class="issue-list-new disabled" aria-disabled="true" href="/lab/repo/issues/new">New issue</a>
        <div class="list-header-author dropdown" hidden>Author</div>
        <button id="invoker">Open modal</button><dialog id="native"><button>Dismiss</button></dialog>
      </main><script type="module" src="/src/skin.mjs"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
test.after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});
async function pageFor(t) {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.goto(base + '/lab/repo/issues');
  await page.locator('[data-hgh-ready]').waitFor();
  return page;
}

test('create shortcut cannot invent a route when create permission is absent or disabled', async t => {
  const page = await pageFor(t);
  for (const absent of [false, true]) {
    if (absent) await page.locator('.issue-list-new').evaluate(el => el.remove());
    await page.keyboard.press('c');
    await page.waitForTimeout(50);
    assert.equal(new URL(page.url()).pathname, '/lab/repo/issues');
  }
});

test('help omits hidden and disabled commands rather than promising unavailable actions', async t => {
  const page = await pageFor(t);
  await page.keyboard.press('?');
  const commands = await page.locator('#hgh-help dt').allTextContents();
  assert.ok(!commands.includes('c'), 'disabled create is not executable');
  assert.ok(!commands.includes('u'), 'hidden author filter is not executable');
});

for (const interruption of ['Escape', 'typing', 'composition', 'modal', 'modifier', 'hash']) {
  test(`navigation prefix is cancelled by ${interruption}`, async t => {
    const page = await pageFor(t);
    await page.keyboard.press('g');
    if (interruption === 'Escape') await page.keyboard.press('Escape');
    if (interruption === 'typing') {
      await page.locator('textarea').focus();
      await page.keyboard.type('draft');
      await page.locator('textarea').evaluate(el => el.blur());
    }
    if (interruption === 'composition') await page.evaluate(() => document.dispatchEvent(new CompositionEvent('compositionstart', {bubbles:true})));
    if (interruption === 'modal') {
      await page.evaluate(() => document.querySelector('#native').showModal());
      await page.keyboard.press('Escape');
    }
    if (interruption === 'modifier') await page.keyboard.press('Control+x');
    if (interruption === 'hash') await page.evaluate(() => { location.hash = 'comment-42'; });
    await page.keyboard.press('n');
    await page.waitForTimeout(50);
    assert.equal(new URL(page.url()).pathname, '/lab/repo/issues');
  });
}

test('modified question mark does not open help or consume browser chords', async t => {
  const page = await pageFor(t);
  const consumed = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', {key:'?', ctrlKey:true, bubbles:true, cancelable:true});
    document.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(consumed, false);
  assert.equal(await page.locator('#hgh-help[open]').count(), 0);
});

test('Escape does not override composition, handled events or a native modal', async t => {
  const page = await pageFor(t);
  await page.evaluate(() => {
    const menu = document.createElement('details');
    menu.className = 'hgh-clone';
    menu.innerHTML = '<summary>Code</summary><input aria-label="Clone URL">';
    menu.open = true;
    document.querySelector('main').append(menu);
  });
  for (const guard of ['composition', 'handled', 'modal']) {
    await page.evaluate(guard => {
      if (guard === 'modal') document.querySelector('#native').showModal();
      const event = new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true, isComposing:guard==='composition'});
      if (guard === 'handled') event.preventDefault();
      document.dispatchEvent(event);
    }, guard);
    assert.equal(await page.locator('.hgh-clone').evaluate(el => el.open), true, guard);
  }
});

test('allowed navigation works but composing, modified and repeated keys do not navigate', async t => {
  const page = await pageFor(t);
  for (const options of [{isComposing:true}, {repeat:true}, {ctrlKey:true}, {metaKey:true}, {altKey:true}, {shiftKey:true}]) {
    await page.keyboard.press('g');
    await page.evaluate(options => document.dispatchEvent(new KeyboardEvent('keydown', {key:'n',bubbles:true,cancelable:true,...options})), options);
    assert.equal(new URL(page.url()).pathname, '/lab/repo/issues');
  }
  await page.keyboard.press('g');
  await page.keyboard.press('n');
  await page.waitForURL('**/notifications');
});

test('shortcut opt-out preserves drafts and native editor chords', async t => {
  const page = await pageFor(t);
  await page.keyboard.press('?');
  await page.locator('#hgh-help input').uncheck();
  await page.keyboard.press('Escape');
  await page.keyboard.press('g');
  await page.keyboard.press('n');
  assert.equal(new URL(page.url()).pathname, '/lab/repo/issues');
  await page.locator('textarea').fill('Unsaved review draft');
  const consumed = await page.locator('textarea').evaluate(el => {
    const event = new KeyboardEvent('keydown', {key:'Enter', ctrlKey:true, bubbles:true, cancelable:true});
    el.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(consumed, false);
  assert.equal(await page.locator('textarea').inputValue(), 'Unsaved review draft');
});
