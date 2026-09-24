import { formatEther, parseEther } from "viem";
import { config } from "./config.ts";
import { dropVaultAbi, feeSplitterAbi, keeperAccount, publicClient, robinhoodChain, walletClient } from "./chain.ts";
import { holdings } from "./market.ts";

/**
 * The money side, run a few times an hour:
 *  1. push creator fees through FeeSplitter (50 map / 40 burn / 10 team)
 *  2. turn the vault's ETH into whichever stock has the thinnest reserve
 * Both are no-ops outside live mode. Stock feeds only tick in market hours; a stale
 * feed makes buyStock revert on-chain, which we simulate first and skip quietly.
 */

const EVERY_MS = 10 * 60_000;
const MIN_SPLIT = parseEther("0.005");
const MIN_BUY = parseEther("0.01");
const MAX_BUY = parseEther("0.5");

async function splitFees(): Promise<void> {
  if (!config.FEE_SPLITTER || !walletClient || !keeperAccount) return;
  const pending = await publicClient.readContract({ address: config.FEE_SPLITTER, abi: feeSplitterAbi, functionName: "pending" });
  if (pending < MIN_SPLIT) return;
  const hash = await walletClient.writeContract({
    address: config.FEE_SPLITTER,
    abi: feeSplitterAbi,
    functionName: "split",
    account: keeperAccount,
    chain: robinhoodChain,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[keeper] split ${formatEther(pending)} ETH in ${hash}`);
}

async function buyStock(): Promise<void> {
  if (!config.DROP_VAULT || !walletClient || !keeperAccount) return;
  const eth = await publicClient.getBalance({ address: config.DROP_VAULT });
  if (eth < MIN_BUY) return;
  const hs = (await holdings(0)).filter((h) => h.address);
  if (!hs.length) return;
  const thinnest = hs.sort((a, b) => a.availableUsd - b.availableUsd)[0];
  const ethIn = eth > MAX_BUY ? MAX_BUY : eth;
  try {
    const { request } = await publicClient.simulateContract({
      address: config.DROP_VAULT,
      abi: dropVaultAbi,
      functionName: "buyStock",
      args: [thinnest.address as `0x${string}`, ethIn],
      account: keeperAccount,
      chain: robinhoodChain,
    });
    const hash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[keeper] bought ${thinnest.sym} with ${formatEther(ethIn)} ETH in ${hash}`);
  } catch (e) {
    console.warn(`[keeper] buy ${thinnest.sym} skipped: ${(e as Error).message.split("\n")[0]}`);
  }
}

export function startKeeper(): () => void {
  if (!config.live) return () => {};
  const run = async () => {
    await splitFees().catch((e) => console.warn("[keeper] split", (e as Error).message));
    await buyStock();
  };
  void run();
  const t = setInterval(run, EVERY_MS);
  return () => clearInterval(t);
}
