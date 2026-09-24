import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getAddress, recoverMessageAddress, type Address, type Hex } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { config } from "./config.ts";
import { publicClient } from "./chain.ts";
import { db, now } from "./db.ts";

/**
 * Sign-In With Ethereum (EIP-4361). Works the same for a browser wallet and for an
 * embedded wallet made at Google/X sign-in: both just sign the message. The session is
 * a stateless HMAC token in an httpOnly cookie.
 */

const COOKIE = "ss_session";
const SESSION_TTL_MS = 30 * 86_400_000;
const NONCE_TTL_MS = 10 * 60_000;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
  ) {
    super(message);
  }
}

export function issueNonce(): string {
  const nonce = randomBytes(16).toString("hex");
  db.prepare("INSERT INTO nonces (nonce, created_at) VALUES (?, ?)").run(nonce, now());
  db.prepare("DELETE FROM nonces WHERE created_at < ?").run(now() - NONCE_TTL_MS);
  return nonce;
}

export async function verifySignIn(message: string, signature: Hex): Promise<Address> {
  const fields = parseSiweMessage(message);
  if (!fields.nonce || !fields.address) throw new HttpError(400, "Malformed sign-in message.");

  const nonceRow = db.prepare("SELECT created_at, used FROM nonces WHERE nonce = ?").get(fields.nonce) as
    | { created_at: number; used: number }
    | undefined;
  if (!nonceRow || nonceRow.used || now() - nonceRow.created_at > NONCE_TTL_MS) {
    throw new HttpError(401, "This sign-in link expired. Try again.");
  }
  const valid = validateSiweMessage({ message: fields, domain: config.siweDomain, nonce: fields.nonce });
  if (!valid || fields.chainId !== config.CHAIN_ID) throw new HttpError(401, "Sign-in message is for another site or chain.");

  let ok = false;
  try {
    ok = getAddress(await recoverMessageAddress({ message, signature })) === getAddress(fields.address);
  } catch {
    ok = false;
  }
  if (!ok) {
    // smart-contract wallets (ERC-1271 / ERC-6492) can't be recovered offline
    ok = await publicClient.verifyMessage({ address: fields.address, message, signature }).catch(() => false);
  }
  if (!ok) throw new HttpError(401, "Signature does not match the wallet.");

  db.prepare("UPDATE nonces SET used = 1 WHERE nonce = ?").run(fields.nonce);
  const wallet = getAddress(fields.address);
  db.prepare("INSERT OR IGNORE INTO users (wallet, created_at) VALUES (?, ?)").run(wallet, now());
  return wallet;
}

function sign(payload: string): string {
  return createHmac("sha256", config.SESSION_SECRET).update(payload).digest("base64url");
}

export function setSession(reply: FastifyReply, wallet: Address): void {
  const payload = Buffer.from(JSON.stringify({ w: wallet, e: now() + SESSION_TTL_MS })).toString("base64url");
  reply.setCookie(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(COOKIE, { path: "/" });
}

export function sessionWallet(req: FastifyRequest): Address | null {
  const raw = req.cookies[COOKIE];
  if (!raw) return null;
  const [payload, mac] = raw.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { w, e } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return e > now() ? (w as Address) : null;
  } catch {
    return null;
  }
}

export function requireWallet(req: FastifyRequest): Address {
  const w = sessionWallet(req);
  if (!w) throw new HttpError(401, "Your session expired. Sign in again.", "session");
  return w;
}
