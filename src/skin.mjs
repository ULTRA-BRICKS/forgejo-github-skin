import {enhanceUniversalSearch, restoreUniversalSearch, openUniversalSearch} from './universal-search.mjs';
import {enhanceRepositoryControls, restoreRepositoryControls} from './repository-controls.mjs';
import {enhanceNativeChrome, restoreNativeChrome} from './mobile-chrome.mjs';
import {enhanceNativeListOptions, restoreNativeListOptions} from './list-options.mjs';
import {enhancePagination, restorePagination} from './pagination.mjs';
import {enhanceDashboardPagination, restoreDashboardPagination} from './dashboard-pagination.mjs';
import {enhanceOrganization, restoreOrganization} from './organization.mjs';
/** Progressive enhancements only: existing Forgejo links/forms remain authoritative. */
import {themeEnabled, currentThemeStylesheet, acceptKey, safeHref, navigationAction, normalizeLine, isEditable} from './core.mjs';

const BOOT = Symbol.for('hypergithub.bootstrap');
if (!window[BOOT]) {
  window[BOOT] = true;
  boot();
}

function boot() {
  const root = document.documentElement;
  const locale = root.lang?.startsWith('ru') ? 'ru' : 'en';
  const t = (en, ru) => (locale === 'ru' ? ru : en);
  let sequence = '';
  let sequenceTimer;
  let queued = false;
  let shortcuts = true;

  try {
    shortcuts = localStorage.getItem('hypergithub.shortcuts') !== 'off';
  } catch {}

  const enabled = () => themeEnabled(root.dataset.theme);
  function syncReleaseStyles() {
    const href=currentThemeStylesheet(import.meta.url,root.dataset.theme);
    let link=document.head.querySelector('link[data-hgh-release-theme]');
    if(!href){if(link)link.disabled=true;return;}
    if(!link){
      link=document.createElement('link');link.rel='stylesheet';link.dataset.hghReleaseTheme='';
      link.addEventListener('load',()=>{for(const menu of document.querySelectorAll('overflow-menu'))menu.updateItems?.();});
      link.addEventListener('error',()=>console.warn('Current skin stylesheet could not load; native theme remains available'));
      document.head.append(link);
    }
    link.disabled=false;
    if(link.href!==href)link.href=href;
  }

  const visible = (element) => !!element && element.getClientRects().length > 0 && !element.closest('[hidden]');
  const usable = (element) => visible(element) && !element.matches('[disabled],[aria-disabled="true"],.disabled');

  function navigateHref(href) {
    const safe = safeHref(href, location.href);
    if (!safe) return false;
    location.assign(safe);
    return true;
  }

  function navigate(anchor) {
    return usable(anchor) && navigateHref(anchor.href);
  }

  function firstUsable(selector, scope = document) {
    return [...scope.querySelectorAll(selector)].find(usable) ?? null;
  }

  function clickUsable(selector, scope = document) {
    const element = firstUsable(selector, scope);
    if (!element) return false;
    element.click();
    return true;
  }

  function repositoryNav(action) {
    if (action === 'notifications') {
      return firstUsable('a#mobile-notifications-icon[href], #navbar a[href$="/notifications"], a[href$="/notifications"]');
    }

    if (action === 'workflowFile') {
      const view = document.querySelector('#repo-action-view[data-workflow-source-url]');
      return view?.dataset.workflowSourceUrl ?? null;
    }

    const links = [...document.querySelectorAll('.secondary-nav .overflow-menu-items a.item')];
    const iconByAction = new Map([
      ['code', 'octicon-code'],
      ['issues', 'octicon-issue-opened'],
      ['pulls', 'octicon-git-pull-request'],
      ['actions', 'octicon-play'],
      ['discussions', 'octicon-comment-discussion'],
      ['security', 'octicon-shield'],
    ]);
    const icon = iconByAction.get(action);
    const byIcon = icon ? links.find((anchor) => anchor.querySelector(`.${icon}`)) : null;
    if (byIcon) return byIcon;

    const suffixByAction = new Map([
      ['issues', '/issues'],
      ['pulls', '/pulls'],
      ['actions', '/actions'],
      ['discussions', '/discussions'],
      ['security', '/security'],
    ]);
    const suffix = suffixByAction.get(action);
    if (suffix) return links.find((anchor) => new URL(anchor.href).pathname.endsWith(suffix)) ?? null;
    return null;
  }

  function runNavigationAction(action) {
    const target = repositoryNav(action);
    if (typeof target === 'string') return navigateHref(target);
    return navigate(target);
  }

  function closeMenus(restore = false) {
    for (const menu of document.querySelectorAll('details.hgh-clone[open]')) {
      menu.open = false;
      if (restore) menu.querySelector('summary')?.focus();
    }
  }

  function makeDialog(id, title) {
    let dialog = document.getElementById(id);
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = id;
    dialog.className = 'hgh-dialog';
    const heading = document.createElement('h2');
    heading.id = `${id}-title`;
    heading.textContent = title;
    dialog.setAttribute('aria-labelledby', heading.id);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'hgh-close';
    close.textContent = '×';
    close.setAttribute('aria-label', t('Close', 'Закрыть'));
    close.addEventListener('click', () => dialog.close());
    dialog.append(heading, close);
    document.body.append(dialog);
    return dialog;
  }

  function focusBestSearch() { return openUniversalSearch(document); }

  function goToLine() {
    if (!document.querySelector('[data-line-number]')) return false;
    const dialog = makeDialog('hgh-line', t('Go to line', 'Перейти к строке'));
    if (!dialog.querySelector('form')) {
      const form = document.createElement('form');
      const input = document.createElement('input');
      const button = document.createElement('button');
      const message = document.createElement('p');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.pattern = '[1-9][0-9]*';
      input.required = true;
      input.setAttribute('aria-label', t('Line number', 'Номер строки'));
      button.textContent = t('Go', 'Перейти');
      message.setAttribute('role', 'status');
      form.append(input, button, message);
      dialog.append(form);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const number = normalizeLine(input.value);
        const line = number && document.getElementById(`L${number}`);
        if (!line) {
          message.textContent = t('That line does not exist.', 'Такой строки нет.');
          return;
        }
        dialog.close();
        location.hash = `L${number}`;
        line.scrollIntoView({block: 'center'});
      });
    }
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('input').focus();
    return true;
  }

  function openIssueListFilter(selector) {
    const dropdown = firstUsable(selector);
    if (!dropdown) return false;
    dropdown.click();
    const input = firstUsable('input', dropdown);
    input?.focus();
    return true;
  }

  function createIssue() {
    const direct = firstUsable('.page-content.repository.issue-list .issue-list-new:not(.new-pr-button)[href]');
    if (direct) return navigate(direct);
    const issues = repositoryNav('issues');
    if (!issues?.href) return false;
    const url = new URL(issues.href);
    url.pathname = url.pathname.replace(/\/issues\/?$/, '/issues/new');
    return navigateHref(url.href);
  }

  function openFocusedIssue() {
    const focused = document.activeElement?.closest?.('.issue.list > .item, .issue-list .item');
    if (!focused) return false;
    const anchor = firstUsable('a.issue-title[href]', focused);
    return navigate(anchor);
  }

  function permalink() {
    const anchor = firstUsable('a.ui.mini.basic.button[href*="/src/commit/"], a[href*="/src/commit/"][data-kind="permalink"]');
    return navigate(anchor);
  }

  function issueDetailShortcut(key) {
    const selectors = new Map([
      ['q', '.select-reviewers-modify.dropdown'],
      ['m', '.select-milestone.dropdown'],
      ['l', '.select-label.dropdown'],
      ['a', '.select-assignees-modify.dropdown'],
    ]);
    const selector = selectors.get(key);
    return selector ? clickUsable(selector) : false;
  }

  function issueListShortcut(key) {
    const filters = new Map([
      ['u', '.list-header-author.dropdown'],
      ['l', '.label-filter.dropdown'],
      ['m', '.list-header-milestone.dropdown'],
      ['a', '.list-header-assignee.dropdown'],
    ]);
    if (key === 'c') return createIssue();
    if (key === 'o') return openFocusedIssue();
    const selector = filters.get(key);
    return selector ? openIssueListFilter(selector) : false;
  }

  function currentNotification() {
    const active = document.activeElement?.closest?.('.notifications-item');
    if (active) return active;
    return [...document.querySelectorAll('.notifications-item')].find((item) => item.matches(':hover')) ?? null;
  }

  function notificationAction(status) {
    const item = currentNotification();
    if (!item) return false;
    const button = firstUsable(`button[data-status="${status}"]`, item);
    if (!button) return false;
    button.click();
    return true;
  }

  function actionMenuItem(localeDatasetKey) {
    const view = document.getElementById('repo-action-view');
    const label = view?.dataset[localeDatasetKey];
    const gear = firstUsable('.job-gear-dropdown button');
    if (!view || !label || !gear) return false;
    gear.click();
    const clickWhenRendered = (attempt = 0) => {
      const item = [...document.querySelectorAll('.job-gear-dropdown .item')].find((candidate) => visible(candidate) && candidate.textContent.trim().includes(label));
      if (item) {
        item.click();
        return;
      }
      if (attempt < 5) requestAnimationFrame(() => clickWhenRendered(attempt + 1));
    };
    requestAnimationFrame(() => clickWhenRendered());
    return true;
  }

  function actionShortcut(key) {
    if (!document.getElementById('repo-action-view')) return false;
    if (key === 't') return actionMenuItem('localeShowTimestamps');
    if (key === 'f') return actionMenuItem('localeShowFullScreen');
    return false;
  }

  function availableShortcuts() {
    const rows = [
      ['?', t('This help', 'Эта справка')],
      ['s /', t('Focus search', 'Фокус на поиске')],
    ];
    for (const [keys, action, label] of [
      ['g c', 'code', t('Code', 'Код')],
      ['g i', 'issues', 'Issues'],
      ['g p', 'pulls', t('Pull requests', 'Pull requests')],
      ['g a', 'actions', 'Actions'],
      ['g n', 'notifications', t('Notifications', 'Уведомления')],
      ['g f', 'workflowFile', t('Workflow file', 'Файл workflow')],
    ]) {
      if (repositoryNav(action)) rows.push([keys, label]);
    }

    if (document.querySelector('.repository .repo-button-row a[href*="/find/"]')) rows.push(['t', t('Go to file', 'Перейти к файлу')]);
    if (document.querySelector('.js-branch-tag-selector .branch-dropdown-button')) rows.push(['w', t('Switch branch/tag', 'Переключить ветку/тег')]);
    if (document.querySelector('[data-line-number]')) rows.push(['l', t('Go to line', 'Перейти к строке')]);
    if (document.querySelector('a.ui.mini.basic.button[href*="/src/commit/"]')) rows.push(['y', t('Permalink', 'Постоянная ссылка')]);
    if (document.querySelector('.non-diff-file-content a[href*="/blame/"], a[href*="/blame/"]')) rows.push(['b', 'Blame']);
    if (document.querySelector('.non-diff-file-content a[href*="/_edit/"], a[href*="/_edit/"]')) rows.push(['e', t('Edit file', 'Редактировать файл')]);

    if (document.querySelector('.page-content.repository.issue-list')) {
      rows.push(['⌘/ Ctrl+/', t('Focus issue/PR search', 'Фокус на поиске issues/PR')]);
      if (document.querySelector('.page-content.repository.issue-list .issue-list-new:not(.new-pr-button)[href]')) rows.push(['c', t('Create issue', 'Создать issue')]);
      for (const [key, selector, label] of [
        ['u', '.list-header-author.dropdown', t('Filter by author', 'Фильтр по автору')],
        ['l', '.label-filter.dropdown', t('Filter labels', 'Фильтр labels')],
        ['m', '.list-header-milestone.dropdown', t('Filter milestones', 'Фильтр milestones')],
        ['a', '.list-header-assignee.dropdown', t('Filter assignee', 'Фильтр assignee')],
      ]) {
        if (document.querySelector(selector)) rows.push([key, label]);
      }
    }

    if (document.querySelector('.page-content.repository.view.issue')) {
      for (const [key, selector, label] of [
        ['q', '.select-reviewers-modify.dropdown', t('Request reviewer', 'Запросить reviewer')],
        ['m', '.select-milestone.dropdown', 'Milestone'],
        ['l', '.select-label.dropdown', 'Labels'],
        ['a', '.select-assignees-modify.dropdown', 'Assignee'],
      ]) {
        if (document.querySelector(selector)) rows.push([key, label]);
      }
    }

    if (document.getElementById('repo-action-view')) rows.push(['t', t('Toggle timestamps', 'Показать/скрыть timestamps')], ['f', t('Toggle full-screen logs', 'Полноэкранные логи')]);
    if (document.getElementById('notification_div')) rows.push(['⇧i', t('Mark focused notification read', 'Пометить уведомление прочитанным')], ['⇧u', t('Mark focused notification unread', 'Пометить уведомление непрочитанным')]);
    return rows;
  }

  function help() {
    const dialog = makeDialog('hgh-help', t('Keyboard shortcuts', 'Горячие клавиши'));
    dialog.querySelector('dl')?.remove();
    dialog.querySelector('label')?.remove();
    const list = document.createElement('dl');
    for (const [keys, description] of availableShortcuts()) {
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = keys;
      detail.textContent = description;
      list.append(term, detail);
    }
    const label = document.createElement('label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = shortcuts;
    check.addEventListener('change', () => {
      shortcuts = check.checked;
      try { localStorage.setItem('hypergithub.shortcuts', shortcuts ? 'on' : 'off'); } catch {}
    });
    label.append(check, document.createTextNode(t(' Enable character-key shortcuts', ' Включить символьные горячие клавиши')));
    dialog.append(list, label);
    if (!dialog.open) dialog.showModal();
  }

  const bodyObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          schedule();
          return;
        }
      }
    }
  });

  function enhance() {
    syncReleaseStyles();
    if (enabled()) { enhanceNativeListOptions(document); enhanceNativeChrome(document); enhanceUniversalSearch(document); enhancePagination(document); enhanceOrganization(document); enhanceDashboardPagination(document); }
    queued = false;
    if (!enabled()) return;

    bodyObserver.disconnect();
    try {
      for (const panel of document.querySelectorAll('.repository .repo-button-row .clone-panel')) {
        if (panel.closest('.hgh-clone')) continue;
        const details = document.createElement('details');
        details.className = 'hgh-clone';
        const summary = document.createElement('summary');
        summary.innerHTML = `<span>${t('Code', 'Код')}</span><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4Z"/></svg>`;
        summary.setAttribute('aria-label',t('Clone repository','Клонировать репозиторий'));
        panel.before(details);
        details.append(summary, panel);
        details.addEventListener('toggle', () => {
          summary.setAttribute('aria-expanded', String(details.open));
          if (!details.open) return;
          for (const other of document.querySelectorAll('details.hgh-clone[open]')) {
            if (other !== details) other.open = false;
          }
        });
      }

      if (!document.querySelector('[data-hgh-help]')) {
        const host = document.querySelector('.repository .repo-button-row');
        if (host) {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.hghHelp = '';
          button.className = 'ui basic compact button hgh-help-button';
          button.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="1" y="3" width="14" height="10" rx="2" fill="none" stroke="currentColor"/><path d="M3 6h1m2 0h1m2 0h1m2 0h1M3 8h1m2 0h1m2 0h1m2 0h1M4 10h8" stroke="currentColor"/></svg><span>'+t('Shortcuts','Горячие клавиши')+'</span>';
          button.title=t('Keyboard shortcuts','Горячие клавиши');
          button.setAttribute('aria-label', t('Keyboard shortcuts', 'Горячие клавиши'));
          button.addEventListener('click', () => {
            const menu=button.closest('.hgh-repo-more');
            if(menu?.open){menu.open=false;menu.querySelector('summary')?.focus();}
            help();
          });
          host.append(button);
        }
      }
      enhanceRepositoryControls(document);
      root.dataset.hghReady = 'true';
    } finally {
      if (enabled()) bodyObserver.observe(document.body, {childList: true, subtree: true});
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(enhance);
  }

  document.addEventListener('keydown', (event) => {
    if (!enabled()) return;

    if (event.key === 'Escape') {
      if (document.querySelector('.full.height > .action-view-right')) {
        if (actionMenuItem('localeShowFullScreen')) event.preventDefault();
        return;
      }
      closeMenus(true);
      return;
    }

    // All non-Escape shortcuts respect already-handled events, IME composition,
    // key repeat, editables, visible modal state, and the user's opt-out.
    if (event.defaultPrevented || event.isComposing || event.repeat || isEditable(event.target)) return;
    if ([...document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]')].some(visible)) return;

    const key = event.key.toLowerCase();
    if (key === '?') {
      event.preventDefault();
      help();
      return;
    }
    if (!shortcuts) return;

    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && (event.key === '/' || key === 'k')) {
      event.preventDefault();
      focusBestSearch();
      return;
    }

    // GitHub assigns shifted variants only in specific contexts. Keep all other
    // Shift+letter chords available to the browser, OS and future parity work.
    if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (document.getElementById('notification_div') && key === 'i' && notificationAction('read')) {
        event.preventDefault();
        return;
      }
      if (document.getElementById('notification_div') && key === 'u' && notificationAction('unread')) {
        event.preventDefault();
        return;
      }
      if (document.getElementById('repo-action-view') && (key === 't' || key === 'f') && actionShortcut(key)) {
        event.preventDefault();
      }
      return;
    }

    if (!acceptKey(event)) return;

    if (key === 's' || key === '/') {
      if (focusBestSearch()) event.preventDefault();
      return;
    }

    const action = navigationAction(sequence, key);
    sequence = '';
    clearTimeout(sequenceTimer);
    if (action) {
      if (runNavigationAction(action)) event.preventDefault();
      return;
    }
    if (key === 'g') {
      sequence = 'g';
      sequenceTimer = setTimeout(() => { sequence = ''; }, 1000);
      return;
    }

    if (actionShortcut(key)) {
      event.preventDefault();
      return;
    }

    if (document.querySelector('.page-content.repository.issue-list') && issueListShortcut(key)) {
      event.preventDefault();
      return;
    }

    if (document.querySelector('.page-content.repository.view.issue') && issueDetailShortcut(key)) {
      event.preventDefault();
      return;
    }

    if (key === 'w') {
      const buttons = [...document.querySelectorAll('.js-branch-tag-selector .branch-dropdown-button')].filter(usable);
      const focused = buttons.find((button) => button.closest('.js-branch-tag-selector')?.matches(':focus-within'));
      const button = focused ?? (buttons.length === 1 ? buttons[0] : null);
      if (button) {
        event.preventDefault();
        button.click();
      }
      return;
    }

    if (key === 'l' && goToLine()) {
      event.preventDefault();
      return;
    }
    if (key === 'y' && permalink()) {
      event.preventDefault();
      return;
    }

    const selectors = new Map([
      ['t', '.repository .repo-button-row a[href*="/find/"]'],
      ['b', '.non-diff-file-content a[href*="/blame/"], a.view_git_blame[href]'],
      ['e', '.non-diff-file-content a[href*="/_edit/"], a[href*="/_edit/"]'],
    ]);
    const selector = selectors.get(key);
    if(selector){const target=document.querySelector(selector),menu=target?.closest('.hgh-repo-more');if(menu&&usable(menu.querySelector('summary')))menu.open=true;}
    if (selector && navigate(firstUsable(selector))) event.preventDefault();
  });

  document.addEventListener('click', (event) => {
    if (enabled() && !event.target.closest('.hgh-clone')) closeMenus();
  });
  document.addEventListener('htmx:afterSwap', schedule);

  const syncBodyObserver = () => {
    bodyObserver.disconnect();
    if (enabled()) bodyObserver.observe(document.body, {childList: true, subtree: true});
  };
  syncBodyObserver();

  new MutationObserver(() => {
    syncBodyObserver();
    if (!enabled()) {
      restoreRepositoryControls(document);
      restorePagination(document);
      restoreNativeListOptions(document);
      restoreNativeChrome(document);
      restoreUniversalSearch(document);
      restoreOrganization(document);
      restoreDashboardPagination(document);
      closeMenus();
      for (const menu of document.querySelectorAll('details.hgh-clone')) {
        const panel = menu.querySelector('.clone-panel');
        if (panel) menu.before(panel);
        menu.remove();
      }
      for (const dialog of document.querySelectorAll('.hgh-dialog')) {
        if (dialog.open) dialog.close();
        dialog.remove();
      }
      for (const button of document.querySelectorAll('[data-hgh-help]')) button.remove();
      delete root.dataset.hghReady;
      sequence = '';
      clearTimeout(sequenceTimer);
    }
    schedule();
  }).observe(root, {attributes: true, attributeFilter: ['data-theme']});

  enhance();
}
