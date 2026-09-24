import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { CATCH } from "../../shared/rules.ts";
import { config } from "./config.ts";
import { db, now, startOfUtcDay } from "./db.ts";
import { clearSession, HttpError, issueNonce, requireWallet, sessionWallet, setSession, verifySignIn } from "./auth.ts";
import { claim, ensurePersonalDrop, getCatch, nearbyDrops, recordPosition } from "./game.ts";
import { board, claimsFeed, proofView, statsView, vaultView } from "./stats.ts";
import { claimLegendary, legendaryOverview } from "./legendary.ts";
import { fromRaw } from "./market.ts";
import { txUrl } from "./chain.ts";

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const accuracy = z.number().min(0).max(10_000);
const Fix = z.object({ lat, lng, accuracy, ts: z.number().int() });
const Motion = z.object({ x: z.number(), y: z.number(), z: z.number() });
const DeviceId = z.string().min(8).max(64);

const Position = z.object({ lat, lng, accuracy, device_id: DeviceId.optional() });
const Claim = z.object({
  spawn_id: z.string().uuid(),
  lat,
  lng,
  accuracy,
  gps_log: z.array(Fix).max(60),
  motion: z.array(Motion).max(64),
  device_id: DeviceId,
  client_time: z.string().datetime(),
});
const LegendaryClaim = Claim.omit({ spawn_id: true }).extend({ id: z.string().uuid(), code: z.string().min(3).max(16) });
const Verify = z.object({ message: z.string().max(2_000), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) });
const Handle = z.object({ handle: z.string().trim().min(2).max(24).regex(/^[\w.@-]+$/) });

const ip = (req: FastifyRequest) => req.ip;
const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, r.error.issues[0]?.message ?? "Bad request.", "validation");
  return r.data;
};

export async function routes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true, live: config.live, chainId: config.CHAIN_ID, testMode: config.testMode }));

  // ─── auth ───
  app.get("/auth/nonce", async () => ({ nonce: issueNonce(), chainId: config.CHAIN_ID, domain: config.siweDomain }));

  app.post("/auth/verify", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { message, signature } = parse(Verify, req.body);
    const wallet = await verifySignIn(message, signature as `0x${string}`);
    setSession(reply, wallet);
    return { ok: true, wallet };
  });

  app.post("/auth/logout", async (_req, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  app.get("/me", async (req) => {
    const wallet = sessionWallet(req);
    if (!wallet) return { wallet: null };
    const t = now();
    const user = db.prepare("SELECT handle, created_at FROM users WHERE wallet = ?").get(wallet) as { handle: string | null; created_at: number };
    const today = db
      .prepare("SELECT COUNT(*) n, MAX(created_at) last FROM catches WHERE wallet = ? AND kind = 'street' AND state != 'failed' AND created_at >= ?")
      .get(wallet, startOfUtcDay(t)) as { n: number; last: number | null };
    const last = db
      .prepare("SELECT MAX(created_at) last FROM catches WHERE wallet = ? AND kind = 'street' AND state != 'failed'")
      .get(wallet) as { last: number | null };
    const mine = db
      .prepare("SELECT id, sym, amount, usd, state, tx_hash, walk_m, created_at, kind FROM catches WHERE wallet = ? ORDER BY created_at DESC LIMIT 50")
      .all(wallet) as { id: string; sym: string; amount: string; usd: number; state: string; tx_hash: string | null; walk_m: number; created_at: number; kind: string }[];
    const nextAt = last.last ? last.last + CATCH.cooldownMin * 60_000 : null;
    return {
      wallet,
      handle: user?.handle ?? null,
      catchesToday: today.n,
      perDay: CATCH.perWalletPerDay,
      nextCatchAt: nextAt && nextAt > t ? nextAt : null,
      totalUsd: mine.filter((m) => m.state !== "failed").reduce((s, m) => s + m.usd, 0),
      catches: mine.map((m) => ({
        id: m.id,
        sym: m.sym,
        tokens: fromRaw(m.amount),
        usd: m.usd,
        state: m.state,
        kind: m.kind,
        tx: m.tx_hash ? txUrl(m.tx_hash) : null,
        walkM: m.walk_m,
        at: m.created_at,
      })),
    };
  });

  app.post("/me/handle", async (req) => {
    const wallet = requireWallet(req);
    const { handle } = parse(Handle, req.body);
    db.prepare("UPDATE users SET handle = ? WHERE wallet = ?").run(handle, wallet);
    return { ok: true };
  });

  // ─── the game ───
  app.post("/position", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const body = parse(Position, req.body);
    const wallet = sessionWallet(req);
    const fix = { lat: body.lat, lng: body.lng, accuracy: body.accuracy, ts: now() };
    if (wallet) {
      recordPosition(wallet, fix, body.device_id);
      if (body.accuracy <= CATCH.maxAccuracyM * 2) await ensurePersonalDrop(wallet, fix);
    }
    return { ok: true, drops: nearbyDrops(wallet, fix), live: config.live };
  });

  app.post("/claim", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (req) => {
    const wallet = requireWallet(req);
    const b = parse(Claim, req.body);
    const row = await claim(wallet, {
      spawnId: b.spawn_id,
      fix: { lat: b.lat, lng: b.lng, accuracy: b.accuracy, ts: now() },
      log: b.gps_log,
      motion: b.motion,
      deviceId: b.device_id,
      clientTime: Date.parse(b.client_time),
      ip: ip(req),
    });
    return { ok: true, catch_id: row.id, state: row.state, live: config.live };
  });

  app.get<{ Params: { id: string } }>("/catch/:id", async (req) => {
    const c = getCatch(req.params.id);
    if (!c) throw new HttpError(404, "No such catch.");
    return {
      ok: true,
      id: c.id,
      state: c.state,
      sym: c.sym,
      tokens: fromRaw(c.amount),
      usd: c.usd,
      tx: c.tx_hash ? txUrl(c.tx_hash) : null,
      walkM: c.walk_m,
      steps: Math.round(c.walk_m / 0.762),
      kcal: Math.round(c.walk_m * 0.05),
      error: c.state === "failed" ? "That one did not go through. The drop stays on the map and nothing is spent." : null,
    };
  });

  // ─── public ───
  app.get("/claims", async () => claimsFeed());
  app.get("/stats", async () => statsView());
  app.get("/vault", async () => vaultView());
  app.get("/board", async () => board());
  app.get("/proof", async () => proofView());
  app.get("/legendary", async () => legendaryOverview());

  app.post("/legendary/claim", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req) => {
    const wallet = requireWallet(req);
    const b = parse(LegendaryClaim, req.body);
    const out = await claimLegendary(wallet, {
      id: b.id,
      code: b.code,
      fix: { lat: b.lat, lng: b.lng, accuracy: b.accuracy, ts: now() },
      log: b.gps_log,
      motion: b.motion,
      clientTime: Date.parse(b.client_time),
      deviceId: b.device_id,
      ip: ip(req),
    });
    return { ok: true, catch_id: out.catchId };
  });
}
