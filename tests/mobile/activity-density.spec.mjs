import {test, expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {appearances, applyAppearance, captureProof} from './organization-proof.mjs';

// Native activity markup drives the production enhancer; only the document is a fixture.
const core = (await fs.readFile(new URL('../../src/core.mjs', import.meta.url), 'utf8')).replaceAll('export ', '');
const organization = (await fs.readFile(new URL('../../src/organization.mjs', import.meta.url), 'utf8')).replace(/^import.*$/mg, '').replaceAll('export ', '');
const css = await fs.readFile(new URL('../../src/organization.css', import.meta.url), 'utf8');
const image = '<img alt="Pasted screenshot" width="900" height="600" src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27900%27 height=%27600%27%3E%3Crect width=%27900%27 height=%27600%27 fill=%27red%27/%3E%3C/svg%3E">';

async function prepare(page, {personal = false, body = image + '<p>Screenshot context</p>', bodyStyle = ''} = {}) {
  await page.route('https://density.test/**', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html data-theme="hypergithub-light"><head><style>${css}
body{margin:0;font:14px/20px Arial;--hgh-color-canvas:#fff;--hgh-color-text:#1f2328;--hgh-color-muted:#59636e;--hgh-color-border:#d1d9e0}.flex-item{display:flex;gap:8px}.flex-item-main{min-width:0;flex:1}.markup{line-height:20px}.markup p{margin:0}img{max-width:100%}</style></head><body>
<div class="page-content dashboard feeds"><div class="secondary-nav">${personal ? '' : '<div class="right menu"></div>'}</div>
<div class="ui container flex-container"><div class="flex-container-main"><div id="activity-feed" class="flex-list"><div class="flex-item"><div class="flex-item-main"><div>Alex commented on an issue</div><div class="markup" style="${bodyStyle}">${body}</div></div><div class="flex-item-trailing"><svg width="48" height="48"></svg></div></div></div></div><div id="dashboard-repo-list" class="flex-container-sidebar"></div></div></div></body></html>`}));
  await page.goto('https://density.test/');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => window.enhanceOrganization());
}

for (const personal of [false, true]) {
  test(`${personal ? 'personal' : 'organization'} activity clips image-first comments completely before disclosure`, async ({page}) => {
    await prepare(page, {personal});
    const toggle = page.getByRole('button', {name: /^Show (more|less)$/});
    await expect(toggle).toBeVisible();
    await expect(page.locator('.markup img')).toBeHidden();
    await expect(page.locator('#activity-feed .flex-item-trailing svg')).toHaveCSS('width', '16px');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.markup img')).toBeVisible();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.markup img')).toBeHidden();
    await page.evaluate(() => window.enhanceOrganization());
    await expect(page.locator('.hgh-org-toggle')).toHaveCount(1);
  });
}

test('four-line comments disclose after three lines and preserve original links through re-enhancement', async ({page}) => {
  await prepare(page, {body: '<p>First line<br>Second line<br>Third line<br><a href="/original">Fourth line link</a></p>'});
  const toggle = page.getByRole('button', {name: /^Show (more|less)$/});
  await expect(toggle).toBeVisible();
  expect(await page.locator('.markup').evaluate(node => node.getBoundingClientRect().height)).toBeLessThanOrEqual(60);
  await page.locator('.markup a').evaluate(node => node.focus());
  await expect(page.locator('.markup a')).not.toBeFocused();
  await toggle.click();
  await expect(page.locator('.markup a')).toHaveAttribute('href', '/original');
  await page.locator('.markup a').focus();
  await expect(page.locator('.markup a')).toBeFocused();
  await page.evaluate(() => window.enhanceOrganization());
  await expect(page.locator('.hgh-org-toggle')).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

test('new native activity rows receive disclosures on re-enhancement without resetting existing disclosures', async ({page}) => {
  await prepare(page);
  await page.getByRole('button', {name: 'Show more'}).click();
  await page.evaluate(() => {
    const row = document.querySelector('#activity-feed .flex-item');
    const added = document.createElement('div');
    added.className = 'flex-item';
    added.innerHTML = '<div class="flex-item-main"><div class="markup"><p>One<br>Two<br>Three<br>Four</p></div></div>';
    row.after(added);
    window.enhanceOrganization();
  });
  await expect(page.locator('.hgh-org-toggle')).toHaveCount(2);
  await expect(page.locator('.hgh-org-toggle').first()).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.hgh-org-toggle').last()).toHaveAttribute('aria-expanded', 'false');
});

test('collapsed attachment controls and clipped links are inaccessible, while visible links and native inert state survive teardown', async ({page}) => {
  await prepare(page, {personal: true, body: '<p><a href="/visible">Visible link</a><br>Second line<br>Third line<br><a href="/clipped">Clipped link</a></p><a href="/picture">' + image + '</a><a download href="/archive">Download attachment</a><video controls width="900" height="600"></video><a inert href="/native">Native inert link</a>'});
  const visible = page.locator('a[href="/visible"]');
  await visible.focus();
  await expect(visible).toBeFocused();
  for (const href of ['/clipped', '/picture', '/archive', '/native']) {
    await page.locator(`a[href="${href}"]`).evaluate(node => node.focus());
    await expect(visible).toBeFocused();
  }
  await expect(page.locator('.markup video')).toBeHidden();
  await page.getByRole('button', {name: 'Show more'}).click();
  await page.locator('a[href="/picture"]').focus();
  await expect(page.locator('a[href="/picture"]')).toBeFocused();
  await expect(page.locator('.markup video')).toBeVisible();
  await page.evaluate(() => window.restoreOrganization());
  await expect(page.locator('.hgh-org-toggle')).toHaveCount(0);
  await expect(page.locator('a[href="/native"]')).toHaveAttribute('inert', '');
  await page.locator('a[href="/clipped"]').focus();
  await expect(page.locator('a[href="/clipped"]')).toBeFocused();
  await expect(page.locator('#activity-feed .flex-item-trailing svg')).toHaveAttribute('width', '48');
});

for (const appearance of appearances) {
  test(`activity disclosure proof ${appearance.scheme} ${appearance.motion}`, async ({page}, testInfo) => {
    await prepare(page, {body: image + '<p>' + 'A long issue comment with a link and preserved context. '.repeat(10) + '<a href="/original">Original comment</a></p>'});
    await applyAppearance(page, appearance);
    const toggle = page.getByRole('button', {name: /^Show (more|less)$/});
    await expect(page.locator('.markup img')).toBeHidden();
    expect(await page.locator('.markup').evaluate(node => node.getBoundingClientRect().height)).toBeLessThanOrEqual(60);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureProof(page, testInfo, 'collapsed');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.markup img')).toBeVisible();
    await page.evaluate(() => window.enhanceOrganization());
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureProof(page, testInfo, 'expanded');
  });
}

test('native paragraph margins do not consume the three-line comment preview', async ({page}) => {
  await prepare(page, {body: '<p>First line<br>Second line<br>Third line<br>Fourth line</p>'});
  await page.addStyleTag({content: '.markup p{margin:1em 0}'});
  const inset = await page.locator('.markup').evaluate(body => body.firstElementChild.getBoundingClientRect().top - body.getBoundingClientRect().top);
  expect(inset).toBe(0);
  expect(await page.locator('.markup').evaluate(body => body.getBoundingClientRect().height)).toBe(60);
});

test('visible link text remains interactive when its inline image is collapsed', async ({page}) => {
  await prepare(page, {body: `<a href="/discussion">Read discussion${image}</a>`});
  const link = page.getByRole('link', {name: 'Read discussion'});
  await expect(link).toBeVisible();
  await link.focus();
  await expect(link).toBeFocused();
  await expect(page.locator('.markup img')).toBeHidden();
});

test('native text comments loaded in the hidden repository view disclose on Overview', async ({page}) => {
  await prepare(page, {body: '<p>First<br>Second<br>Third<br>Fourth<br>Fifth</p>'});
  await page.evaluate(() => {
    window.restoreOrganization();
    history.replaceState(null, '', '#repos');
    window.enhanceOrganization();
  });
  await page.getByRole('link', {name: 'Overview', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Show more'})).toBeVisible();
  expect(await page.locator('.markup').evaluate(body => body.getBoundingClientRect().height)).toBe(60);
});

test('a newly loaded enhancer instance does not duplicate an existing disclosure', async ({page}) => {
  await prepare(page);
  await page.addScriptTag({content: `(() => {${organization}\nenhanceOrganization();})()`});
  await expect(page.getByRole('button', {name: 'Show more'})).toHaveCount(1);
  await page.getByRole('button', {name: 'Show more'}).click();
  await expect(page.locator('.markup img')).toBeVisible();
});

test('editing and removing a text node in one batch still discloses its replacement', async ({page}) => {
  await prepare(page, {body: 'Short comment'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    const body = document.querySelector('.markup');
    body.firstChild.data = 'Changed';
    body.textContent = 'A long replacement comment. '.repeat(80);
  });
  await expect(page.getByRole('button', {name: 'Show more'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('replacing comment bodies releases obsolete disclosures and restores removed native rows', async ({page}) => {
  await prepare(page);
  for (let i = 0; i < 3; i++) {
    await page.locator('.markup').evaluate(body => {
      window.oldBodies ??= [];
      window.oldBodies.push(body);
      body.outerHTML = '<div class="markup">' + 'Replacement comment. '.repeat(80) + '</div>';
    });
    await expect(page.getByRole('button', {name: 'Show more'})).toHaveCount(1);
  }
  expect(await page.evaluate(() => window.oldBodies.every(body => !body.hasAttribute('data-hgh-collapsible') && !body.classList.contains('hgh-org-clamped')))).toBe(true);
  await page.getByRole('button', {name: 'Show more'}).click();
  await expect(page.locator('.markup')).not.toHaveClass(/hgh-org-clamped/);
  await page.evaluate(() => {
    window.removedRow = document.querySelector('#activity-feed > .flex-item');
    window.removedRow.remove();
  });
  await expect.poll(() => page.evaluate(() => window.removedRow.querySelector('svg').getAttribute('width'))).toBe('48');
  expect(await page.evaluate(() => window.removedRow.querySelector('.hgh-org-toggle'))).toBeNull();
  await page.evaluate(() => document.querySelector('#activity-feed').append(window.removedRow));
  await expect(page.getByRole('button', {name: 'Show more'})).toBeVisible();
  await expect(page.locator('.markup')).toHaveClass(/hgh-org-clamped/);
  await expect(page.locator('#activity-feed svg')).toHaveAttribute('width', '16');
});

test('replaced clipped descendants regain native focusability outside the disclosure', async ({page}) => {
  await prepare(page, {body: '<p>First<br>Second<br>Third<br><a href="/original">Clipped discussion</a></p>'});
  await expect(page.locator('.markup a')).toHaveJSProperty('inert', true);
  await page.evaluate(() => {
    window.removedLink = document.querySelector('.markup a');
    document.querySelector('.markup').innerHTML = '<p>First<br>Second<br>Third<br><a href="/replacement">Replacement discussion</a></p>';
    document.body.append(window.removedLink);
  });
  await expect(page.locator('a[href="/replacement"]')).toHaveJSProperty('inert', true);
  await expect(page.locator('a[href="/original"]')).toHaveJSProperty('inert', false);
  await page.locator('a[href="/original"]').focus();
  await expect(page.locator('a[href="/original"]')).toBeFocused();
});

test('a linked-image-only comment has no invisible keyboard target before expansion', async ({page}) => {
  await prepare(page, {body: '<p><a href="/attachment">' + image + '</a></p>'});
  const link = page.locator('a[href="/attachment"]');
  await expect(link).toHaveJSProperty('inert', true);
  await link.evaluate(node => node.focus());
  await expect(link).not.toBeFocused();
  await page.getByRole('button', {name: 'Show more'}).click();
  await expect(link).toHaveJSProperty('inert', false);
  await expect(link.locator('img')).toBeVisible();
});

test('a clipped control moved from a later row to an earlier row remains protected', async ({page}) => {
  await prepare(page, {body: '<p>First<br>Second<br>Third<br>Fourth<br>Fifth</p>'});
  await page.evaluate(() => {
    const row = document.createElement('div');
    row.className = 'flex-item';
    row.innerHTML = '<div class="flex-item-main"><div class="markup"><p>First<br>Second<br>Third<br><a href="/moved">Clipped discussion</a><br>Fifth</p></div></div>';
    document.querySelector('#activity-feed').append(row);
    window.enhanceOrganization();
  });
  const moved = page.locator('a[href="/moved"]');
  await expect(moved).toHaveJSProperty('inert', true);
  await page.evaluate(async () => {
    document.querySelector('.markup p').append(document.querySelector('a[href="/moved"]'));
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  await expect(moved).toHaveJSProperty('inert', true);
  await moved.evaluate(node => node.focus());
  await expect(moved).not.toBeFocused();
  await page.getByRole('button', {name: 'Show more'}).first().click();
  await expect(moved).toHaveJSProperty('inert', false);
  await moved.focus();
  await expect(moved).toBeFocused();
});

test('native details toggles refresh clipped and newly visible links without changing the preview height', async ({page}) => {
  await prepare(page, {body: '<details><summary>Details</summary><p><a href="/inside">Detail link</a></p></details><p>Second<br><a href="/shifted">Third link</a><br>Fourth</p>'});
  const shifted = page.locator('a[href="/shifted"]');
  const inside = page.locator('a[href="/inside"]');
  await expect(shifted).toHaveJSProperty('inert', false);
  const height = await page.locator('.markup').evaluate(body => body.getBoundingClientRect().height);
  await page.locator('summary').click();
  await expect(shifted).toHaveJSProperty('inert', true);
  await expect(inside).toHaveJSProperty('inert', false);
  await inside.focus();
  await expect(inside).toBeFocused();
  expect(await page.locator('.markup').evaluate(body => body.getBoundingClientRect().height)).toBe(height);
});

test('a short comment gets a disclosure when its column narrows at constant feed width', async ({page}) => {
  await prepare(page, {body: 'Alpha beta gamma delta epsilon.'});
  await expect(page.getByRole('button', {name: 'Show more'})).toHaveCount(0);
  const width = await page.locator('#activity-feed').evaluate(feed => feed.getBoundingClientRect().width);
  await page.locator('.flex-item-main').evaluate(main => { main.style.flex = '0 0 70px'; });
  await expect(page.getByRole('button', {name: 'Show more'})).toBeVisible();
  expect(await page.locator('#activity-feed').evaluate(feed => feed.getBoundingClientRect().width)).toBe(width);
});

test('normal line height uses the browser-resolved three-line clip instead of a font-size estimate', async ({page}) => {
  await prepare(page, {bodyStyle: 'font:16px/normal Arial', body: '<p>First<br>Second<br>Third<br><a href="/fourth">Fourth</a></p>'});
  await expect(page.getByRole('button', {name: 'Show more'})).toBeVisible();
  await expect(page.locator('a[href="/fourth"]')).toHaveJSProperty('inert', true);
  await page.getByRole('button', {name: 'Show more'}).click();
  await expect(page.locator('a[href="/fourth"]')).toHaveJSProperty('inert', false);
});

test('a native comment moved to another row keeps its disclosure and expanded state together', async ({page}) => {
  await prepare(page);
  await page.getByRole('button', {name: 'Show more'}).click();
  await page.evaluate(() => {
    const row = document.createElement('div');
    row.className = 'flex-item';
    row.id = 'destination-row';
    row.innerHTML = '<div class="flex-item-main"></div>';
    document.querySelector('#activity-feed').prepend(row);
    row.firstElementChild.append(document.querySelector('.markup'));
  });
  const toggle = page.locator('#destination-row').getByRole('button', {name: 'Show less'});
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#destination-row .markup img')).toBeVisible();
  await toggle.click();
  await expect(page.locator('#destination-row .markup img')).toBeHidden();
  await expect(page.locator('.hgh-org-toggle')).toHaveCount(1);
});

test('retired disclosure controls cannot reapply decorations after restore', async ({page}) => {
  await prepare(page, {personal: true});
  await expect(page.getByRole('button', {name: 'Show more'})).toBeVisible();
  await page.evaluate(() => {
    const retired = document.querySelector('.hgh-org-toggle');
    window.restoreOrganization();
    retired.click();
  });
  await expect(page.locator('.hgh-org-toggle')).toHaveCount(0);
  await expect(page.locator('.markup')).not.toHaveClass(/hgh-org-clamped/);
  await expect(page.locator('.markup img')).toBeVisible();
});

for (const [attribute, value, tag] of [['href', '/discussion', 'a'], ['tabindex', '0', 'span'], ['contenteditable', 'true', 'span']]) {
  test(`adding native ${attribute} protects a newly focusable clipped descendant`, async ({page}) => {
    await prepare(page, {personal: true, body: `<p>First<br>Second<br>Third<br><${tag} id="late-control">Discussion</${tag}></p>`});
    await expect(page.getByRole('button', {name: 'Show more'})).toBeVisible();
    await page.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    const control = page.locator('#late-control');
    await control.evaluate((node, [name, content]) => node.setAttribute(name, content), [attribute, value]);
    await expect(control).toHaveJSProperty('inert', true);
    await control.evaluate(node => node.focus());
    await expect(control).not.toBeFocused();
    await page.getByRole('button', {name: 'Show more'}).click();
    await control.focus();
    await expect(control).toBeFocused();
  });
}

test('removing a feed releases its native content without another enhancement pass', async ({page}) => {
  await prepare(page, {personal: true});
  await expect(page.getByRole('button', {name: 'Show more'})).toBeVisible();
  await page.evaluate(() => {
    window.removedFeed = document.querySelector('#activity-feed');
    window.removedFeed.remove();
  });
  await expect.poll(() => page.evaluate(() => window.removedFeed.querySelector('.hgh-org-toggle') === null)).toBe(true);
  expect(await page.evaluate(() => window.removedFeed.querySelector('.markup').classList.contains('hgh-org-clamped'))).toBe(false);
  await page.evaluate(() => document.body.append(window.removedFeed.querySelector('.markup')));
  await expect(page.locator('.markup img')).toBeVisible();
});
