import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGpsLog, checkLimits, checkMotion, checkReach, checkTrail, evaluate, type Counters, type Evidence, type Fix } from "../src/anticheat.ts";
import { destination, distanceM, cellKey, cellCenter } from "../../shared/geo.ts";
import { CATCH, reachFor } from "../../shared/rules.ts";

const T = 1_760_000_000_000;
const drop = { lat: 41.6934, lng: 44.8015 };

/** A believable walk that ends `endM` metres south of the drop. */
function walk(endM: number, n = 6, stepS = 5): Fix[] {
  return Array.from({ length: n }, (_, i) => {
    const p = destination(drop, endM + (n - 1 - i) * 4, 180); // ~0.8 m/s towards it
    return { ...p, lat: p.lat + (i % 2) * 1e-6, accuracy: 8 + (i % 3), ts: T - (n - 1 - i) * stepS * 1000 };
  });
}

const motion = [
  { x: 0.1, y: 9.7, z: 0.3 },
  { x: 0.4, y: 9.9, z: -0.2 },
  { x: -0.2, y: 9.6, z: 0.5 },
];

function evidence(over: Partial<Evidence> = {}): Evidence {
  const log = walk(10);
  return { fix: log[log.length - 1], log, motion, clientTime: T, serverTime: T, drop, trail: [], ...over };
}

const clean: Counters = {
  catchesToday: 0,
  lastCatchAt: null,
  deviceCatchesToday: 0,
  deviceWalletsToday: 0,
  networkCatchesToday: 0,
  networkWalletsToday: 0,
  squareCatchesToday: 0,
  alreadyCaughtThisDrop: false,
  dropQuietUntil: 0,
};

test("geo: destination and distance agree", () => {
  const p = destination(drop, 437, 73);
  assert.ok(Math.abs(distanceM(drop, p) - 437) < 0.5);
});

test("geo: a cell contains its own centre", () => {
  const k = cellKey(drop, 100);
  assert.equal(cellKey(cellCenter(k), 100), k);
});

test("reach grows with GPS error and is capped", () => {
  assert.equal(reachFor(0), CATCH.radiusM);
  assert.equal(reachFor(20), CATCH.radiusM + 10);
  assert.equal(reachFor(500), CATCH.radiusCapM);
  assert.equal(reachFor(0, 25), 25);
});

test("an honest walk is accepted", () => {
  const v = evaluate(evidence(), clean, { newOnDevice: true, newOnNetwork: true });
  assert.equal(v.ok, true, JSON.stringify(v));
});

test("too far says how far to walk", () => {
  const log = walk(150);
  const v = checkReach(evidence({ fix: log[log.length - 1], log }));
  assert.equal(v.ok, false);
  assert.match((v as { why: string }).why, /^Walk \d+ m closer$/);
});

test("rough GPS is refused", () => {
  const e = evidence();
  const v = checkGpsLog({ ...e, fix: { ...e.fix, accuracy: 120 } });
  assert.equal(v?.ok, false);
});

test("a short log asks the player to wait", () => {
  const log = walk(10, 3);
  const v = checkGpsLog(evidence({ log, fix: log[log.length - 1] }));
  assert.equal((v as { code: string }).code, "log_short");
});

test("a teleport inside the log is caught", () => {
  const log = walk(10);
  log[1] = { ...destination(drop, 3_000, 90), accuracy: 8, ts: log[1].ts };
  const v = checkGpsLog(evidence({ log }));
  assert.equal((v as { code: string }).code, "speed");
});

test("a synthetic log (identical points, identical accuracy) is caught", () => {
  const log = Array.from({ length: 6 }, (_, i) => ({ ...drop, accuracy: 5, ts: T - (5 - i) * 5000 }));
  const v = checkGpsLog(evidence({ log, fix: log[5] }));
  assert.equal((v as { code: string }).code, "too_exact");
});

test("a perfectly still phone is refused", () => {
  const still = [{ x: 0, y: 9.81, z: 0 }, { x: 0, y: 9.81, z: 0 }, { x: 0, y: 9.81, z: 0 }];
  assert.equal(checkMotion(still)?.ok, false);
  assert.equal((checkMotion([]) as { code: string }).code, "motion");
});

test("the server trail must be walkable too", () => {
  const far = { ...destination(drop, 5_000, 0), accuracy: 10, ts: T - 60_000 };
  const v = checkTrail(evidence({ trail: [far] }));
  assert.equal((v as { code: string }).code, "trail_speed");
});

test("a clock hours off is refused", () => {
  const v = checkGpsLog(evidence({ clientTime: T + 5 * 3_600_000 }));
  assert.equal((v as { code: string }).code, "clock");
});

test("limits: cooldown, daily cap, once per drop, quiet window", () => {
  assert.equal((checkLimits({ ...clean, lastCatchAt: T - 60_000 }, T, false, false) as { code: string }).code, "cooldown");
  assert.equal((checkLimits({ ...clean, catchesToday: CATCH.perWalletPerDay }, T, false, false) as { code: string }).code, "daily");
  assert.equal((checkLimits({ ...clean, alreadyCaughtThisDrop: true }, T, false, false) as { code: string }).code, "once");
  assert.equal((checkLimits({ ...clean, dropQuietUntil: T + 60_000 }, T, false, false) as { code: string }).code, "quiet");
  assert.equal(checkLimits({ ...clean, lastCatchAt: T - CATCH.cooldownMin * 60_000 - 1 }, T, false, false), null);
});

test("limits: device and network wallet farms", () => {
  const farm = { ...clean, deviceWalletsToday: CATCH.walletsPerDevicePerDay };
  assert.equal((checkLimits(farm, T, true, false) as { code: string }).code, "device_wallets");
  assert.equal(checkLimits(farm, T, false, false), null, "a wallet already on the device is fine");
});
