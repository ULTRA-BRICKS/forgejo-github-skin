// Single-flight browser creation and crash recovery. Every render still gets an isolated context.
export function browserSession(launch) {
  let pending;
  async function get() {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!pending) pending = Promise.resolve().then(launch);
      const own = pending;
      let instance;
      try {
        instance = await own;
      } catch (error) {
        if (pending === own) pending = undefined;
        throw error;
      }
      if (instance.isConnected()) return instance;
      // A concurrent caller may already have replaced the failed browser.
      if (pending === own) pending = undefined;
    }
    throw new Error("Renderer browser repeatedly disconnected");
  }
  async function close() {
    const own = pending;
    pending = undefined;
    if (own) await (await own).close();
  }
  return { get, close };
}
