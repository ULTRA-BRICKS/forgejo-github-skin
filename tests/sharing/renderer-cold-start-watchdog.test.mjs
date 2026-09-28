// FJ-24: bounded startup/render watchdogs. No real Chromium here — `launch`/`instance` are
// synthetic so timing is deterministic; the real browser is exercised separately by
// scripts/sharing/check-preview-layout.mjs and the cold-render evidence script.
import test from "node:test";
import assert from "node:assert/strict";
import { browserSession, withTimeout, RenderTimeoutError } from "../../integrations/link-preview/browser-session.mjs";
import { createRenderer } from "../../integrations/link-preview/raster.mjs";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("withTimeout resolves under the bound and rejects with RenderTimeoutError past it", async () => {
  assert.equal(await withTimeout(Promise.resolve("ok"), 50, "unused"), "ok");
  await assert.rejects(
    () => withTimeout(new Promise(() => {}), 20, "bound exceeded"),
    (error) => error instanceof RenderTimeoutError && error.message === "bound exceeded",
  );
});

test("a cold launch that never resolves fails within the startup bound", async () => {
  let launches = 0;
  const session = browserSession(
    async () => {
      launches++;
      return new Promise(() => {}); // never resolves: simulates a stalled Chromium launch
    },
    { startupTimeoutMs: 40 },
  );
  const startedAt = Date.now();
  await assert.rejects(() => session.get(), /Renderer startup exceeded 40ms bound/);
  assert.ok(Date.now() - startedAt < 300, "must fail close to the bound, not hang");
  assert.equal(launches, 1);
});

test("a launch() that throws synchronously is deferred into a rejection, not thrown out of get()'s caller", async () => {
  const session = browserSession(() => {
    throw new Error("synchronous launch failure");
  });
  await assert.rejects(() => session.get(), /synchronous launch failure/);
});

test("an abandoned launch that later rejects (not resolves) never surfaces as an unhandled rejection", async () => {
  let unhandled = null;
  const onUnhandled = (reason) => {
    unhandled = reason;
  };
  process.on("unhandledRejection", onUnhandled);
  try {
    const session = browserSession(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("late launch failure")), 40);
        }),
      { startupTimeoutMs: 10 },
    );
    await assert.rejects(() => session.get(), /Renderer startup exceeded 10ms bound/);
    await wait(80); // let the abandoned launch's rejection actually fire
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  assert.equal(unhandled, null, "an abandoned launch's late rejection must be handled, not surfaced as an unhandled rejection");
});

test("a cold launch that resolves under the bound succeeds once, no wasted retry", async () => {
  let launches = 0;
  const session = browserSession(
    async () => {
      launches++;
      await wait(10);
      return { isConnected: () => true, close: async () => {} };
    },
    { startupTimeoutMs: 200 },
  );
  const instance = await session.get();
  assert.ok(instance.isConnected());
  assert.equal(launches, 1);
});

test("concurrent cold requests during a slow launch are bounded and coalesced onto one launch", async () => {
  let launches = 0;
  const session = browserSession(
    async () => {
      launches++;
      await wait(30);
      return { isConnected: () => true, close: async () => {} };
    },
    { startupTimeoutMs: 200 },
  );
  const [a, b, c] = await Promise.all([session.get(), session.get(), session.get()]);
  assert.equal(launches, 1, "three concurrent cold callers must share a single launch");
  assert.equal(a, b);
  assert.equal(b, c);
});

test("after a startup timeout, a later get() retries with a fresh launch and the abandoned browser is closed, not leaked", async () => {
  let launches = 0;
  let closedLate = false;
  const session = browserSession(
    async () => {
      launches++;
      if (launches === 1) {
        // This attempt outlives its own timeout; it must be closed once abandoned.
        await wait(60);
        return {
          isConnected: () => true,
          close: async () => {
            closedLate = true;
          },
        };
      }
      return { isConnected: () => true, close: async () => {} };
    },
    { startupTimeoutMs: 20 },
  );
  await assert.rejects(() => session.get(), /Renderer startup exceeded 20ms bound/);
  const instance = await session.get();
  assert.ok(instance.isConnected());
  assert.equal(launches, 2, "the retry must launch again, not reuse the abandoned attempt");
  await wait(60);
  assert.equal(closedLate, true, "the late-resolving abandoned browser must self-close, not leak");
});

