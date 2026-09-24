import { formatEther } from "viem";
import { DROP, SPLIT } from "../../shared/rules.ts";
import { config } from "./config.ts";
import { addressUrl, feeSplitterAbi, publicClient, txUrl } from "./chain.ts";
import { db, now, startOfUtcDay } from "./db.ts";
import { holdings } from "./market.ts";
import { fromRaw } from "./market.ts";

/** Everything public: stats, the vault, the leaderboard, the claim feed, the proof page. */

const PAID = "state IN ('landed','demo')";
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const avgDropUsd = ((DROP.normalUsd[0] + DROP.normalUsd[1]) / 2) * ((DROP.mix.common + DROP.mix.rare * 2 + DROP.mix.epic * 4) / 8);

export async function vaultView() {
  const hs = await holdings();
  return {
    live: config.live,
    address: config.DROP_VAULT ?? null,
    explorer: config.DROP_VAULT ? addressUrl(config.DROP_VAULT) : null,
    reserveUsd: hs.reduce((t, h) => t + h.availableUsd, 0),
    holdings: hs.map((h) => ({
      sym: h.sym,
      name: h.name,
      address: h.address ?? null,
      priceUsd: h.priceUsd,
      tokens: h.available,
      usd: h.availableUsd,
      dropsPayable: Math.floor(h.availableUsd / avgDropUsd),
    })),
  };
}

export async function statsView() {
  const t = now();
  const one = <T>(sql: string, ...a: (string | number)[]) => db.prepare(sql).get(...a) as T;
  const all = one<{ usd: number; n: number; walkers: number; cities: number; walk: number }>(
    `SELECT COALESCE(SUM(usd),0) usd, COUNT(*) n, COUNT(DISTINCT wallet) walkers, COUNT(DISTINCT city) cities, COALESCE(SUM(walk_m),0) walk FROM catches WHERE ${PAID}`,
  );
  const today = one<{ usd: number; n: number }>(`SELECT COALESCE(SUM(usd),0) usd, COUNT(*) n FROM catches WHERE ${PAID} AND created_at >= ?`, startOfUtcDay(t));
  const onMap = one<{ n: number; usd: number }>("SELECT COUNT(*) n, COALESCE(SUM(usd),0) usd FROM spawns WHERE state = 'open' AND expires_at > ?", t);
  const speed = db
    .prepare(`SELECT landed_at - created_at d FROM catches WHERE state = 'landed' AND landed_at IS NOT NULL ORDER BY created_at DESC LIMIT 101`)
    .all() as { d: number }[];
  const sorted = speed.map((r) => r.d).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  const days = db
    .prepare(
      `SELECT (created_at / 86400000) * 86400000 AS day, COALESCE(SUM(usd),0) usd, COUNT(*) n FROM catches WHERE ${PAID} AND created_at >= ? GROUP BY day ORDER BY day`,
    )
    .all(startOfUtcDay(t) - 13 * 86_400_000) as { day: number; usd: number; n: number }[];
  const cities = db
    .prepare(`SELECT city, COUNT(*) n, COALESCE(SUM(usd),0) usd FROM catches WHERE ${PAID} AND city IS NOT NULL GROUP BY city ORDER BY n DESC LIMIT 20`)
    .all() as { city: string; n: number; usd: number }[];
  const bySym = db
    .prepare(`SELECT sym, COUNT(*) n, COALESCE(SUM(usd),0) usd FROM catches WHERE ${PAID} GROUP BY sym ORDER BY usd DESC`)
    .all() as { sym: string; n: number; usd: number }[];

  const vault = await vaultView();
  return {
    live: config.live,
    givenUsd: all.usd,
    catches: all.n,
    todayUsd: today.usd,
    todayCatches: today.n,
    readyUsd: vault.reserveUsd,
    dropsPayable: vault.holdings.reduce((t2, h) => t2 + h.dropsPayable, 0),
    onMap: onMap.n,
    walkers: all.walkers,
    cities: all.cities,
    walkedKm: all.walk / 1000,
    medianLandMs: median,
    days,
    topCities: cities,
    bySym,
    split: SPLIT,
  };
}

