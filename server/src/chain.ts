import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.ts";

export const robinhoodChain = defineChain({
  id: config.CHAIN_ID,
  name: config.CHAIN_ID === 46630 ? "Robinhood Chain Testnet" : "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [config.RPC_URL] } },
  blockExplorers: { default: { name: "Blockscout", url: config.EXPLORER_URL } },
});

export const publicClient: PublicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(config.RPC_URL, { retryCount: 3, timeout: 15_000 }),
});

export const keeperAccount = config.KEEPER_PRIVATE_KEY ? privateKeyToAccount(config.KEEPER_PRIVATE_KEY) : undefined;

export const walletClient: WalletClient | undefined = keeperAccount
  ? createWalletClient({ account: keeperAccount, chain: robinhoodChain, transport: http(config.RPC_URL) })
  : undefined;

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function uiMultiplier() view returns (uint256)",
]);

export const aggregatorAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
]);

export const dropVaultAbi = parseAbi([
  "function pay(bytes32 dropId, address token, address to, uint256 amount)",
  "function payBatch(bytes32[] dropIds, address[] tokens, address[] tos, uint256[] amounts)",
  "function payLegendary(bytes32 dropId, address token, address to, uint256 amount)",
  "function buyStock(address token, uint256 ethIn) returns (uint256)",
  "function quoteMinOut(address token, uint256 ethIn) view returns (uint256)",
  "function paid(bytes32) view returns (bool)",
  "function paused() view returns (bool)",
  "function remainingToday(address token) view returns (uint256)",
  "event Caught(bytes32 indexed dropId, address indexed token, address indexed to, uint256 amount)",
]);

export const feeSplitterAbi = parseAbi([
  "function pending() view returns (uint256)",
  "function split()",
  "function burnReserve() view returns (uint256)",
  "function totalToMap() view returns (uint256)",
  "function totalToTeam() view returns (uint256)",
  "function totalBurnEth() view returns (uint256)",
  "function totalWalkBurned() view returns (uint256)",
]);

export const txUrl = (hash: string) => `${config.EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (a: Address | string) => `${config.EXPLORER_URL}/address/${a}`;
