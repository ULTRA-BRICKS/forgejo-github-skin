// Single-flight browser creation and crash recovery. Every render still gets an isolated context.
//
// FJ-24: a `launch()` call has no inherent bound. After a preview restart with a stalled
// Chromium binary, an unbounded launch wedges every request behind the same dead promise —
// the failure mode observed as a cold PNG check exceeding the production HTTP acceptance
// timeout. `startupTimeoutMs` bounds how long any caller waits for a cold launch; the shared
// deadline is fixed at launch start so concurrent joiners never each restart their own clock.
// A launch that eventually resolves after its own timeout already fired is closed instead of
// leaked, and the next `get()` starts a fresh attempt. Deadlines use `performance.now()` (a
// monotonic clock), not `Date.now()`, so a wall-clock step (NTP correction, VM pause) can
// neither extend a bound past its purpose nor spuriously fail a healthy launch.
//
// A wedged Chromium can also hang on `close()` itself, even once the launch promise has long
// since resolved — closing it is bounded by `closeTimeoutMs` too, everywhere an instance gets
// closed (recovery, abandonment, shutdown), so neither a stalled launch nor an unresponsive
// browser process can block a caller indefinitely.
export class RenderTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "RenderTimeoutError";
  }
}
export function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new RenderTimeoutError(message)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}
function remainingMs(record) {
  return Math.max(0, record.deadlineAt - performance.now());
}
export function browserSession(launch, { startupTimeoutMs = 8000, closeTimeoutMs = 5000 } = {}) {
  let pending;
  // Deferred via `Promise.resolve().then(...)` so a `launch()`/`instance.close()` that throws
  // synchronously rejects the returned promise instead of throwing out of this function's own
  // call stack — the abandonment handler in `start()` below has nothing to chain onto, so an
  // undeferred synchronous throw there would become an unhandled rejection.
  function closeBounded(instance) {
    return withTimeout(
      Promise.resolve().then(() => instance.close()),
      closeTimeoutMs,
      `Renderer close exceeded ${closeTimeoutMs}ms bound`,
    ).catch(() => {});
  }
  function start() {
    const deadlineAt = performance.now() + startupTimeoutMs;
    const promise = Promise.resolve().then(launch);
    // Memoized per record: both the abandonment handler below and a racing `close()`/
    // `dropIfCurrent()` call can independently observe "this record is no longer `pending`"
    // once the launch resolves, and each would otherwise call `instance.close()` a second time.
    let closed = false;
    function closeInstance(instance) {
      if (closed) return Promise.resolve();
      closed = true;
      return closeBounded(instance);
    }
    const record = { deadlineAt, promise, closeInstance, instance: undefined };
    // Independent of any waiting caller: if this attempt was abandoned (its own timeout
    // already rejected every `get()`), never leave the browser it eventually produced running.
    // `record.instance` is also recorded here so a later `dropIfCurrent()` can target exactly
    // this launch's instance instead of whatever happens to be `pending` by then.
    promise.then(
      (instance) => {
        record.instance = instance;
        if (pending !== record) closeInstance(instance);
      },
      () => {},
    );
    return record;
  }
  async function get() {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!pending) pending = start();
      const record = pending;
      const remaining = remainingMs(record);
      let instance;
      try {
        instance = await withTimeout(
          record.promise,
          remaining,
          // `remaining`, not the full `startupTimeoutMs`, is what this caller actually waited:
          // a late joiner on an almost-expired shared launch fails in single-digit ms, and a
          // message that only said "exceeded Nms" would misreport that as a full-length stall.
          `Renderer startup exceeded ${startupTimeoutMs}ms bound (${remaining}ms remained for this caller)`,
        );
      } catch (error) {
        if (pending === record) pending = undefined;
        throw error;
      }
      // Two joiners racing the same record each run their own `setTimeout(remaining)`; if their
      // fractional deadlines floor to adjacent millisecond ticks, one caller's timer can fire
      // (clearing `pending`, triggering the abandonment close in `start()`) in the gap between
      // this caller's race settling and this line running. `pending !== record` catches that:
      // the instance we just got may already be mid-teardown, so never hand it out — retry
      // against whatever is `pending` now instead, exactly like the disconnected-instance case.
      if (pending === record && instance.isConnected()) return instance;
      if (pending === record) pending = undefined;
    }
    throw new Error("Renderer browser repeatedly disconnected");
  }
  // A shutdown must never hang on a launch that is itself stalled, nor on a browser process
  // that won't close: `close()` waits only up to that launch's own remaining startup bound,
  // then only up to `closeTimeoutMs` to close it. If the launch never settles in time, the
  // `then` handler registered in `start()` still closes the browser once/if it eventually
  // resolves (pending is already cleared below, so that handler recognizes the abandonment);
  // `close()` itself always returns instead of blocking process shutdown indefinitely.
  async function close() {
    const record = pending;
    pending = undefined;
    if (!record) return;
    try {
      const instance = await withTimeout(record.promise, remainingMs(record), "Renderer shutdown exceeded bound waiting for a stalled launch");
      await record.closeInstance(instance);
    } catch {
      // Stalled launch, or Chromium itself refusing to close within the bound: nothing more
      // to do from here — the process may still hold the handle, but shutdown must proceed.
      // If the launch does eventually resolve, `closeInstance`'s memoization (and the handler
      // registered in `start()`) still closes it exactly once.
    }
  }
  // Recovery from a wedged render: drop `instance` only if it is *still* the one `get()` would
  // currently hand out. Unlike `close()` (which always tears down whatever is pending, for
  // shutdown), a stale caller's recovery must never close a browser it didn't use — a render
  // that started against an already-replaced instance (e.g. an earlier sibling render's own
  // recovery already dropped it and a fresh launch started) must leave that fresh, healthy
  // launch alone instead of tearing it down out from under whoever is using it now.
  async function dropIfCurrent(instance) {
    if (pending && pending.instance === instance) {
      const record = pending;
      pending = undefined;
      await record.closeInstance(instance);
    }
  }
  return { get, close, dropIfCurrent };
}