test("a caller joining a long-warm record (its deadline passed long ago) still succeeds — an already-resolved launch wins the race over the clamped 0ms remaining timer", async () => {
  let launches = 0;
  const session = browserSession(
    async () => {
      launches++;
      return { isConnected: () => true, close: async () => {} };
    },
    { startupTimeoutMs: 20 },
  );
  const first = await session.get();
  await wait(50); // the record's deadline is now long past; remainingMs() computes 0
  const second = await session.get();
  assert.equal(second, first, "a warm, already-resolved browser must still be returned, not spuriously timed out");
  assert.equal(launches, 1, "no relaunch — the warm instance is reused indefinitely");
});

test("session.close() during shutdown closes a still-pending cold launch once it resolves, and is a no-op with nothing pending", async () => {
  let closed = false;
  const session = browserSession(async () => {
    await wait(15);
    return {
      isConnected: () => true,
      close: async () => {
        closed = true;
      },
    };
  });
  // Fire-and-forget: this test only exercises close(), not get()'s own result. get() may now
  // legitimately lose its race against two back-to-back close() calls and exhaust its retry
  // budget — that is the correct, fixed behavior (never hand out an instance whose record was
  // abandoned mid-race), not a bug in this test.
  session.get().catch(() => {});
  await session.close();
  assert.equal(closed, true);
  // Nothing pending now; close() must not throw.
  await session.close();
});

test("session.close() must not hang on a launch that never resolves; it returns once the launch's own startup bound elapses, and the leak-protection handler still closes it later if it ever does resolve", async () => {
  let lateInstanceClosed = false;
  let resolveLaunch;
  const session = browserSession(
    () =>
      new Promise((resolve) => {
        resolveLaunch = resolve;
      }),
    { startupTimeoutMs: 30 },
  );
  session.get().catch(() => {});
  const startedAt = Date.now();
  await session.close();
  assert.ok(Date.now() - startedAt < 300, "close() must return close to the startup bound, not hang forever");
  resolveLaunch({ isConnected: () => true, close: async () => { lateInstanceClosed = true; } });
  await wait(10);
  assert.equal(lateInstanceClosed, true, "a launch that resolves after close() gave up must still be closed, not leaked");
});

test("session.close() is bounded even when the browser instance itself is wedged (instance.close() never resolves), not just when the launch never resolves", async () => {
  const session = browserSession(async () => ({ isConnected: () => true, close: () => new Promise(() => {}) }), {
    closeTimeoutMs: 30,
  });
  await session.get();
  const startedAt = Date.now();
  await session.close();
  assert.ok(Date.now() - startedAt < 300, "close() must return close to closeTimeoutMs, not hang on a wedged instance.close()");
});

test("closing while the launch is still pending never double-closes the eventual instance, even though both close() and the abandonment handler observe the same abandonment", async () => {
  let closeCalls = 0;
  let resolveLaunch;
  const session = browserSession(
    () =>
      new Promise((resolve) => {
        resolveLaunch = resolve;
      }),
    { startupTimeoutMs: 5000 },
  );
  session.get().catch(() => {});
  const closed = session.close();
  // `launch` runs via `Promise.resolve().then(launch)` inside `start()` — one microtask hop
  // after `session.get()` returns — so `resolveLaunch` isn't assigned until that hop runs.
  await Promise.resolve();
  resolveLaunch({
    isConnected: () => true,
    close: async () => {
      closeCalls++;
    },
  });
  await closed;
  await wait(20);
  assert.equal(closeCalls, 1, "the instance must be closed exactly once, not once per observer");
});

test("a render-level hang past the render bound is a distinct failure, closes the browser session for recovery, and a later render launches a fresh instance", async () => {
  let launches = 0;
  let closedForRecovery = false;
  let hang = true;
  const session = browserSession(async () => {
    launches++;
    const launchIndex = launches;
    return {
      isConnected: () => true,
      close: async () => {
        if (launchIndex === 1) closedForRecovery = true;
      },
      newContext: async () => ({
        route: async () => {},
        newPage: async () => ({
          setDefaultTimeout: () => {},
          setContent: async () => {},
          evaluate: async () => {},
          screenshot: async () => {
            if (hang) return new Promise(() => {}); // simulates a wedged page render
            return Buffer.from("png-bytes");
          },
        }),
        close: async () => {},
      }),
    };
  });
  const { renderGraphicTimed } = createRenderer(session, { renderTimeoutMs: 30 });
  const meta = { summary: { metrics: [{ label: "x", value: 1 }] } };
  await assert.rejects(() => renderGraphicTimed(meta), /Renderer render exceeded 30ms bound/);
  assert.equal(closedForRecovery, true, "a hung render must drop the shared browser session");
  hang = false;
  const result = await renderGraphicTimed(meta);
  assert.equal(result.bytes.toString(), "png-bytes");
  assert.equal(launches, 2, "recovery must relaunch a fresh browser, not reuse the wedged one");
});

