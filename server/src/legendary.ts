import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Address } from "viem";
import { LEGENDARY, reachFor, type StockSym } from "../../shared/rules.ts";
import { distanceM } from "../../shared/geo.ts";
import { config, stocks } from "./config.ts";
import { db, now, tx } from "./db.ts";
import { holding, holdings, toRaw } from "./market.ts";
import { checkGpsLog, type Fix, type Motion, checkMotion } from "./anticheat.ts";
import { HttpError } from "./auth.ts";
import { keccak256, toHex } from "viem";
import { dropVaultAbi, publicClient, walletClient, keeperAccount, robinhoodChain } from "./chain.ts";

/**
 * Once a week a whole share is put down at one spot. Announced 24 h ahead, open for
 * 60 minutes, 25 m radius, and a short code physically stuck to the spot: GPS spoofing
 * gets nothing because the code is not on the internet. The first valid catch wins; the
 * winner slot is written before the payout is sent, so two people cannot both win.
 */

export interface LegendaryRow {
  id: string;
  city: string;
  spot: string;
  lat: number;
  lng: number;
  code_hash: string;
  sym: StockSym;
  shares: number;
  starts_at: number;
  ends_at: number;
  winner: string | null;
  catch_id: string | null;
}

const hashCode = (code: string) =>
  createHmac("sha256", config.LEGENDARY_PEPPER).update(code.trim().toUpperCase()).digest("hex");

export function createLegendary(input: { city: string; spot: string; lat: number; lng: number; code: string; sym: StockSym; startsAt: number }) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO legendary (id, city, spot, lat, lng, code_hash, sym, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.city, input.spot, input.lat, input.lng, hashCode(input.code), input.sym, input.startsAt, input.startsAt + LEGENDARY.windowMin * 60_000);
  return id;
}

export async function legendaryOverview() {
  const t = now();
  const next = db
    .prepare("SELECT * FROM legendary WHERE ends_at > ? AND winner IS NULL ORDER BY starts_at LIMIT 1")
    .get(t) as LegendaryRow | undefined;
  const past = db
    .prepare(
      `SELECT l.*, c.tx_hash, c.state FROM legendary l LEFT JOIN catches c ON c.id = l.catch_id
       WHERE l.winner IS NOT NULL OR l.ends_at <= ? ORDER BY l.starts_at DESC LIMIT 12`,
    )
    .all(t) as unknown as (LegendaryRow & { tx_hash: string | null; state: string | null })[];
  await holdings();
  const price = (sym: StockSym) => holding(sym)?.priceUsd ?? 0;

  // the spot is only revealed LEGENDARY.announceHoursAhead before the window
  const announced = next && next.starts_at - t <= LEGENDARY.announceHoursAhead * 3_600_000;
  return {
    next: next
      ? {
          id: next.id,
          sym: next.sym,
          name: stocks.find((s) => s.sym === next.sym)?.name ?? next.sym,
          usd: price(next.sym) * next.shares,
          startsAt: next.starts_at,
          endsAt: next.ends_at,
          announced: Boolean(announced),
          city: announced ? next.city : null,
          spot: announced ? next.spot : null,
          lat: announced ? next.lat : null,
          lng: announced ? next.lng : null,
          radiusM: LEGENDARY.radiusM,
          open: next.starts_at <= t && t < next.ends_at,
        }
      : null,
    past: past.map((p) => ({
      id: p.id,
      city: p.city,
      spot: p.spot,
      sym: p.sym,
      at: p.starts_at,
      winner: p.winner,
      txHash: p.tx_hash,
      state: p.state,
    })),
  };
}

export async function claimLegendary(
  wallet: Address,
  input: { id: string; code: string; fix: Fix; log: Fix[]; motion: Motion[]; clientTime: number; deviceId: string; ip: string },
) {
  const t = now();
  await holdings();
  const row = tx(() => {
    const l = db.prepare("SELECT * FROM legendary WHERE id = ?").get(input.id) as LegendaryRow | undefined;
    if (!l) throw new HttpError(404, "No such legendary.");
    if (t < l.starts_at) throw new HttpError(425, "The window is not open yet.", "early");
    if (t >= l.ends_at || l.winner) throw new HttpError(410, "Taken or closed. Next week, another city.", "gone");

    const ev = { fix: input.fix, log: input.log, motion: input.motion, clientTime: input.clientTime, serverTime: t, drop: l, trail: [] };
    const bad = checkGpsLog(ev) ?? checkMotion(input.motion);
    if (bad && !bad.ok) throw new HttpError(422, bad.why, bad.code);
    const d = distanceM(input.fix, l);
    const reach = reachFor(input.fix.accuracy, LEGENDARY.radiusM);
    if (d > reach) throw new HttpError(422, `You have to be standing there. ${Math.round(d - reach)} m to go.`, "far");

    const given = Buffer.from(hashCode(input.code), "hex");
    const want = Buffer.from(l.code_hash, "hex");
    if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(422, "That code is not the one on the spot.", "code");

    const h = holding(l.sym);
    if (!h) throw new HttpError(503, "Reading the price. Try again in a moment.");
    const catchId = randomUUID();
    // winner slot first: the UPDATE only succeeds for the first caller
    const won = db.prepare("UPDATE legendary SET winner = ?, catch_id = ? WHERE id = ? AND winner IS NULL").run(wallet, catchId, l.id);
    if (won.changes !== 1) throw new HttpError(410, "Someone got there first.", "gone");
    db.prepare(
      `INSERT INTO catches (id, spawn_id, wallet, sym, token, amount, usd, kind, state, walk_m, city, device_id, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'legendary', 'sending', 0, ?, ?, ?, ?)`,
    ).run(catchId, l.id, wallet, l.sym, stocks.find((s) => s.sym === l.sym)?.address ?? null, toRaw(l.shares).toString(), h.priceUsd * l.shares, l.city, input.deviceId, input.ip, t);
    return { catchId, l };
  });

  // pay outside the lock
  if (!config.live || !walletClient || !keeperAccount || !config.DROP_VAULT) {
    db.prepare("UPDATE catches SET state = 'demo', landed_at = ? WHERE id = ?").run(now(), row.catchId);
    return { catchId: row.catchId };
  }
  const c = db.prepare("SELECT * FROM catches WHERE id = ?").get(row.catchId) as { token: Address; amount: string };
  try {
    const hash = await walletClient.writeContract({
      address: config.DROP_VAULT,
      abi: dropVaultAbi,
      functionName: "payLegendary",
      args: [keccak256(toHex(row.catchId)), c.token, wallet, BigInt(c.amount)],
      account: keeperAccount,
      chain: robinhoodChain,
    });
    db.prepare("UPDATE catches SET tx_hash = ? WHERE id = ?").run(hash, row.catchId);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    db.prepare("UPDATE catches SET state = ?, landed_at = ? WHERE id = ?").run(receipt.status === "success" ? "landed" : "failed", now(), row.catchId);
  } catch (e) {
    // the winner stays the winner; an operator re-sends. Never hand the slot to someone else.
    db.prepare("UPDATE catches SET error = ? WHERE id = ?").run(String((e as Error).message).slice(0, 300), row.catchId);
  }
  return { catchId: row.catchId };
}
