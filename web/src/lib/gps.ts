import { useSyncExternalStore } from "react";
import { destination, distanceM } from "../../../shared/geo.ts";
import { CATCH } from "../../../shared/rules.ts";
import { TEST_MODE } from "./chain.ts";

/**
 * One location store for the whole app. It keeps the latest fix, a rolling GPS log
 * (what the server checks the shape of) and a few accelerometer samples.
 *
 * The position never leaves this device except to ask "what is near me" and to claim.
 */

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
  ts: number;
}

export type LocStatus = "off" | "asking" | "on" | "denied" | "error";

interface State {
  status: LocStatus;
  fix: Fix | null;
  log: Fix[];
  motion: { x: number; y: number; z: number }[];
  error: string | null;
  simulated: boolean;
}

const LOG_MAX = 40;
const LOG_WINDOW_MS = 90_000;
const MOTION_MAX = 48;
const WATCH: PositionOptions = { enableHighAccuracy: true, timeout: 25_000, maximumAge: 30_000 };
/** where a laptop starts in test mode when it has no GPS */
const TEST_START = { lat: 41.6934, lng: 44.8015 };

let state: State = { status: "off", fix: null, log: [], motion: [], error: null, simulated: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  emit();
};

function push(fix: Fix) {
  const log = [...state.log, fix].filter((p) => fix.ts - p.ts <= LOG_WINDOW_MS).slice(-LOG_MAX);
  set({ fix, log, status: "on", error: null });
}

let watchId: number | null = null;
let simTimer: number | null = null;

function onMotion(e: DeviceMotionEvent) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null || a.y == null || a.z == null) return;
  state = { ...state, motion: [...state.motion, { x: a.x, y: a.y, z: a.z }].slice(-MOTION_MAX) };
  // no emit: nothing renders from motion, it only rides along with a claim
}

async function startMotion(): Promise<void> {
  if (typeof DeviceMotionEvent === "undefined") return;
  const DM = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof DM.requestPermission === "function") {
    try {
      if ((await DM.requestPermission()) !== "granted") return;
    } catch {
      return;
    }
  }
  window.addEventListener("devicemotion", onMotion);
}

function message(err: GeolocationPositionError): { status: LocStatus; error: string } {
  if (!window.isSecureContext) return { status: "error", error: "Location needs a secure page. Open the site over https, or on localhost." };
  if (err.code === err.PERMISSION_DENIED) return { status: "denied", error: "Location is blocked for this site. Allow it for this site in your browser, then press again." };
  if (err.code === err.TIMEOUT) return { status: "error", error: "Finding you took too long. Outdoors it is quicker. Press again." };
  return { status: "error", error: "Your position is not available right now." };
}

/** Must be called from a tap: iOS only grants motion and location inside a user gesture. */
export async function startLocation(): Promise<void> {
  if (watchId !== null || state.simulated) return;
  void startMotion();
  if (!("geolocation" in navigator)) {
    if (TEST_MODE) return startSimulation(TEST_START);
    return set({ status: "error", error: "This browser cannot share a location." });
  }
  set({ status: "asking", error: null });
  watchId = navigator.geolocation.watchPosition(
    (p) => push({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, ts: Date.now() }),
    (err) => {
      if (TEST_MODE && !state.fix) {
        stopWatch();
        return startSimulation(TEST_START);
      }
      set(message(err));
    },
    WATCH,
  );
}

function stopWatch() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

export function stopLocation(): void {
  stopWatch();
  if (simTimer) clearInterval(simTimer);
  simTimer = null;
  window.removeEventListener("devicemotion", onMotion);
  set({ status: "off", simulated: false });
}

// ─── test mode: walk on a laptop ───

const jitter = () => (Math.random() - 0.5) * 2e-6;
const fakeMotion = () => ({ x: Math.random() - 0.5, y: 9.6 + Math.random() * 0.4, z: Math.random() - 0.5 });

function startSimulation(at: { lat: number; lng: number }) {
  stopWatch();
  set({ simulated: true });
  const tick = () => {
    const base = state.fix ?? { ...at, accuracy: 8, ts: Date.now() };
    state = { ...state, motion: [...state.motion, fakeMotion()].slice(-MOTION_MAX) };
    push({ lat: base.lat + jitter(), lng: base.lng + jitter(), accuracy: 6 + Math.random() * 6, ts: Date.now() });
  };
  tick();
  if (simTimer) clearInterval(simTimer);
  simTimer = window.setInterval(tick, 2_000);
}

let walking: number | null = null;
/** Test mode only: walk towards a point at a brisk 3 m/s, reporting like a phone would. */
export function simulateWalkTo(target: { lat: number; lng: number }): void {
  if (!TEST_MODE) return;
  if (!state.simulated) startSimulation(state.fix ?? TEST_START);
  if (walking) clearInterval(walking);
  walking = window.setInterval(() => {
    const from = state.fix!;
    const d = distanceM(from, target);
    if (d < 1.5) {
      clearInterval(walking!);
      walking = null;
      return;
    }
    const bearing = (Math.atan2(target.lng - from.lng, target.lat - from.lat) * 180) / Math.PI;
    const step = Math.min(3, d);
    const p = destination(from, step, (bearing + 360) % 360);
    state = { ...state, motion: [...state.motion, fakeMotion()].slice(-MOTION_MAX) };
    push({ lat: p.lat, lng: p.lng, accuracy: 6 + Math.random() * 5, ts: Date.now() });
  }, 1_000);
}

export function useLocation(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export function readLocation(): State {
  return state;
}

export function readyToClaim(s: State): { ready: boolean; why?: string } {
  if (!s.fix) return { ready: false, why: "Waiting for your location." };
  const span = s.log.length ? s.log[s.log.length - 1].ts - s.log[0].ts : 0;
  if (s.log.length < CATCH.logReadings || span < CATCH.logSeconds * 1000) return { ready: false, why: "Keep the map open a few more seconds." };
  if (!TEST_MODE && s.motion.length < 2) return { ready: false, why: "We cannot read movement from this device yet." };
  return { ready: true };
}

export function deviceId(): string {
  const key = "streetstock:device";
  try {
    const have = localStorage.getItem(key);
    if (have) return have;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
