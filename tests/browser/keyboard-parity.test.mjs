/** Browser contracts for skin shortcut safety; fixture DOM is not native review proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import {loadPlaywright} from '../../scripts/playwright.mjs';
const {chromium} = await loadPlaywright();

const root = new URL('../../', import.meta.url);
let server, browser, base;
test.before(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/src/')) {
      res.setHeader('Content-Type', 'text/javascript');
      return res.end(await fs.readFile(new URL('.' + url.pathname, root)));
    }
    if (url.pathname.startsWith('/assets/')) {
      res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
      if (url.pathname.includes('/theme-forgejo-')) return res.end('');
      try { return res.end(await fs.readFile(new URL('./dist/public' + url.pathname, root))); }
      catch { res.writeHead(404); return res.end(); }
    }
    if (url.pathname === '/api/hypersearch') {
      res.writeHead(503); return res.end();
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html data-theme="hypergithub-light"><head><link rel="stylesheet" href="/assets/css/theme-hypergithub-light.css"></head><body>
      <nav id="navbar"><a href="/notifications">Notifications</a></nav>
      <main class="page-content repository issue-list">
        <div class="secondary-nav"><div class="overflow-menu-items"><a class="item" href="/lab/repo/issues">Issues</a></div></div>
        <div class="repo-button-row"><div class="js-branch-tag-selector"><button class="branch-dropdown-button">main</button></div><div class="clone-panel"><input aria-label="Clone URL" readonly value="https://example.invalid/lab/repo"></div><div class="button-sequence"><a href="/lab/repo/find/branch/feature%2Fkeyboard">Find a file</a></div></div>
        <label>Comment<textarea></textarea></label>
        <fieldset disabled><div class="label-filter dropdown" tabindex="0">Labels</div></fieldset>
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

async function freezePrefixClockAndObserveNavigation(page) {
  await page.clock.install({time: new Date('2026-10-01T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-10-01T01:00:00Z'));
  await page.evaluate(() => {
    window.navigationAttempts = [];
    navigation.addEventListener('navigate', event => {
      if (new URL(event.destination.url).pathname !== '/notifications') return;
      window.navigationAttempts.push(event.destination.url);
      event.preventDefault();
    });
  });
}

test('create shortcut cannot invent a route when create permission is absent or disabled', async t => {
  const page = await pageFor(t);
  for (const state of ['disabled', 'hidden', 'inert', 'disabled ancestor', 'absent']) {
    await page.locator('.issue-list-new').evaluate((el, state) => {
      el.classList.remove('disabled');
      el.removeAttribute('aria-disabled');
      el.parentElement.removeAttribute('aria-disabled');
      el.hidden = state === 'hidden';
      el.inert = state === 'inert';
      if (state === 'disabled') el.setAttribute('aria-disabled', 'true');
      if (state === 'disabled ancestor') el.parentElement.setAttribute('aria-disabled', 'true');
      if (state === 'absent') el.remove();
    }, state);
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
  assert.ok(!commands.includes('l'), 'disabled ancestor blocks the native label filter');
});

for (const interruption of ['Escape', 'typing', 'composition', 'modal', 'modifier', 'hash', 'history', 'pointer', 'HTMX', 'handled', 'repeat']) {
  test(`navigation prefix is cancelled by ${interruption}`, async t => {
    const page = await pageFor(t);
    await freezePrefixClockAndObserveNavigation(page);
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
    if (interruption === 'hash') await page.evaluate(() => new Promise(resolve => {
      window.addEventListener('hashchange', resolve, {once:true});
      location.hash = 'comment-42';
    }));
    if (interruption === 'history') await page.evaluate(() => {
      history.pushState({}, '', '#temporary');
      return new Promise(resolve => {
        window.addEventListener('popstate', resolve, {once:true});
        history.back();
      });
    });
    // A native file-line click only calls history.pushState (Forgejo repo-code.ts): no hashchange, no popstate.
    if (interruption === 'pointer') {
      await page.evaluate(() => {
        document.querySelector('main').insertAdjacentHTML('beforeend', '<table><tr><td class="lines-num"><span id="L3" data-line-number="3" style="display:inline-block;width:24px;height:16px"></span></td></tr></table>');
        document.addEventListener('click', event => { if (event.target.matches('.lines-num span')) history.pushState(null, null, '#' + event.target.id); });
      });
      await page.locator('#L3').click();
      assert.equal(new URL(page.url()).hash, '#L3');
    }
    if (interruption === 'HTMX') await page.evaluate(() => document.dispatchEvent(new Event('htmx:beforeSwap')));
    if (interruption === 'handled' || interruption === 'repeat') await page.evaluate(interruption => {
      const event = new KeyboardEvent('keydown', {key:'x', bubbles:true, cancelable:true, repeat:interruption==='repeat'});
      if (interruption === 'handled') event.preventDefault();
      document.dispatchEvent(event);
    }, interruption);
    await page.keyboard.press('n');
    assert.deepEqual(await page.evaluate(() => window.navigationAttempts), []);
  });
}

test('navigation prefix works before its deadline and expires at one second', async t => {
  const page = await pageFor(t);
  await freezePrefixClockAndObserveNavigation(page);
  await page.keyboard.press('g');
  await page.clock.runFor(999);
  await page.keyboard.press('n');
  assert.deepEqual(await page.evaluate(() => window.navigationAttempts), [base + '/notifications']);
  await page.keyboard.press('g');
  await page.clock.runFor(1000);
  await page.keyboard.press('n');
  assert.deepEqual(await page.evaluate(() => window.navigationAttempts), [base + '/notifications']);
});

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
  await page.locator('.hgh-clone').evaluate(menu => { menu.open = true; });
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

test('Escape inside a native modal dropdown remains owned by the dialog', async t => {
  const page = await pageFor(t);
  await page.evaluate(() => {
    const dialog = document.querySelector('#native');
    dialog.innerHTML = '<div class="select-label dropdown" tabindex="0">Labels<div class="menu visible"><input aria-label="Filter labels"></div></div>';
    window.nativeCancels = 0;
    window.dropdownClicks = 0;
    dialog.addEventListener('cancel', () => { window.nativeCancels++; });
    dialog.querySelector('.dropdown').addEventListener('click', () => { window.dropdownClicks++; });
    dialog.showModal();
    dialog.querySelector('input').focus();
  });
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.nativeCancels), 1);
  assert.equal(await page.locator('#native').evaluate(dialog => dialog.open), false);
  assert.equal(await page.evaluate(() => window.dropdownClicks), 0);
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

test('mobile help includes reachable file actions without opening the collapsed disclosure', async t => {
  const page = await pageFor(t);
  await page.setViewportSize({width:390,height:844});
  const menu = page.locator('.hgh-repo-more');
  await menu.waitFor({state:'visible'});
  assert.equal(await menu.evaluate(el => el.open), false);
  await page.keyboard.press('?');
  assert.ok((await page.locator('#hgh-help dt').allTextContents()).includes('t'));
  assert.equal(await menu.evaluate(el => el.open), false);
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  await page.waitForURL('**/find/branch/feature%2Fkeyboard');
});