export function claimsFeed(limit = 20) {
  const rows = db
    .prepare(`SELECT id, wallet, sym, usd, kind, state, tx_hash, city, created_at FROM catches WHERE ${PAID} ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as { id: string; wallet: string; sym: string; usd: number; kind: string; state: string; tx_hash: string | null; city: string; created_at: number }[];
  return rows.map((r) => ({
    id: r.id,
    walker: shortAddr(r.wallet),
    sym: r.sym,
    usd: r.usd,
    kind: r.kind,
    demo: r.state === "demo",
    tx: r.tx_hash ? txUrl(r.tx_hash) : null,
    city: r.city,
    at: r.created_at,
  }));
}

export function board(limit = 50) {
  // counted from what was caught, not what is held: sending your stock out changes nothing here
  const rows = db
    .prepare(
      `SELECT c.wallet, u.handle, COUNT(*) n, COALESCE(SUM(c.usd),0) usd, COALESCE(SUM(c.walk_m),0) walk
       FROM catches c LEFT JOIN users u ON u.wallet = c.wallet
       WHERE c.${PAID} GROUP BY c.wallet ORDER BY usd DESC, n DESC LIMIT ?`,
    )
    .all(limit) as { wallet: string; handle: string | null; n: number; usd: number; walk: number }[];
  return rows.map((r, i) => ({
    rank: i + 1,
    walker: r.handle ?? shortAddr(r.wallet),
    wallet: r.wallet,
    catches: r.n,
    usd: r.usd,
    walkedKm: r.walk / 1000,
    steps: Math.round(r.walk / 0.762),
  }));
}

export async function proofView() {
  let splitter: Record<string, string> | null = null;
  if (config.live && config.FEE_SPLITTER) {
    try {
      const read = (fn: "totalToMap" | "totalToTeam" | "totalBurnEth" | "totalWalkBurned" | "burnReserve") =>
        publicClient.readContract({ address: config.FEE_SPLITTER!, abi: feeSplitterAbi, functionName: fn });
      const [map, team, burnEth, burned, reserve] = await Promise.all([
        read("totalToMap"),
        read("totalToTeam"),
        read("totalBurnEth"),
        read("totalWalkBurned"),
        read("burnReserve"),
      ]);
      splitter = {
        toMapEth: formatEther(map),
        toTeamEth: formatEther(team),
        burnEth: formatEther(burnEth),
        walkBurned: formatEther(burned),
        burnReserveEth: formatEther(reserve),
      };
    } catch (e) {
      console.warn("[proof] splitter read failed", (e as Error).message);
    }
  }
  const payouts = db
    .prepare(`SELECT wallet, sym, amount, usd, tx_hash, created_at FROM catches WHERE state = 'landed' AND tx_hash IS NOT NULL ORDER BY created_at DESC LIMIT 25`)
    .all() as { wallet: string; sym: string; amount: string; usd: number; tx_hash: string; created_at: number }[];
  const addr = (a?: string) => (a ? { address: a, url: addressUrl(a) } : null);
  return {
    live: config.live,
    chainId: config.CHAIN_ID,
    explorer: config.EXPLORER_URL,
    addresses: {
      vault: addr(config.DROP_VAULT),
      splitter: addr(config.FEE_SPLITTER),
      token: addr(config.WALK_TOKEN),
    },
    split: SPLIT,
    splitter,
    payouts: payouts.map((p) => ({
      walker: shortAddr(p.wallet),
      sym: p.sym,
      tokens: fromRaw(p.amount),
      usd: p.usd,
      tx: txUrl(p.tx_hash),
      at: p.created_at,
    })),
  };
}
