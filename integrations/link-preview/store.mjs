import { DatabaseSync } from "node:sqlite";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
export class Store {
  constructor(filename, key) {
    if (!Buffer.isBuffer(key) || key.length !== 32)
      throw new Error("A 32-byte encryption key is required");
    this.key = key;
    if (filename !== ":memory:") {
      fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
      if (fs.existsSync(filename) && fs.lstatSync(filename).isSymbolicLink())
        throw new Error("Database symlink rejected");
    }
    this.db = new DatabaseSync(filename);
    if (filename !== ":memory:") fs.chmodSync(filename, 0o600);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY,v TEXT NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,v TEXT NOT NULL,tries INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL,lease INTEGER NOT NULL DEFAULT 0,done INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);",
    );
    // done: 0 = pending, 1 = completed, 2 = exhausted/dead letter.
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(done,due);
      CREATE INDEX IF NOT EXISTS jobs_created ON jobs(created);
      CREATE INDEX IF NOT EXISTS kv_expires ON kv(expires);
    `);
  }
  seal(value, aad) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(aad));
    const body = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
  }
  open(value, aad) {
    const bytes = Buffer.from(value, "base64"),
      cipher = createDecipheriv("aes-256-gcm", this.key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    cipher.setAAD(Buffer.from(aad));
    return JSON.parse(
      Buffer.concat([
        cipher.update(bytes.subarray(28)),
        cipher.final(),
      ]).toString(),
    );
  }
  put(k, value, ttl = 3600) {
    this.db
      .prepare(
        "INSERT INTO kv VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v,expires=excluded.expires",
      )
      .run(k, this.seal(value, k), Date.now() + ttl * 1000);
  }
  get(k) {
    const r = this.db
      .prepare("SELECT v FROM kv WHERE k=? AND expires>?")
      .get(k, Date.now());
    return r ? this.open(r.v, k) : null;
  }
  take(k) {
    const r = this.db
      .prepare("DELETE FROM kv WHERE k=? RETURNING v,expires")
      .get(k);
    return r && r.expires > Date.now() ? this.open(r.v, k) : null;
  }
  remove(k) {
    this.db.prepare("DELETE FROM kv WHERE k=?").run(k);
  }
  enqueue(id, value) {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO jobs(id,v,due,created) VALUES(?,?,?,?)")
        .run(id, this.seal(value, id), Date.now(), Date.now()).changes === 1
    );
  }
  claim() {
    const r = this.db
      .prepare(
        "UPDATE jobs SET lease=?,tries=tries+1 WHERE id=(SELECT id FROM jobs WHERE done=0 AND due<=? AND lease<? ORDER BY due LIMIT 1) RETURNING *",
      )
      .get(Date.now() + 60000, Date.now(), Date.now());
    return r ? { id: r.id, value: this.open(r.v, r.id), tries: r.tries } : null;
  }
  finish(id) {
    this.db.prepare("UPDATE jobs SET done=1,v='' WHERE id=?").run(id);
  }
  retry(id, tries, seconds = 10) {
    if (tries >= 6) {
      this.db.prepare("UPDATE jobs SET done=2,v='' WHERE id=?").run(id);
      return;
    }
    this.db
      .prepare("UPDATE jobs SET lease=0,due=? WHERE id=?")
      .run(
        Date.now() +
          Math.min(Math.max(seconds, 2) * 2 ** (tries - 1), 1800) * 1000,
        id,
      );
  }
  pendingCount() {
    return this.db
      .prepare(
        "SELECT count(*) AS n FROM (SELECT 1 FROM jobs WHERE done=0 LIMIT 1000)",
      )
      .get().n;
  }
  stats() {
    return this.db
      .prepare(
        "SELECT sum(done=0) AS pending,sum(done=1) AS completed,sum(done=2) AS dead FROM jobs",
      )
      .get();
  }
  cleanup() {
    this.db.prepare("DELETE FROM kv WHERE expires<?").run(Date.now());
    this.db
      .prepare("DELETE FROM jobs WHERE created<?")
      .run(Date.now() - 86400000);
  }
  close() {
    this.db.close();
  }
}