test('collapsed file actions do not advertise or activate unusable native links', async t => {
  const page = await pageFor(t);
  await page.setViewportSize({width:390,height:844});
  const menu = page.locator('.hgh-repo-more');
  await menu.waitFor({state:'visible'});
  for (const state of ['hidden', 'inert', 'disabled', 'css-hidden', 'disabled-trigger']) {
    await page.locator('a[href*="/find/"]').evaluate((el, state) => {
      el.hidden = state === 'hidden';
      el.inert = state === 'inert';
      el.setAttribute('aria-disabled', String(state === 'disabled'));
      el.style.display = state === 'css-hidden' ? 'none' : '';
      el.closest('details').querySelector('summary').setAttribute('aria-disabled', String(state === 'disabled-trigger'));
    }, state);
    await page.keyboard.press('?');
    assert.ok(!(await page.locator('#hgh-help dt').allTextContents()).includes('t'), state);
    await page.keyboard.press('Escape');
    await page.keyboard.press('t');
    assert.equal(new URL(page.url()).pathname, '/lab/repo/issues', state);
    assert.equal(await menu.evaluate(el => el.open), false, state);
  }
});

test('help finds a rendered line after collapsed code and omits fully collapsed code', async t => {
  const page = await pageFor(t);
  await page.evaluate(() => {
    const code = document.createElement('section');
    code.innerHTML = '<div style="display:none"><span data-line-number="1">collapsed</span></div><div id="rendered-line"><span data-line-number="2">rendered</span></div>';
    document.querySelector('main').append(code);
  });
  await page.keyboard.press('?');
  assert.ok((await page.locator('#hgh-help dt').allTextContents()).includes('l'));
  await page.keyboard.press('Escape');
  await page.locator('#rendered-line').evaluate(line => { line.hidden = true; });
  await page.keyboard.press('?');
  assert.ok(!(await page.locator('#hgh-help dt').allTextContents()).includes('l'));
  await page.keyboard.press('Escape');
  await page.keyboard.press('l');
  assert.equal(await page.locator('#hgh-line[open]').count(), 0);
});

