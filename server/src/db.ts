import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { config } from "./config.ts";

/**
 * SQLite through node:sqlite: no native build step, one file, WAL for concurrent reads.
 * Every write that decides who gets paid runs inside `tx()` with BEGIN IMMEDIATE,
 * so two phones tapping the same drop in the same millisecond serialise cleanly.
 */

export type Row = Record<string, SQLInputValue>;

export function openDb(path = config.DB_PATH): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      wallet      TEXT PRIMARY KEY,
      handle      TEXT,
      created_at  INTEGER NOT NULL,
      drops_given INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS nonces (
      nonce      TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      used       INTEGER NOT NULL DEFAULT 0
    );

    -- short-lived trail used to check the walk; pruned after a day
    CREATE TABLE IF NOT EXISTS positions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet    TEXT NOT NULL,
      lat       REAL NOT NULL,
      lng       REAL NOT NULL,
      accuracy  REAL NOT NULL,
      ts        INTEGER NOT NULL,
      device_id TEXT
    );
    CREATE INDEX IF NOT EXISTS positions_wallet_ts ON positions(wallet, ts);

    CREATE TABLE IF NOT EXISTS spawns (
      id          TEXT PRIMARY KEY,
      owner       TEXT NOT NULL,
      sym         TEXT NOT NULL,
      usd         REAL NOT NULL,
      rarity      TEXT NOT NULL,
      lat         REAL NOT NULL,
      lng         REAL NOT NULL,
      placed_lat  REAL NOT NULL,
      placed_lng  REAL NOT NULL,
      city        TEXT,
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL,
      quiet_until INTEGER NOT NULL DEFAULT 0,
      state       TEXT NOT NULL DEFAULT 'open' -- open | spent | expired
    );
    CREATE INDEX IF NOT EXISTS spawns_state ON spawns(state, expires_at);
    CREATE INDEX IF NOT EXISTS spawns_owner ON spawns(owner, state);

    CREATE TABLE IF NOT EXISTS catches (
      id          TEXT PRIMARY KEY,
      spawn_id    TEXT NOT NULL,
      wallet      TEXT NOT NULL,
      sym         TEXT NOT NULL,
      token       TEXT,
      amount      TEXT NOT NULL,       -- raw units, decimal string (bigint)
      usd         REAL NOT NULL,
      kind        TEXT NOT NULL DEFAULT 'street', -- street | legendary
      state       TEXT NOT NULL,       -- sending | landed | failed | demo
      tx_hash     TEXT,
      error       TEXT,
      walk_m      REAL NOT NULL DEFAULT 0,
      city        TEXT,
      cell        TEXT,
      device_id   TEXT,
      ip          TEXT,
      created_at  INTEGER NOT NULL,
      landed_at   INTEGER
    );
    CREATE INDEX IF NOT EXISTS catches_wallet ON catches(wallet, created_at);
    CREATE INDEX IF NOT EXISTS catches_state ON catches(state);
    CREATE INDEX IF NOT EXISTS catches_created ON catches(created_at);
    CREATE INDEX IF NOT EXISTS catches_device ON catches(device_id, created_at);
    CREATE INDEX IF NOT EXISTS catches_ip ON catches(ip, created_at);
    CREATE INDEX IF NOT EXISTS catches_cell ON catches(cell, created_at);
    -- one live catch per wallet per drop; failed rows don't count
    CREATE UNIQUE INDEX IF NOT EXISTS catches_once ON catches(spawn_id, wallet) WHERE state != 'failed';

    CREATE TABLE IF NOT EXISTS legendary (
      id         TEXT PRIMARY KEY,
      city       TEXT NOT NULL,
      spot       TEXT NOT NULL,
      lat        REAL NOT NULL,
      lng        REAL NOT NULL,
      code_hash  TEXT NOT NULL,
      sym        TEXT NOT NULL,
      shares     REAL NOT NULL DEFAULT 1,
      starts_at  INTEGER NOT NULL,
      ends_at    INTEGER NOT NULL,
      winner     TEXT,
      catch_id   TEXT
    );
  `);
  return db;
}

export const db = openDb();

/** Run `fn` in a write transaction. Nested calls join the outer one. */
let depth = 0;
export function tx<T>(fn: () => T, d: DatabaseSync = db): T {
  if (depth > 0) return fn();
  d.exec("BEGIN IMMEDIATE");
  depth++;
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  } finally {
    depth--;
  }
}

export const now = () => Date.now();
export const startOfUtcDay = (t = Date.now()) => t - (t % 86_400_000);
