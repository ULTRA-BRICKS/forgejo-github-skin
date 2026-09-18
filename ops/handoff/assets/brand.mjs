/** No geometry replacement on Forgejo itself; no changes to avatars or GitHub reference images. */
const markNativeLogo = () => {
  for (const img of document.querySelectorAll('#navbar img, .home img')) {
    try {
      const src = new URL(img.getAttribute('src'), location.href);
      if (src.origin === location.origin && /\/assets\/img\/logo\.(svg|png)$/.test(src.pathname)) {
        img.dataset.fjBrandmark = '';
      }
    } catch { /* Unparseable/non-local images are not branding targets. */ }
  }
};
markNativeLogo();
let queued = false;
new MutationObserver((changes) => {
  if (queued || !changes.some(c => [...c.addedNodes].some(n => n.nodeType === 1))) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; markNativeLogo(); });
}).observe(document.body, {childList: true, subtree: true});