test('native modal inside an inert wrapper retains shortcut ownership', async t => {
  const page = await pageFor(t);
  await page.evaluate(() => {
    const wrapper = document.createElement('div');
    wrapper.inert = true;
    document.body.append(wrapper);
    const dialog = document.querySelector('#native');
    wrapper.append(dialog);
    dialog.showModal();
    dialog.querySelector('button').focus();
  });
  assert.equal(await page.locator('#native button').evaluate(button => button === document.activeElement), true);
  await page.keyboard.press('?');
  assert.equal(await page.locator('#hgh-help[open]').count(), 0);
  assert.equal(await page.locator('#native button').evaluate(button => button === document.activeElement), true);
});

test('native input Escape consumers keep their dropdown and outer disclosure', async t => {
  const page = await pageFor(t);
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(async () => {
    const {createListOptions} = await import('/src/list-options.mjs');
    const {details, panel} = createListOptions(document);
    details.classList.add('native-owner-proof');
    panel.innerHTML = '<div class="select-label dropdown" tabindex="0">Labels<div class="menu visible"><input aria-label="Native filter"></div><button id="native-focus-choice">Native action</button></div>';
    document.querySelector('main').append(details);
    details.open = true;
    window.consumerRuns = 0;
    window.dropdownClicks = 0;
    panel.querySelector('.dropdown').addEventListener('click', () => { window.dropdownClicks++; });
    panel.querySelector('input').addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      window.consumerRuns++;
      if (window.escapeMode === 'move') {
        event.preventDefault();
        panel.querySelector('.menu').hidden = true;
        panel.querySelector('#native-focus-choice').focus();
      } else if (window.escapeMode === 'prevent') event.preventDefault();
      else event.stopPropagation();
    });
  });
  await page.waitForFunction(() => document.querySelector('.native-owner-proof > summary').getAttribute('aria-expanded') === 'true');
  const input = page.getByLabel('Native filter');
  for (const mode of ['prevent', 'stop', 'move']) {
    await page.evaluate(mode => { window.escapeMode = mode; }, mode);
    await input.focus();
    await page.keyboard.press('Escape');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('.native-owner-proof').evaluate(details => details.open), true);
    assert.equal(await page.evaluate(() => window.dropdownClicks), 0);
    const expectedFocus = mode === 'move' ? page.locator('#native-focus-choice') : input;
    assert.equal(await expectedFocus.evaluate(control => control === document.activeElement), true, mode);
  }
  assert.equal(await page.evaluate(() => window.consumerRuns), 3);
  await page.locator('.native-owner-proof .menu').evaluate(menu => { menu.hidden = true; });
  const trigger = page.locator('.native-owner-proof .dropdown');
  await trigger.focus();
  for (const guard of [{isComposing:true}, {repeat:true}, {ctrlKey:true}, {metaKey:true}, {altKey:true}]) {
    await trigger.evaluate((trigger, guard) => trigger.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true,cancelable:true,...guard})), guard);
    assert.equal(await page.locator('.native-owner-proof').evaluate(details => details.open), true);
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.native-owner-proof').evaluate(details => details.open), false);
  assert.equal(await page.locator('.native-owner-proof > summary').evaluate(summary => summary === document.activeElement), true);
});

