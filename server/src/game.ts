import { randomInt, randomUUID } from "node:crypto";
import type { Address } from "viem";
import { CATCH, DROP, STREET, rarityMult, reachFor, type Rarity, type StockSym } from "../../shared/rules.ts";
import { cellKey, destination, distanceM, type LatLng } from "../../shared/geo.ts";
import { config, stocks } from "./config.ts";
import { db, now, startOfUtcDay, tx } from "./db.ts";
import { canPay, holdings, reserve, toRaw, holding } from "./market.ts";
import { evaluate, type Evidence, type Fix, type Motion } from "./anticheat.ts";
import { cityFor } from "./cities.ts";
import { HttpError } from "./auth.ts";

export interface SpawnRow {
  id: string;
  owner: string;
  sym: StockSym;
  usd: number;
  rarity: Rarity;
  lat: number;
  lng: number;
  placed_lat: number;
  placed_lng: number;
  city: string | null;
  created_at: number;
  expires_at: number;
  quiet_until: number;
  state: string;
}

const VISIBLE_RADIUS_M = 5_000;
const NEAREST = 8;
const TRAIL_KEEP_MS = 86_400_000;

function pickRarity(): Rarity {
  const { common, rare, epic } = DROP.mix;
  const roll = randomInt(common + rare + epic);
  return roll < common ? "common" : roll < common + rare ? "rare" : "epic";
}

function dropUsd(r: Rarity): number {
  const [lo, hi] = DROP.normalUsd;
  const base = lo + (randomInt(1_000_000) / 1_000_000) * (hi - lo);
  return Math.max(DROP.floorUsd, Math.round(base * rarityMult(r) * 100) / 100);
}

/** Choose a stock the vault can actually pay, weighted towards whatever it holds most of. */
async function pickStock(usd: number): Promise<StockSym | null> {
  const hs = (await holdings()).filter((h) => canPay(h, usd));
  if (!hs.length) return null;
  const total = hs.reduce((t, h) => t + h.availableUsd, 0);
  let roll = (randomInt(1_000_000) / 1_000_000) * total;
  for (const h of hs) {
    roll -= h.availableUsd;
    if (roll <= 0) return h.sym;
  }
  return hs[hs.length - 1].sym;
}

function expireOld(t: number): void {
  db.prepare("UPDATE spawns SET state = 'expired' WHERE state = 'open' AND expires_at < ?").run(t);
}

