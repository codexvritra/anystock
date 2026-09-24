import { defineChain } from "viem";

const id = Number(import.meta.env.VITE_CHAIN_ID ?? 4663);
const rpc = import.meta.env.VITE_RPC_URL ?? (id === 46630 ? "https://rpc.testnet.chain.robinhood.com" : "https://rpc.mainnet.chain.robinhood.com");
const explorer =
  import.meta.env.VITE_EXPLORER_URL ?? (id === 46630 ? "https://explorer.testnet.chain.robinhood.com" : "https://robinhoodchain.blockscout.com");

/** Robinhood Chain: Arbitrum Orbit L2 on Ethereum, ETH for gas. */
export const robinhoodChain = defineChain({
  id,
  name: id === 46630 ? "Robinhood Chain Testnet" : "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
  blockExplorers: { default: { name: "Blockscout", url: explorer } },
  testnet: id === 46630,
});

export const accountUrl = (a: string) => `${explorer}/address/${a}`;
export const TEST_MODE = import.meta.env.VITE_TEST_MODE === "1";
export const PRIVY_APP_ID: string | undefined = import.meta.env.VITE_PRIVY_APP_ID || undefined;