test('go-to-line rejects hidden destinations while preserving the open form', async t => {
  const page = await pageFor(t);
  await page.evaluate(() => {
    const code = document.createElement('section');
    code.innerHTML = '<div hidden><span id="L1" data-line-number="1">collapsed</span></div><span id="L2" data-line-number="2">rendered</span>';
    document.querySelector('main').append(code);
  });
  await page.keyboard.press('l');
  const dialog = page.locator('#hgh-line');
  await dialog.getByLabel('Line number').fill('1');
  await dialog.getByRole('button', {name:'Go',exact:true}).click();
  assert.equal(await dialog.evaluate(dialog => dialog.open), true);
  assert.equal(new URL(page.url()).hash, '');
  await dialog.getByLabel('Line number').fill('2');
  await dialog.getByRole('button', {name:'Go',exact:true}).click();
  assert.equal(await dialog.evaluate(dialog => dialog.open), false);
  assert.equal(new URL(page.url()).hash, '#L2');
});

test('help advertises the focused branch selector but not an ambiguous pair', async t => {
  const page = await pageFor(t);
  await page.evaluate(() => {
    const second = document.createElement('div');
    second.className = 'js-branch-tag-selector';
    second.innerHTML = '<button id="second-branch" class="branch-dropdown-button">compare</button>';
    document.querySelector('main').append(second);
  });
  await page.locator('#invoker').focus();
  await page.keyboard.press('?');
  assert.ok(!(await page.locator('#hgh-help dt').allTextContents()).includes('w'));
  await page.keyboard.press('Escape');
  await page.locator('#second-branch').focus();
  await page.keyboard.press('?');
  assert.ok((await page.locator('#hgh-help dt').allTextContents()).includes('w'));
});

test('Escape dismisses the outer disclosure when its flagged-visible menu is unavailable', async t => {
  const page = await pageFor(t);
  await page.evaluate(async () => {
    const {createListOptions} = await import('/src/list-options.mjs');
    const {details, panel} = createListOptions(document);
    details.id = 'unavailable-menu-proof';
    panel.innerHTML = '<div class="select-label dropdown" tabindex="0">Labels<div class="menu visible"><input></div></div>';
    document.querySelector('main').append(details);
  });
  for (const state of ['visibility', 'hidden', 'inert']) {
    await page.locator('#unavailable-menu-proof').evaluate((details, state) => {
      const menu = details.querySelector('.menu');
      menu.style.visibility = state === 'visibility' ? 'hidden' : 'visible';
      menu.hidden = state === 'hidden';
      menu.inert = state === 'inert';
      details.open = true;
    }, state);
    await page.waitForFunction(() => document.querySelector('#unavailable-menu-proof > summary').getAttribute('aria-expanded') === 'true');
    await page.locator('#unavailable-menu-proof .dropdown').focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#unavailable-menu-proof').evaluate(details => details.open), false, state);
    assert.equal(await page.locator('#unavailable-menu-proof > summary').evaluate(summary => summary === document.activeElement), true, state);
  }
});
