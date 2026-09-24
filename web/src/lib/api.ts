import type { Rarity, StockSym } from "../../../shared/rules.ts";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) throw new ApiError(body.error ?? `${path} → ${res.status}`, res.status, body.code);
  return body as T;
}

export const getJson = <T>(path: string) => request<T>(path);
export const postJson = <T>(path: string, data: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(data) });

// ─── shapes ───

export interface Drop {
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

export interface Claim {
  id: string;
  walker: string;
  sym: string;
  usd: number;
  kind: string;
  demo: boolean;
  tx: string | null;
  city: string;
  at: number;
}

export interface Stats {
  live: boolean;
  givenUsd: number;
  catches: number;
  todayUsd: number;
  todayCatches: number;
  readyUsd: number;
  dropsPayable: number;
  onMap: number;
  walkers: number;
  cities: number;
  walkedKm: number;
  medianLandMs: number | null;
  days: { day: number; usd: number; n: number }[];
  topCities: { city: string; n: number; usd: number }[];
  bySym: { sym: string; n: number; usd: number }[];
  split: { map: number; burn: number; team: number };
}

export interface Vault {
  live: boolean;
  address: string | null;
  explorer: string | null;
  reserveUsd: number;
  holdings: { sym: string; name: string; address: string | null; priceUsd: number; tokens: number; usd: number; dropsPayable: number }[];
}

export interface Me {
  wallet: string | null;
  handle?: string | null;
  catchesToday?: number;
  perDay?: number;
  nextCatchAt?: number | null;
  totalUsd?: number;
  catches?: { id: string; sym: string; tokens: number; usd: number; state: string; kind: string; tx: string | null; walkM: number; at: number }[];
}

export interface CatchState {
  id: string;
  state: "sending" | "landed" | "failed" | "demo";
  sym: string;
  tokens: number;
  usd: number;
  tx: string | null;
  walkM: number;
  steps: number;
  kcal: number;
  error: string | null;
  timedOut?: boolean;
}

export interface LegendaryView {
  next: {
    id: string;
    sym: string;
    name: string;
    usd: number;
    startsAt: number;
    endsAt: number;
    announced: boolean;
    city: string | null;
    spot: string | null;
    lat: number | null;
    lng: number | null;
    radiusM: number;
    open: boolean;
  } | null;
  past: { id: string; city: string; spot: string; sym: string; at: number; winner: string | null; txHash: string | null; state: string | null }[];
}

export interface Proof {
  live: boolean;
  chainId: number;
  explorer: string;
  addresses: Record<"vault" | "splitter" | "token", { address: string; url: string } | null>;
  split: { map: number; burn: number; team: number };
  splitter: Record<string, string> | null;
  payouts: { walker: string; sym: string; tokens: number; usd: number; tx: string; at: number }[];
}

export interface BoardRow {
  rank: number;
  walker: string;
  wallet: string;
  catches: number;
  usd: number;
  walkedKm: number;
  steps: number;
}

/** Poll a catch until it leaves `sending`. The UI shows a spinner meanwhile. */
export async function waitForCatch(id: string, timeoutMs = 30_000, everyMs = 900): Promise<CatchState> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const c = await getJson<CatchState>(`/catch/${id}`);
    if (c.state !== "sending") return c;
    if (Date.now() > until) return { ...c, timedOut: true };
    await new Promise((r) => setTimeout(r, everyMs));
  }
}
