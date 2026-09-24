/**
 * The rules of the game. Imported by both the server (which enforces them) and the
 * web app (which explains them), so the two can never drift apart.
 *
 * Distances are metres, durations minutes unless the name says otherwise.
 */

export const TEST_MODE =
  (typeof process !== "undefined" && process.env?.TEST_MODE === "1") ||
  // vite injects import.meta.env; guarded so node never evaluates it
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_TEST_MODE === "1");

export const CATCH = {
  /** base catch radius, grows with half the GPS error the phone reports */
  radiusM: 60,
  radiusCapM: 80,
  /** a fix worse than this is refused */
  maxAccuracyM: 65,
  /** the GPS log a catch must carry: readings over a time span */
  logReadings: 4,
  logSeconds: 20,
  /** readings in the log must agree with the claimed fix within this */
  logAgreeM: 60,
  perWalletPerDay: 6,
  cooldownMin: TEST_MODE ? 0.2 : 45,
  quietMin: 10,
  perDevicePerDay: 60,
  walletsPerDevicePerDay: 3,
  perNetworkPerDay: 40,
  walletsPerNetworkPerDay: 60,
  /** a grid cell may only pay so many catches a day (bot farms stand still) */
  perSquarePerDay: 24,
  squareM: 11,
  /** accuracy readings identical to this many decimals, this many times, smell like a spoofer */
  tooExactM: 1.05,
  tooExactTries: 5,
  minPlausibleAccuracyM: 3,
  /** faster than this between two reports is a car, a train or a teleport */
  walkSpeedMps: 9,
  clockSkewHours: 3,
} as const;

export const STREET = {
  /** each player gets one personal drop at a time */
  perPlayer: 1,
  ringMinM: TEST_MODE ? 10 : 300,
  ringM: TEST_MODE ? 30 : 500,
  /** heat-map resolution: we never store where one person was, only 100 m cells */
  cellM: 100,
  lifeMin: 20,
  /** the first drop for a new account lands close, so the first catch is easy */
  firstDropM: 40,
} as const;

export type Rarity = "common" | "rare" | "epic";

export const DROP = {
  floorUsd: TEST_MODE ? 0.1 : 0.5,
  normalUsd: (TEST_MODE ? [0.1, 0.125] : [0.5, 1.25]) as [number, number],
  rareMult: 2,
  epicMult: 4,
  mix: { common: 6, rare: 1, epic: 1 } as Record<Rarity, number>,
} as const;

/** creator fees from the WALK launch, split on-chain by FeeSplitter; these mirror its constants */
export const SPLIT = { map: 50, burn: 40, team: 10 } as const;

export const LEGENDARY = {
  windowMin: 60,
  radiusM: 25,
  announceHoursAhead: 24,
} as const;

export const TOKEN = { symbol: "$WALK", name: "Streetstock" } as const;

/** Stocks that can appear on the map. Addresses come from env (see server/.env.example):
 *  they are read from Robinhood Chain's on-chain asset registry and verified with
 *  uiMultiplier() before listing, never typed from memory. */
export const STOCKS = [
  { sym: "NVDA", name: "Nvidia", phase: "launch" },
  { sym: "TSLA", name: "Tesla", phase: "launch" },
  { sym: "AAPL", name: "Apple", phase: "launch" },
  { sym: "AMZN", name: "Amazon", phase: "week3" },
  { sym: "META", name: "Meta", phase: "week3" },
] as const;

export type StockSym = (typeof STOCKS)[number]["sym"];

/** How close is close enough, given what the phone says about its own accuracy. */
export function reachFor(accuracyM: number, baseM: number = CATCH.radiusM): number {
  return Math.min(CATCH.radiusM + accuracyM / 2, CATCH.radiusCapM) * (baseM / CATCH.radiusM);
}

export function rarityMult(r: Rarity): number {
  return r === "epic" ? DROP.epicMult : r === "rare" ? DROP.rareMult : 1;
}

export const RULES_TABLE: [string, string][] = [
  ["Catch radius", `${CATCH.radiusM} m, plus half the GPS error your phone reports, capped at ${CATCH.radiusCapM} m`],
  ["GPS accuracy", `${CATCH.maxAccuracyM} m or better, from at least ${CATCH.logReadings} readings over ${CATCH.logSeconds} seconds`],
  ["How often", `One catch every ${CATCH.cooldownMin} minutes, up to ${CATCH.perWalletPerDay} a day`],
  ["Per drop", `One catch per wallet. A drop goes quiet for ${CATCH.quietMin} minutes after someone takes it`],
  [
    "What a drop pays",
    `$${DROP.normalUsd[0].toFixed(2)} to $${DROP.normalUsd[1].toFixed(2)}. Rare ${DROP.rareMult}×, epic ${DROP.epicMult}×. Never below $${DROP.floorUsd.toFixed(2)}`,
  ],
  ["Cost to you", "Nothing. We pay the gas on Robinhood Chain"],
];
