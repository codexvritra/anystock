import { CATCH, reachFor, TEST_MODE } from "../../shared/rules.ts";
import { distanceM, type LatLng } from "../../shared/geo.ts";

/**
 * Walk verification. Everything here is a pure function of the evidence so it can be
 * tested exhaustively; the caller fetches the counters from the database.
 *
 * The idea: a spoofer can type any coordinate, but it is hard to fake the *shape* of a
 * real GPS log. Real phones jitter, report varying accuracy, move at walking speed, and
 * the accelerometer twitches while someone holds them. We check all of that, then the
 * rate limits make whatever gets through not worth the effort.
 */

export interface Fix extends LatLng {
  accuracy: number;
  ts: number;
}

export interface Motion {
  x: number;
  y: number;
  z: number;
}

export interface Evidence {
  fix: Fix;
  log: Fix[];
  motion: Motion[];
  clientTime: number;
  serverTime: number;
  drop: LatLng & { baseRadiusM?: number };
  /** the wallet's server-side trail, oldest first (from POST /position) */
  trail: Fix[];
}

export interface Counters {
  catchesToday: number;
  lastCatchAt: number | null;
  deviceCatchesToday: number;
  deviceWalletsToday: number;
  networkCatchesToday: number;
  networkWalletsToday: number;
  squareCatchesToday: number;
  alreadyCaughtThisDrop: boolean;
  dropQuietUntil: number;
}

export type Verdict = { ok: true; distanceM: number; reachM: number } | { ok: false; code: string; why: string };

const fail = (code: string, why: string): Verdict => ({ ok: false, code, why });

export function checkLimits(c: Counters, t: number, walletIsNewOnDevice: boolean, walletIsNewOnNetwork: boolean): Verdict | null {
  if (c.alreadyCaughtThisDrop) return fail("once", "You already caught this one. One catch per wallet per drop.");
  if (c.dropQuietUntil > t)
    return fail("quiet", `Someone just took this one. It comes back in ${Math.ceil((c.dropQuietUntil - t) / 60_000)} min.`);
  if (c.catchesToday >= CATCH.perWalletPerDay)
    return fail("daily", `That is ${CATCH.perWalletPerDay} today. The street resets at midnight UTC.`);
  if (c.lastCatchAt && t - c.lastCatchAt < CATCH.cooldownMin * 60_000) {
    const mins = Math.ceil((CATCH.cooldownMin * 60_000 - (t - c.lastCatchAt)) / 60_000);
    return fail("cooldown", `Next catch in ${mins} min. Keep walking.`);
  }
  if (c.deviceCatchesToday >= CATCH.perDevicePerDay) return fail("device", "This phone has caught enough for today.");
  if (walletIsNewOnDevice && c.deviceWalletsToday >= CATCH.walletsPerDevicePerDay)
    return fail("device_wallets", "Too many wallets on this phone today.");
  if (c.networkCatchesToday >= CATCH.perNetworkPerDay) return fail("network", "This network has caught enough for today.");
  if (walletIsNewOnNetwork && c.networkWalletsToday >= CATCH.walletsPerNetworkPerDay)
    return fail("network_wallets", "Too many wallets on this network today.");
  if (c.squareCatchesToday >= CATCH.perSquarePerDay) return fail("square", "This exact spot has paid out enough today.");
  return null;
}

