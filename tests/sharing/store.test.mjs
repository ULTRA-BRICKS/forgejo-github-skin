import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Store } from "../../integrations/link-preview/store.mjs";
test("store encrypts private contents, binds ciphertext to key and consumes state once", () => {
  const store = new Store(":memory:", randomBytes(32));
  try {
    store.put("one", { secret: "not-in-plaintext" });
    const raw = store.db.prepare("SELECT v FROM kv").get().v;
    assert.ok(!raw.includes("not-in-plaintext"));
    assert.deepEqual(store.get("one"), { secret: "not-in-plaintext" });
    assert.throws(() => store.open(raw, "other"));
    assert.deepEqual(store.take("one"), { secret: "not-in-plaintext" });
    assert.equal(store.take("one"), null);
  } finally {
    store.close();
  }
});
test("durable jobs deduplicate, lease, retry and erase processed payload", () => {
  const store = new Store(":memory:", randomBytes(32));
  try {
    assert.equal(store.enqueue("T:Ev1", { url: "private" }), true);
    assert.equal(store.enqueue("T:Ev1", { url: "duplicate" }), false);
    const job = store.claim();
    assert.equal(job.tries, 1);
    assert.equal(job.value.url, "private");
    assert.equal(store.claim(), null);
    store.retry(job.id, job.tries, 2);
    assert.equal(store.claim(), null);
    store.db.prepare("UPDATE jobs SET due=0,lease=0").run();
    assert.equal(store.claim().tries, 2);
    store.finish(job.id);
    assert.equal(store.db.prepare("SELECT v FROM jobs").get().v, "");
    assert.equal(store.enqueue("T:Ev1", {}), false);
  } finally {
    store.close();
  }
});
test("encrypted state survives restart without storing keys in SQLite", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fj-preview-test-")),
    file = path.join(directory, "state.sqlite"),
    key = randomBytes(32);
  try {
    let store = new Store(file, key);
    store.put("user", { token: "synthetic-secret" });
    store.close();
    store = new Store(file, key);
    assert.equal(store.get("user").token, "synthetic-secret");
    store.close();
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.ok(!fs.readFileSync(file).includes(Buffer.from("synthetic-secret")));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test("expired state cannot be consumed", () => {
  const store = new Store(":memory:", randomBytes(32));
  try {
    store.put("state", {}, -1);
    assert.equal(store.get("state"), null);
    assert.equal(store.take("state"), null);
  } finally {
    store.close();
  }
});
test("exhausted jobs become dead letters, never successful completion", () => {
  const store = new Store(":memory:", randomBytes(32));
  try {
    store.enqueue("dead-job", { secret: "private" });
    store.retry("dead-job", 6);
    assert.equal(store.stats().dead, 1);
    assert.equal(store.stats().completed, 0);
    assert.equal(store.db.prepare("SELECT v FROM jobs").get().v, "");
    assert.equal(store.claim(), null);
  } finally {
    store.close();
  }
});

test("hot queue and expiry queries use explicit indexes; cap counts only pending rows", () => {
  const store = new Store(":memory:", randomBytes(32));
  try {
    store.enqueue("pending", {});
    store.enqueue("completed", {});
    store.finish("completed");
    assert.equal(store.pendingCount(), 1);
    for (const [sql, index] of [
      [
        "SELECT id FROM jobs WHERE done=0 AND due<=0 AND lease<0 ORDER BY due LIMIT 1",
        "jobs_ready",
      ],
      ["SELECT k FROM kv WHERE expires<0", "kv_expires"],
      ["SELECT id FROM jobs WHERE created<0", "jobs_created"],
    ])
      assert.ok(
        store.db
          .prepare("EXPLAIN QUERY PLAN " + sql)
          .all()
          .some((row) => row.detail.includes(index)),
      );
  } finally {
    store.close();
  }
});
