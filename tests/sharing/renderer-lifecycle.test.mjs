import test from "node:test";
import assert from "node:assert/strict";
import { browserSession } from "../../integrations/link-preview/browser-session.mjs";
test("simultaneous browser-crash recovery launches one replacement, not one per request", async () => {
  let launches = 0,
    closed = 0;
  const session = browserSession(async () => {
    const index = ++launches;
    await new Promise((resolve) => setTimeout(resolve, 3));
    return {
      index,
      isConnected: () => index > 1,
      close: async () => {
        closed++;
      },
    };
  });
  const [a, b] = await Promise.all([session.get(), session.get()]);
  assert.equal(launches, 2);
  assert.equal(a, b);
  assert.equal(a.index, 2);
  await session.close();
  assert.equal(closed, 1);
});
test("repeated renderer crashes are bounded and a launch error can be retried", async () => {
  let calls = 0;
  const bad = browserSession(async () => {
    calls++;
    return { isConnected: () => false, close: async () => {} };
  });
  await assert.rejects(() => bad.get(), /repeatedly disconnected/);
  assert.equal(calls, 2);
  let first = true;
  const good = browserSession(async () => {
    if (first) {
      first = false;
      throw new Error("Synthetic launch failure");
    }
    return { isConnected: () => true, close: async () => {} };
  });
  await assert.rejects(() => good.get(), /Synthetic/);
  assert.ok((await good.get()).isConnected());
  await good.close();
});