export function checkGpsLog(e: Evidence): Verdict | null {
  const { fix, log, serverTime } = e;
  const skew = CATCH.clockSkewHours * 3_600_000;

  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng) || Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180)
    return fail("fix", "Your position is not available right now.");
  if (Math.abs(e.clientTime - serverTime) > skew) return fail("clock", "Your phone's clock is off. Fix the time and try again.");
  if (fix.accuracy > CATCH.maxAccuracyM)
    return fail("accuracy", `GPS is too rough right now (±${Math.round(fix.accuracy)} m). Step outside or wait a moment.`);
  if (!TEST_MODE && fix.accuracy < CATCH.minPlausibleAccuracyM) return fail("too_exact", "That location is too perfect to be a phone.");

  if (log.length < CATCH.logReadings) return fail("log_short", "Keep the map open a few more seconds.");
  const sorted = [...log].sort((a, b) => a.ts - b.ts);
  const span = sorted[sorted.length - 1].ts - sorted[0].ts;
  if (span < CATCH.logSeconds * 1000) return fail("log_short", "Keep the map open a few more seconds.");
  if (sorted.some((p) => p.ts > e.clientTime + 5_000)) return fail("log_future", "The GPS log is from the future.");

  // the claimed fix must agree with what the log saw last
  const last = sorted[sorted.length - 1];
  if (distanceM(last, fix) > CATCH.logAgreeM + fix.accuracy) return fail("log_disagree", "Your position jumped. Hold still a moment.");

  // walking pace between consecutive readings, with the phone's own error as slack
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const dt = Math.max(1, (b.ts - a.ts) / 1000);
    const d = Math.max(0, distanceM(a, b) - (a.accuracy + b.accuracy));
    if (d / dt > CATCH.walkSpeedMps) return fail("speed", "That was faster than walking. Catches are for feet only.");
  }

  if (!TEST_MODE) {
    // spoofers repeat themselves: identical accuracy over and over, or zero jitter
    const accCounts = new Map<number, number>();
    for (const p of sorted) accCounts.set(p.accuracy, (accCounts.get(p.accuracy) ?? 0) + 1);
    const maxSameAcc = Math.max(...accCounts.values());
    const allSamePoint = sorted.every((p) => p.lat === sorted[0].lat && p.lng === sorted[0].lng);
    if (maxSameAcc >= CATCH.tooExactTries && sorted.length >= CATCH.tooExactTries && maxSameAcc === sorted.length && allSamePoint)
      return fail("too_exact", "That GPS log looks synthetic.");
    if (sorted.length >= CATCH.tooExactTries && sorted.every((p) => p.accuracy <= CATCH.tooExactM))
      return fail("too_exact", "That GPS log looks synthetic.");
  }
  return null;
}

export function checkMotion(motion: Motion[]): Verdict | null {
  if (TEST_MODE) return null;
  if (motion.length < 2) return fail("motion", "We cannot read movement from this device yet.");
  const mags = motion.map((m) => Math.hypot(m.x, m.y, m.z));
  const mean = mags.reduce((a, b) => a + b, 0) / mags.length;
  const variance = mags.reduce((a, b) => a + (b - mean) ** 2, 0) / mags.length;
  // a phone held by a person is never perfectly still; an emulator often is
  if (variance < 1e-6) return fail("motion", "This phone is not moving at all. Pick it up and walk.");
  return null;
}

/** The server's own trail must also be a walk: no teleports between reports. */
export function checkTrail(e: Evidence): Verdict | null {
  const pts = [...e.trail, e.fix].sort((a, b) => a.ts - b.ts);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dt = Math.max(1, (b.ts - a.ts) / 1000);
    const d = Math.max(0, distanceM(a, b) - (a.accuracy + b.accuracy));
    if (d / dt > CATCH.walkSpeedMps) return fail("trail_speed", "Your trail jumps. Keep the map open while you walk: the walk is what we check.");
  }
  return null;
}

export function checkReach(e: Evidence): Verdict {
  const d = distanceM(e.fix, e.drop);
  const reach = reachFor(e.fix.accuracy, e.drop.baseRadiusM);
  if (d > reach) return fail("far", `Walk ${Math.max(1, Math.round(d - reach))} m closer`);
  return { ok: true, distanceM: d, reachM: reach };
}

export function evaluate(e: Evidence, c: Counters, flags: { newOnDevice: boolean; newOnNetwork: boolean }): Verdict {
  return (
    checkLimits(c, e.serverTime, flags.newOnDevice, flags.newOnNetwork) ??
    checkGpsLog(e) ??
    checkMotion(e.motion) ??
    checkTrail(e) ??
    checkReach(e)
  );
}
