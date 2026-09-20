import assert from 'node:assert/strict';

/** A rendered login/error page is not acceptance of the requested repository. */
export function assertNativeRoute(actual, expected) {
  const destination = new URL(actual);
  const requested = new URL(expected);
  assert.equal(destination.origin, requested.origin, 'Native acceptance left the expected source');
  const normalize = pathname => pathname.replace(/\/$/, '') || '/';
  assert.equal(normalize(destination.pathname), normalize(requested.pathname),
    'Native acceptance was redirected; authenticate again before testing repository pages');
}
