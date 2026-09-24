import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export type Route = "home" | "map" | "how" | "proof" | "legendary" | "soon" | "stats";
const ROUTES: Route[] = ["home", "map", "how", "proof", "legendary", "soon", "stats"];

function readRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  return (ROUTES as string[]).includes(h) ? (h as Route) : "home";
}

/** Hash routes keep deep links working on any static host with zero server config. */
export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener("hashchange", l);
      return () => window.removeEventListener("hashchange", l);
    },
    readRoute,
    () => "home",
  );
}

export const go = (r: Route) => {
  window.location.hash = r === "home" ? "" : `/${r}`;
};
export const href = (r: Route) => (r === "home" ? "#" : `#/${r}`);

/** Fetch now and every `ms`, paused while the tab is hidden. */
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = []): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    const run = async (first = false) => {
      // background tabs skip the ticks, but the first load always fetches
      if (document.hidden && !first) return;
      try {
        const d = await fnRef.current();
        if (alive) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    void run(true);
    const t = setInterval(() => void run(), ms);
    const vis = () => !document.hidden && void run();
    document.addEventListener("visibilitychange", vis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, nonce, ...deps]);

  return { data, error, reload: () => setNonce((n) => n + 1) };
}

/** Re-render every `ms` so relative times stay honest. */
export function useNow(ms = 1000): number {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return t;
}
