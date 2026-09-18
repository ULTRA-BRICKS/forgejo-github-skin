export const THEME_PREFIX = 'hypergithub-';

const repoNavigation = new Map([
  ['c', 'code'],
  ['i', 'issues'],
  ['p', 'pulls'],
  ['a', 'actions'],
  ['g', 'discussions'],
  ['s', 'security'],
  ['n', 'notifications'],
  ['f', 'workflowFile'],
]);

export function themeEnabled(name) {
  return ['light', 'dark', 'auto'].some((mode) => name === THEME_PREFIX + mode);
}

export function isEditable(target) {
  return !!target?.closest?.(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], .CodeMirror, .cm-editor, .monaco-editor',
  );
}

export function acceptKey(event) {
  return !event.defaultPrevented && !event.isComposing && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditable(event.target);
}

export function safeHref(href, base) {
  try {
    const url = new URL(href, base);
    const current = new URL(base);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === current.origin ? url.href : null;
  } catch {
    return null;
  }
}

export function navigationAction(prefix, key) {
  if (prefix !== 'g') return null;
  return repoNavigation.get(key) ?? null;
}

export function normalizeLine(value) {
  return /^[1-9]\d{0,6}$/.test(String(value)) ? Number(value) : null;
}
