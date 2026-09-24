import { keccak256, toHex, type Address, type Hash } from "viem";
import { config } from "./config.ts";
import { db, now } from "./db.ts";
import { dropVaultAbi, publicClient, walletClient, keeperAccount, robinhoodChain } from "./chain.ts";
import { releaseFailedCatch, type CatchRow } from "./game.ts";

/**
 * The payout worker. One loop, one keeper key, so nonces never race.
 *
 * Crash safety: the tx hash is written before we wait on it. On restart, rows that are
 * `sending` with a hash are reconciled from their receipt, and rows without one are
 * checked against `paid(dropId)` on the vault before being sent again, so a catch can
 * never be paid twice even if the process dies mid-flight.
 */

const BATCH = 20;
const TICK_MS = 1_500;
const DEMO_DELAY_MS = 1_200;

export const dropIdOf = (catchId: string) => keccak256(toHex(catchId));

function markLanded(ids: string[], hash: Hash | null): void {
  const stmt = db.prepare("UPDATE catches SET state = 'landed', tx_hash = COALESCE(?, tx_hash), landed_at = ? WHERE id = ?");
  for (const id of ids) stmt.run(hash, now(), id);
}

function markFailed(c: CatchRow, err: unknown): void {
  const msg = (err as Error)?.message?.split("\n")[0]?.slice(0, 300) ?? String(err);
  console.error(`[payout] ${c.id} failed: ${msg}`);
  db.prepare("UPDATE catches SET state = 'failed', error = ? WHERE id = ?").run(msg, c.id);
  releaseFailedCatch(c);
}

async function send(rows: CatchRow[]): Promise<void> {
  if (!walletClient || !keeperAccount || !config.DROP_VAULT) throw new Error("vault not configured");
  const vault = config.DROP_VAULT;

  // idempotency: skip anything the vault already paid
  const paid = await Promise.all(
    rows.map((r) => publicClient.readContract({ address: vault, abi: dropVaultAbi, functionName: "paid", args: [dropIdOf(r.id)] })),
  );
  const already = rows.filter((_, i) => paid[i]);
  if (already.length) markLanded(already.map((r) => r.id), null);
  const todo = rows.filter((_, i) => !paid[i]);
  if (!todo.length) return;

  const common = { address: vault, abi: dropVaultAbi, account: keeperAccount, chain: robinhoodChain } as const;
  const hash =
    todo.length === 1
      ? await walletClient.writeContract({
          ...common,
          functionName: "pay",
          args: [dropIdOf(todo[0].id), todo[0].token as Address, todo[0].wallet as Address, BigInt(todo[0].amount)],
        })
      : await walletClient.writeContract({
          ...common,
          functionName: "payBatch",
          args: [
            todo.map((r) => dropIdOf(r.id)),
            todo.map((r) => r.token as Address),
            todo.map((r) => r.wallet as Address),
            todo.map((r) => BigInt(r.amount)),
          ],
        });

  const setHash = db.prepare("UPDATE catches SET tx_hash = ? WHERE id = ?");
  for (const r of todo) setHash.run(hash, r.id);

  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error(`reverted in ${hash}`);
  markLanded(todo.map((r) => r.id), hash);
}

async function tick(): Promise<void> {
  const rows = db
    .prepare("SELECT * FROM catches WHERE state = 'sending' AND kind = 'street' AND tx_hash IS NULL ORDER BY created_at LIMIT ?")
    .all(BATCH) as unknown as CatchRow[];
  if (!rows.length) return;

  if (!config.live) {
    // demo: nothing moves on chain, but the flow (and the waiting) is the same
    await new Promise((r) => setTimeout(r, DEMO_DELAY_MS));
    const stmt = db.prepare("UPDATE catches SET state = 'demo', landed_at = ? WHERE id = ?");
    for (const r of rows) stmt.run(now(), r.id);
    return;
  }

  try {
    await send(rows);
  } catch (err) {
    if (rows.length === 1) return markFailed(rows[0], err);
    // one bad row reverts the whole batch; retry singly to isolate it
    for (const r of rows) {
      try {
        await send([r]);
      } catch (e) {
        markFailed(r, e);
      }
    }
  }
}

/** Reconcile rows that were sent before a restart. */
async function reconcile(): Promise<void> {
  if (!config.live) return;
  const rows = db.prepare("SELECT * FROM catches WHERE state = 'sending' AND tx_hash IS NOT NULL").all() as unknown as CatchRow[];
  for (const r of rows) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: r.tx_hash as Hash });
      if (receipt.status === "success") markLanded([r.id], r.tx_hash as Hash);
      else markFailed(r, new Error(`reverted in ${r.tx_hash}`));
    } catch {
      // no receipt yet: dropped from the mempool or still pending. Clear the hash so the
      // loop re-sends; paid(dropId) stops a double payment if the first one lands.
      db.prepare("UPDATE catches SET tx_hash = NULL WHERE id = ?").run(r.id);
    }
  }
}

let running = false;
export function startPayoutWorker(): () => void {
  let stopped = false;
  void reconcile().catch((e) => console.error("[payout] reconcile", e));
  const loop = async () => {
    if (stopped) return;
    if (!running) {
      running = true;
      try {
        await tick();
      } catch (e) {
        console.error("[payout] tick", e);
      } finally {
        running = false;
      }
    }
    setTimeout(loop, TICK_MS);
  };
  void loop();
  return () => {
    stopped = true;
  };
}
