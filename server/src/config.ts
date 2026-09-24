import "dotenv/config";
import { z } from "zod";
import { isAddress, type Address, type Hex } from "viem";
import { STOCKS, type StockSym } from "../../shared/rules.ts";

const address = z
  .string()
  .refine((v) => isAddress(v), "not an address")
  .transform((v) => v as Address);
const optAddress = z.preprocess((v) => (v === "" ? undefined : v), address.optional());

const Env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(8787),
  HOST: z.string().default("0.0.0.0"),
  /** exact origin the web app is served from; SIWE messages must name this domain */
  PUBLIC_ORIGIN: z.string().url().default("http://localhost:5173"),
  SESSION_SECRET: z.string().min(32).default("dev-only-secret-change-me-dev-only-secret"),
  DB_PATH: z.string().default("./data/streetstock.db"),
  TEST_MODE: z.enum(["0", "1"]).default("0"),
  TRUST_PROXY: z.enum(["0", "1"]).default("0"),

  CHAIN_ID: z.coerce.number().int().default(4663),
  RPC_URL: z.string().url().default("https://rpc.mainnet.chain.robinhood.com"),
  EXPLORER_URL: z.string().url().default("https://robinhoodchain.blockscout.com"),

  DROP_VAULT: optAddress,
  FEE_SPLITTER: optAddress,
  WALK_TOKEN: optAddress,
  KEEPER_PRIVATE_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .transform((v) => v as Hex)
      .optional(),
  ),
  ETH_USD_FEED: optAddress,

  /** demo vault size per stock, USD, used only while the vault is not live */
  DEMO_VAULT_USD: z.coerce.number().default(400),
  LEGENDARY_PEPPER: z.string().default("dev-pepper"),
  ADMIN_TOKEN: z.string().optional(),
});

const env = Env.parse(process.env);

if (env.NODE_ENV === "production" && env.SESSION_SECRET.startsWith("dev-only")) {
  throw new Error("SESSION_SECRET must be set in production");
}

export interface StockConfig {
  sym: StockSym;
  name: string;
  phase: string;
  address?: Address;
  feed?: Address;
}

/** Stock token + Chainlink feed per ticker, from STOCK_<SYM>_ADDRESS / STOCK_<SYM>_FEED. */
export const stocks: StockConfig[] = STOCKS.map((s) => ({
  ...s,
  address: optAddress.parse(process.env[`STOCK_${s.sym}_ADDRESS`]),
  feed: optAddress.parse(process.env[`STOCK_${s.sym}_FEED`]),
}));

const liveStocks = stocks.filter((s) => s.address && s.feed);

export const config = {
  ...env,
  isProd: env.NODE_ENV === "production",
  testMode: env.TEST_MODE === "1",
  /** real transfers on Robinhood Chain happen only when all of this is present */
  live: Boolean(env.DROP_VAULT && env.KEEPER_PRIVATE_KEY && liveStocks.length > 0),
  siweDomain: new URL(env.PUBLIC_ORIGIN).host,
};

export type Config = typeof config;
