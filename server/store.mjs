import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export const secret = () => randomBytes(32).toString("base64url");
export const now = () => Date.now();

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const actual = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function openStore(filename) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  if (filename !== ":memory:") chmodSync(filename, 0o600);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
  );
  const version = db.prepare("PRAGMA user_version").get().user_version;
  if (version > 1)
    throw new Error("Database schema is newer than this application.");
  if (version === 0) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
      db.exec("PRAGMA user_version=1; COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return {
    db,
    get: (sql, ...args) => db.prepare(sql).get(...args),
    all: (sql, ...args) => db.prepare(sql).all(...args),
    run: (sql, ...args) => db.prepare(sql).run(...args),
    transaction(fn) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = fn();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close: () => db.close(),
  };
}