/** Give this player their personal drop if they have none open. Returns it, or null if the vault is dry. */
export async function ensurePersonalDrop(wallet: Address, at: LatLng): Promise<SpawnRow | null> {
  const t = now();
  expireOld(t);
  const open = db.prepare("SELECT COUNT(*) AS n FROM spawns WHERE owner = ? AND state = 'open'").get(wallet) as { n: number };
  if (open.n >= STREET.perPlayer) return null;

  const rarity = pickRarity();
  const usd = dropUsd(rarity);
  const sym = await pickStock(usd);
  if (!sym) return null;

  const user = db.prepare("SELECT drops_given FROM users WHERE wallet = ?").get(wallet) as { drops_given: number } | undefined;
  const first = !user || user.drops_given === 0;
  const dist = first ? STREET.firstDropM : STREET.ringMinM + randomInt(STREET.ringM - STREET.ringMinM + 1);
  const p = destination(at, dist, randomInt(360));

  const row: SpawnRow = {
    id: randomUUID(),
    owner: wallet,
    sym,
    usd,
    rarity,
    lat: p.lat,
    lng: p.lng,
    placed_lat: at.lat,
    placed_lng: at.lng,
    city: cityFor(p),
    created_at: t,
    expires_at: t + STREET.lifeMin * 60_000,
    quiet_until: 0,
    state: "open",
  };
  tx(() => {
    db.prepare(
      `INSERT INTO spawns (id, owner, sym, usd, rarity, lat, lng, placed_lat, placed_lng, city, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(row.id, wallet, sym, usd, rarity, row.lat, row.lng, at.lat, at.lng, row.city, t, row.expires_at);
    db.prepare("UPDATE users SET drops_given = drops_given + 1 WHERE wallet = ?").run(wallet);
  });
  reserve(sym, usd);
  return row;
}

export function recordPosition(wallet: Address, fix: Fix, deviceId: string | undefined): void {
  db.prepare("INSERT INTO positions (wallet, lat, lng, accuracy, ts, device_id) VALUES (?, ?, ?, ?, ?, ?)").run(
    wallet,
    fix.lat,
    fix.lng,
    fix.accuracy,
    fix.ts,
    deviceId ?? null,
  );
  // privacy: the trail exists to check a walk, not to remember one
  db.prepare("DELETE FROM positions WHERE ts < ?").run(now() - TRAIL_KEEP_MS);
}

export interface NearbyDrop {
  id: string;
  sym: StockSym;
  name: string;
  usd: number;
  amount: number;
  rarity: Rarity;
  lat: number;
  lng: number;
  meters: number;
  inReach: boolean;
  mine: boolean;
  expiresAt: number;
  quietUntil: number;
}

export function nearbyDrops(wallet: Address | null, at: Fix): NearbyDrop[] {
  const t = now();
  expireOld(t);
  // cheap bounding box first, exact distance after
  const dLat = VISIBLE_RADIUS_M / 111_320;
  const dLng = VISIBLE_RADIUS_M / (111_320 * Math.max(0.01, Math.cos((at.lat * Math.PI) / 180)));
  const rows = db
    .prepare(
      `SELECT * FROM spawns WHERE state = 'open' AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`,
    )
    .all(at.lat - dLat, at.lat + dLat, at.lng - dLng, at.lng + dLng) as unknown as SpawnRow[];

  const caught = new Set(
    wallet
      ? (db.prepare("SELECT spawn_id FROM catches WHERE wallet = ? AND state != 'failed' AND created_at > ?").all(wallet, t - 86_400_000) as {
          spawn_id: string;
        }[]).map((r) => r.spawn_id)
      : [],
  );
  const reach = reachFor(at.accuracy);
  return rows
    .filter((r) => !caught.has(r.id))
    .map((r) => {
      const meters = distanceM(at, r);
      const h = holding(r.sym);
      return {
        id: r.id,
        sym: r.sym,
        name: stocks.find((s) => s.sym === r.sym)?.name ?? r.sym,
        usd: r.usd,
        amount: h ? r.usd / h.priceUsd : 0,
        rarity: r.rarity,
        lat: r.lat,
        lng: r.lng,
        meters,
        inReach: meters <= reach,
        mine: r.owner === wallet,
        expiresAt: r.expires_at,
        quietUntil: r.quiet_until,
      };
    })
    .sort((a, b) => a.meters - b.meters)
    .slice(0, NEAREST);
}

export interface ClaimInput {
  spawnId: string;
  fix: Fix;
  log: Fix[];
  motion: Motion[];
  deviceId: string;
  clientTime: number;
  ip: string;
}

export interface CatchRow {
  id: string;
  spawn_id: string;
  wallet: string;
  sym: StockSym;
  token: string | null;
  amount: string;
  usd: number;
  kind: string;
  state: "sending" | "landed" | "failed" | "demo";
  tx_hash: string | null;
  error: string | null;
  walk_m: number;
  city: string | null;
  created_at: number;
  landed_at: number | null;
}

function counters(wallet: string, spawn: SpawnRow, input: ClaimInput, t: number) {
  const day = startOfUtcDay(t);
  const one = <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T;
  const mine = one<{ n: number; last: number | null }>(
    "SELECT COUNT(*) AS n, MAX(created_at) AS last FROM catches WHERE wallet = ? AND kind = 'street' AND state != 'failed' AND created_at >= ?",
    wallet,
    day,
  );
  const last = one<{ last: number | null }>(
    "SELECT MAX(created_at) AS last FROM catches WHERE wallet = ? AND kind = 'street' AND state != 'failed'",
    wallet,
  );
  const dev = one<{ n: number; w: number; me: number }>(
    "SELECT COUNT(*) AS n, COUNT(DISTINCT wallet) AS w, SUM(wallet = ?) AS me FROM catches WHERE device_id = ? AND state != 'failed' AND created_at >= ?",
    wallet,
    input.deviceId,
    day,
  );
  const net = one<{ n: number; w: number; me: number }>(
    "SELECT COUNT(*) AS n, COUNT(DISTINCT wallet) AS w, SUM(wallet = ?) AS me FROM catches WHERE ip = ? AND state != 'failed' AND created_at >= ?",
    wallet,
    input.ip,
    day,
  );
  const sq = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM catches WHERE cell = ? AND state != 'failed' AND created_at >= ?",
    cellKey(spawn, CATCH.squareM),
    day,
  );
  const again = one<{ n: number }>("SELECT COUNT(*) AS n FROM catches WHERE spawn_id = ? AND wallet = ? AND state != 'failed'", spawn.id, wallet);
  return {
    c: {
      catchesToday: mine.n,
      lastCatchAt: last.last,
      deviceCatchesToday: dev.n,
      deviceWalletsToday: dev.w,
      networkCatchesToday: net.n,
      networkWalletsToday: net.w,
      squareCatchesToday: sq.n,
      alreadyCaughtThisDrop: again.n > 0,
      dropQuietUntil: spawn.quiet_until,
    },
    newOnDevice: !dev.me,
    newOnNetwork: !net.me,
  };
}

/**
 * Check the walk and, if it holds, write a `sending` catch. Payment happens in the
 * payout worker. Everything from the re-read of the drop to the insert is one
 * transaction, so the quiet window and one-per-wallet rule can't be raced.
 */
export async function claim(wallet: Address, input: ClaimInput): Promise<CatchRow> {
  const t = now();
  await holdings(); // make sure prices are warm before we price the payout
  return tx(() => {
    const spawn = db.prepare("SELECT * FROM spawns WHERE id = ?").get(input.spawnId) as SpawnRow | undefined;
    if (!spawn || spawn.state !== "open" || spawn.expires_at < t) throw new HttpError(410, "This one is gone. New ones land through the day.", "gone");

    const trail = db
      .prepare("SELECT lat, lng, accuracy, ts FROM positions WHERE wallet = ? AND ts > ? ORDER BY ts")
      .all(wallet, t - 30 * 60_000) as unknown as Fix[];
    const evidence: Evidence = {
      fix: input.fix,
      log: input.log,
      motion: input.motion,
      clientTime: input.clientTime,
      serverTime: t,
      drop: spawn,
      trail,
    };
    const { c, newOnDevice, newOnNetwork } = counters(wallet, spawn, input, t);
    const verdict = evaluate(evidence, c, { newOnDevice, newOnNetwork });
    if (!verdict.ok) throw new HttpError(422, verdict.why, verdict.code);

    const h = holding(spawn.sym);
    const stock = stocks.find((s) => s.sym === spawn.sym);
    if (!h || h.priceUsd <= 0) throw new HttpError(503, "Reading this one from the server. Try again in a moment.", "price");
    // the owner's catch was reserved when the drop was placed; anyone else's is new money
    if (spawn.owner !== wallet) {
      if (!canPay(h, spawn.usd)) throw new HttpError(409, "The vault is being topped up. This one pays again soon.", "budget");
      reserve(spawn.sym, spawn.usd);
    }
    const tokens = spawn.usd / h.priceUsd;

    const row: CatchRow = {
      id: randomUUID(),
      spawn_id: spawn.id,
      wallet,
      sym: spawn.sym,
      token: stock?.address ?? null,
      amount: toRaw(tokens).toString(),
      usd: spawn.usd,
      kind: "street",
      state: "sending",
      tx_hash: null,
      error: null,
      // the walk proof: straight line from where the owner stood when it was placed
      walk_m: distanceM({ lat: spawn.placed_lat, lng: spawn.placed_lng }, spawn),
      city: spawn.city,
      created_at: t,
      landed_at: null,
    };
    db.prepare(
      `INSERT INTO catches (id, spawn_id, wallet, sym, token, amount, usd, state, walk_m, city, cell, device_id, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'sending', ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.id,
      spawn.id,
      wallet,
      spawn.sym,
      row.token,
      row.amount,
      spawn.usd,
      row.walk_m,
      spawn.city,
      cellKey(spawn, CATCH.squareM),
      input.deviceId,
      input.ip,
      t,
    );
    // the owner's drop is spent once they take it; others can still find it until it expires
    const spent = spawn.owner === wallet ? "spent" : "open";
    db.prepare("UPDATE spawns SET quiet_until = ?, state = ? WHERE id = ?").run(t + CATCH.quietMin * 60_000, spent, spawn.id);
    return row;
  });
}

/** Undo the side effects of a failed payout: the drop stays on the map and nothing is spent. */
export function releaseFailedCatch(c: CatchRow): void {
  db.prepare("UPDATE spawns SET quiet_until = 0, state = CASE WHEN expires_at > ? THEN 'open' ELSE state END WHERE id = ?").run(
    now(),
    c.spawn_id,
  );
}

export function getCatch(id: string): CatchRow | undefined {
  return db.prepare("SELECT * FROM catches WHERE id = ?").get(id) as CatchRow | undefined;
}

export const isLive = () => config.live;