test("dropIfCurrent() only tears down an instance that is still the one pending; a stale recovery (from a sibling render whose timeout already replaced it) leaves a newer, unrelated, healthy launch alone", async () => {
  let launches = 0;
  const closedCounts = {};
  const session = browserSession(async () => {
    launches++;
    const index = launches;
    return {
      isConnected: () => true,
      close: async () => {
        closedCounts[index] = (closedCounts[index] || 0) + 1;
      },
    };
  });
  const instanceA = await session.get(); // launch 1
  // Simulate a sibling render's own recovery already having replaced the shared browser
  // by the time this caller's (stale) recovery runs.
  await session.close();
  const instanceB = await session.get(); // launch 2, unrelated to instanceA
  assert.notEqual(instanceA, instanceB);
  await session.dropIfCurrent(instanceA);
  assert.equal(closedCounts[2] || 0, 0, "the fresh, unrelated instance must never be closed by a stale recovery targeting a different instance");
  const stillCurrent = await session.get();
  assert.equal(stillCurrent, instanceB, "get() must still hand out the healthy instance, untouched by the stale drop");
});

test("an ordinary render error (not a timeout) never triggers a browser relaunch", async () => {
  let launches = 0;
  let closed = false;
  const session = browserSession(async () => {
    launches++;
    return {
      isConnected: () => true,
      close: async () => {
        closed = true;
      },
      newContext: async () => ({
        route: async () => {},
        newPage: async () => ({
          setDefaultTimeout: () => {},
          setContent: async () => {},
          evaluate: async () => {},
          screenshot: async () => {
            throw new Error("Synthetic content error");
          },
        }),
        close: async () => {},
      }),
    };
  });
  const { renderGraphicTimed } = createRenderer(session, { renderTimeoutMs: 200 });
  const meta = { summary: { metrics: [{ label: "x", value: 1 }] } };
  await assert.rejects(() => renderGraphicTimed(meta), /Synthetic content error/);
  assert.equal(closed, false, "a normal per-page failure must not tear down the shared browser");
  await renderGraphicTimed(meta).catch(() => {});
  assert.equal(launches, 1, "the browser must still be reused, not relaunched");
});

test("a startup timeout (session.get() itself rejecting) is never mistaken for a render-level hang; it propagates without tearing down the session", async () => {
  let closeCalls = 0;
  const session = {
    get: async () => {
      throw new RenderTimeoutError("Renderer startup exceeded 5ms bound (5ms remained for this caller)");
    },
    close: async () => {
      closeCalls++;
    },
  };
  const { renderGraphicTimed } = createRenderer(session, { renderTimeoutMs: 200 });
  const meta = { summary: { metrics: [{ label: "x", value: 1 }] } };
  await assert.rejects(() => renderGraphicTimed(meta), /Renderer startup exceeded 5ms bound/);
  assert.equal(closeCalls, 0, "a startup timeout must not trigger the render-level teardown — get() already applies its own bound");
});

test("PREFLIGHT_SAMPLE renders through the real graphic()/graphicLayout() pipeline, not just the hasGraphicFacts precheck", async () => {
  const { hasGraphicFacts } = await import("../../integrations/link-preview/graphic.mjs");
  const { PREFLIGHT_SAMPLE } = await import("../../integrations/link-preview/render-preflight.mjs");
  assert.equal(hasGraphicFacts(PREFLIGHT_SAMPLE), true);
  const session = browserSession(async () => ({
    isConnected: () => true,
    close: async () => {},
    newContext: async () => ({
      route: async () => {},
      newPage: async () => ({
        setDefaultTimeout: () => {},
        setContent: async () => {},
        evaluate: async () => {},
        screenshot: async () => Buffer.from("real-png-bytes"),
      }),
      close: async () => {},
    }),
  }));
  const { renderGraphicTimed } = createRenderer(session);
  const result = await renderGraphicTimed(PREFLIGHT_SAMPLE);
  assert.equal(result.bytes.toString(), "real-png-bytes");
});

test("renderGraphicTimed rejects metadata with no renderable facts before touching the browser", async () => {
  let launches = 0;
  const session = browserSession(async () => {
    launches++;
    return { isConnected: () => true, close: async () => {} };
  });
  const { renderGraphicTimed } = createRenderer(session);
  await assert.rejects(() => renderGraphicTimed({ summary: {} }), /No renderable preview facts/);
  assert.equal(launches, 0);
});
