import { formatUnits, parseUnits } from "viem";
import { config, stocks, type StockConfig } from "./config.ts";
import { aggregatorAbi, erc20Abi, dropVaultAbi, publicClient } from "./chain.ts";
import { db } from "./db.ts";
import type { StockSym } from "../../shared/rules.ts";

/**
 * Prices and the vault's inventory.
 *
 * Live: prices come from each stock's Chainlink feed (already multiplier-adjusted),
 * balances from balanceOf(vault), and the vault's own on-chain daily cap is respected.
 * Demo: fixed reference prices with a little drift, and a virtual vault of
 * DEMO_VAULT_USD per stock that shrinks as people catch.
 */

const DEMO_PRICE: Record<StockSym, number> = { NVDA: 180, TSLA: 420, AAPL: 250, AMZN: 230, META: 750 };
const STOCK_DECIMALS = 18;

export interface Holding {
  sym: StockSym;
  name: string;
  address?: string;
  priceUsd: number;
  /** tokens the vault holds, minus catches still in flight */
  available: number;
  availableUsd: number;
  /** from the vault contract when live, otherwise unlimited */
  remainingTodayUsd: number;
  live: boolean;
  priceAt: number;
}

const cache = new Map<StockSym, Holding>();
let refreshedAt = 0;

async function readPrice(s: StockConfig): Promise<{ price: number; at: number }> {
  if (!config.live || !s.feed) {
    const drift = 1 + Math.sin(Date.now() / 3.6e6 + s.sym.length) * 0.01;
    return { price: DEMO_PRICE[s.sym] * drift, at: Date.now() };
  }
  const [dec, round] = await Promise.all([
    publicClient.readContract({ address: s.feed, abi: aggregatorAbi, functionName: "decimals" }),
    publicClient.readContract({ address: s.feed, abi: aggregatorAbi, functionName: "latestRoundData" }),
  ]);
  const [, answer, , updatedAt] = round;
  if (answer <= 0n) throw new Error(`${s.sym} feed returned ${answer}`);
  return { price: Number(formatUnits(answer, dec)), at: Number(updatedAt) * 1000 };
}

function inFlight(sym: StockSym): number {
  const rows = db.prepare("SELECT amount FROM catches WHERE sym = ? AND state = 'sending'").all(sym) as { amount: string }[];
  return rows.reduce((t, r) => t + Number(formatUnits(BigInt(r.amount), STOCK_DECIMALS)), 0);
}

/** USD promised to drops still lying on the map: they must stay payable. */
function onMapUsd(sym: StockSym): number {
  const r = db.prepare("SELECT COALESCE(SUM(usd),0) AS usd FROM spawns WHERE sym = ? AND state = 'open' AND expires_at > ?").get(sym, Date.now()) as { usd: number };
  return r.usd;
}

function demoSpent(sym: StockSym): number {
  const r = db.prepare("SELECT COALESCE(SUM(usd),0) AS usd FROM catches WHERE sym = ? AND state IN ('demo','sending')").get(sym) as {
    usd: number;
  };
  return r.usd;
}

export async function refreshMarket(): Promise<void> {
  const active = stocks.filter((s) => !config.live || (s.address && s.feed));
  await Promise.all(
    active.map(async (s) => {
      try {
        const { price, at } = await readPrice(s);
        let available: number;
        let remainingTodayUsd = Number.POSITIVE_INFINITY;
        if (config.live && s.address && config.DROP_VAULT) {
          const [bal, rem] = await Promise.all([
            publicClient.readContract({ address: s.address, abi: erc20Abi, functionName: "balanceOf", args: [config.DROP_VAULT] }),
            publicClient.readContract({ address: config.DROP_VAULT, abi: dropVaultAbi, functionName: "remainingToday", args: [s.address] }),
          ]);
          available = Math.max(0, Number(formatUnits(bal, STOCK_DECIMALS)) - inFlight(s.sym) - onMapUsd(s.sym) / price);
          remainingTodayUsd = Number(formatUnits(rem, STOCK_DECIMALS)) * price;
        } else {
          const phaseOpen = s.phase === "launch";
          available = phaseOpen ? Math.max(0, config.DEMO_VAULT_USD - demoSpent(s.sym) - onMapUsd(s.sym)) / price : 0;
        }
        cache.set(s.sym, {
          sym: s.sym,
          name: s.name,
          address: s.address,
          priceUsd: price,
          available,
          availableUsd: available * price,
          remainingTodayUsd,
          live: config.live,
          priceAt: at,
        });
      } catch (err) {
        // keep the last good reading; a stale price is better than an empty map
        console.warn(`[market] ${s.sym}: ${(err as Error).message}`);
      }
    }),
  );
  refreshedAt = Date.now();
}

export async function holdings(maxAgeMs = 60_000): Promise<Holding[]> {
  if (Date.now() - refreshedAt > maxAgeMs || cache.size === 0) await refreshMarket();
  return [...cache.values()];
}

/** Can the vault pay `usd` of `sym` right now, today? */
export function canPay(h: Holding, usd: number): boolean {
  return h.availableUsd >= usd && h.remainingTodayUsd >= usd;
}

/** Deduct locally so back-to-back spawns in the same tick see the reservation. */
export function reserve(sym: StockSym, usd: number): void {
  const h = cache.get(sym);
  if (!h) return;
  h.availableUsd = Math.max(0, h.availableUsd - usd);
  h.available = h.availableUsd / h.priceUsd;
  if (Number.isFinite(h.remainingTodayUsd)) h.remainingTodayUsd -= usd;
}

export function toRaw(tokens: number): bigint {
  // 9 significant decimals is far below a cent for any listed stock
  return parseUnits(tokens.toFixed(9), STOCK_DECIMALS);
}

export function fromRaw(raw: bigint | string): number {
  return Number(formatUnits(BigInt(raw), STOCK_DECIMALS));
}

export function holding(sym: StockSym): Holding | undefined {
  return cache.get(sym);
}
