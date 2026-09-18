/** Demo-only adapter for the previously built reference fixtures.
 * Source-level component unification is still required in the canonical repo.
 * The SVG must be supplied from the operator's reviewed Forgejo distribution.
 */
const source = new URL('./forgejo-logo.svg', import.meta.url).href;
const adapt = () => {
  for (const mark of document.querySelectorAll('#storybook-root .gh-mark')) {
    if (!mark.querySelector('.octicon-mark-github')) continue;
    const img = document.createElement('img');
    img.src = source;
    img.alt = 'Forgejo';
    img.className = 'fj-preview-brand';
    img.width = img.height = 32;
    mark.replaceChildren(img);
  }
};
adapt();
let scheduled = false;
new MutationObserver(changes => {
  if (scheduled || !changes.some(change => [...change.addedNodes].some(node => node.nodeType === 1))) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; adapt(); });
}).observe(document.body, {subtree: true, childList: true});
