import { useCallback, useEffect, useRef, useState } from "react";
import { Map as MLMap, Marker, setWorkerUrl, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { Feature, Polygon } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { Back, Locate } from "../components/Icons.tsx";
import { CatchSheet } from "../components/CatchSheet.tsx";
import { getJson, postJson, type Drop, type Vault } from "../lib/api.ts";
import { deviceId, simulateWalkTo, startLocation, useLocation, type Fix } from "../lib/gps.ts";
import { href, useNow, usePoll } from "../lib/hooks.ts";
import { useSession } from "../lib/session.tsx";
import { TEST_MODE } from "../lib/chain.ts";
import { count, usd, until } from "../lib/format.ts";
import { distanceM, formatDistance, walkMinutes } from "../../../shared/geo.ts";
import { reachFor, CATCH } from "../../../shared/rules.ts";

// maplibre finds its worker relative to its own file, which bundlers rewrite; point it at ours
setWorkerUrl(workerUrl);

const STYLE = "https://tiles.openfreemap.org/styles/fiord";
const REPORT_EVERY_MS = 30_000;
const REPORT_WHEN_MOVED_M = 25;

/** A polygon approximating a circle, for the reach ring. */
function circle(c: { lat: number; lng: number }, r: number): Feature<Polygon> {
  const pts: [number, number][] = [];
  const dLat = r / 111_320;
  const dLng = r / (111_320 * Math.cos((c.lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push([c.lng + dLng * Math.cos(a), c.lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } };
}

function pinEl(d: Drop, onClick: () => void): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `drop-pin ${d.rarity}`;
  el.setAttribute("aria-label", `${d.name} drop, ${usd(d.usd)}`);
  el.innerHTML = `<div class="body"><span>${d.sym}</span></div>`;
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

export function MapView() {
  const loc = useLocation();
  const { wallet, me, openSheet } = useSession();
  const now = useNow(1000);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const meMarker = useRef<Marker | null>(null);
  const markers = useRef(new Map<string, { m: Marker; el: HTMLElement }>());
  const lastReport = useRef<{ at: number; fix: Fix } | null>(null);
  const centred = useRef(false);

  const [drops, setDrops] = useState<Drop[]>([]);
  const [liveFromPos, setLive] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Drop | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const { data: vault } = usePoll(() => getJson<Vault>("/vault"), 60_000);

  // ─── map ───
  useEffect(() => {
    if (!box.current) return;
    const m = new MLMap({
      container: box.current,
      style: STYLE,
      center: [0, 20],
      zoom: 1.6,
      attributionControl: { compact: true },
      pitchWithRotate: false,
    });
    map.current = m;
    m.on("load", () => {
      m.addSource("reach", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "reach-fill", type: "fill", source: "reach", paint: { "fill-color": "#35c6f4", "fill-opacity": 0.08 } });
      m.addLayer({
        id: "reach-line",
        type: "line",
        source: "reach",
        paint: { "line-color": "#35c6f4", "line-opacity": 0.5, "line-width": 1.5, "line-dasharray": [2, 2] },
      });
    });
    if (TEST_MODE) m.on("click", (e: MapMouseEvent) => simulateWalkTo({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    return () => {
      m.remove();
      map.current = null;
      markers.current.clear();
      meMarker.current = null;
    };
  }, []);

  // ─── me ───
  useEffect(() => {
    const m = map.current;
    const f = loc.fix;
    if (!m || !f) return;
    if (!meMarker.current) {
      const el = document.createElement("div");
      el.className = "me-dot";
      meMarker.current = new Marker({ element: el }).setLngLat([f.lng, f.lat]).addTo(m);
    } else meMarker.current.setLngLat([f.lng, f.lat]);
    const src = m.getSource("reach") as GeoJSONSource | undefined;
    src?.setData(circle(f, reachFor(f.accuracy)));
    if (!centred.current) {
      centred.current = true;
      m.flyTo({ center: [f.lng, f.lat], zoom: 16, speed: 1.6 });
    }
  }, [loc.fix]);

  // ─── report position, receive drops ───
  const report = useCallback(async (f: Fix) => {
    lastReport.current = { at: Date.now(), fix: f };
    try {
      const r = await postJson<{ drops: Drop[]; live: boolean }>("/position", {
        lat: f.lat,
        lng: f.lng,
        accuracy: f.accuracy,
        device_id: deviceId(),
      });
      setDrops(r.drops);
      setLive(r.live);
      setLoadErr(null);
    } catch {
      setLoadErr("Could not load the drops near you.");
    }
  }, []);

  useEffect(() => {
    const f = loc.fix;
    if (!f) return;
    const last = lastReport.current;
    if (!last || Date.now() - last.at > REPORT_EVERY_MS || distanceM(last.fix, f) > REPORT_WHEN_MOVED_M) void report(f);
  }, [loc.fix, report, wallet]);

  useEffect(() => {
    const t = setInterval(() => loc.fix && void report(loc.fix), REPORT_EVERY_MS);
    return () => clearInterval(t);
  }, [loc.fix, report]);

  // after signing in, report at once so the personal drop lands
  useEffect(() => {
    if (wallet && loc.fix) void report(loc.fix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  // ─── live distances, computed on the device between reports ───
  const reach = loc.fix ? reachFor(loc.fix.accuracy) : CATCH.radiusM;
  const view = drops
    .map((d) => {
      const meters = loc.fix ? distanceM(loc.fix, d) : d.meters;
      return { ...d, meters, inReach: meters <= reach };
    })
    .sort((a, b) => a.meters - b.meters);

  // ─── markers ───
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const d of view) {
      seen.add(d.id);
      let entry = markers.current.get(d.id);
      if (!entry) {
        const el = pinEl(d, () => setSelected(d));
        entry = { el, m: new Marker({ element: el, anchor: "bottom" }).setLngLat([d.lng, d.lat]).addTo(m) };
        markers.current.set(d.id, entry);
      }
      entry.el.classList.toggle("in", d.inReach);
      entry.el.classList.toggle("quiet", d.quietUntil > Date.now());
    }
    for (const [id, e] of markers.current) {
      if (!seen.has(id)) {
        e.m.remove();
        markers.current.delete(id);
      }
    }
  });

  // keep a snapshot so the result stays on screen after the drop leaves the map
  const sel = selected ? (view.find((d) => d.id === selected.id) ?? selected) : null;
  const flyTo = (d: Drop) => map.current?.flyTo({ center: [d.lng, d.lat], zoom: 17 });
  const nearest = view[0];
  const live = liveFromPos ?? vault?.live ?? false;
  const payable = vault ? vault.holdings.reduce((t, h) => t + h.dropsPayable, 0) : null;
  const locOff = loc.status === "off" || loc.status === "denied" || loc.status === "error";

  return (
    <div className="mapwrap">
      <div ref={box} className="map" />

      <div className="map-top">
        <a className="pill" href={href("home")} aria-label="Back">
          <Back /> <span className="hide-sm">Back</span>
        </a>
        <span className={`pill ${live ? "live" : "demo"}`}>
          {live ? "live" : "demo"}
          {payable !== null ? ` · vault can fund ${count(payable)} drops` : ""}
        </span>
        <span style={{ marginLeft: "auto" }} />
        {wallet && me.perDay ? (
          <span className="pill num">
            {me.catchesToday}/{me.perDay} today
            {me.nextCatchAt && me.nextCatchAt > now ? ` · next in ${until(me.nextCatchAt, now)}` : ""}
          </span>
        ) : (
          !wallet && (
            <button type="button" className="pill" onClick={openSheet}>
              Sign in to start
            </button>
          )
        )}
        {loc.fix && (
          <button type="button" className="pill" aria-label="Centre on me" onClick={() => map.current?.flyTo({ center: [loc.fix!.lng, loc.fix!.lat], zoom: 16.5 })}>
            <Locate />
          </button>
        )}
      </div>

      {locOff && (
        <div className="loc-card" role="dialog" aria-label="Turn on location">
          <span className="eyebrow">near me</span>
          <h3>{loc.status === "off" ? "Turn on location" : "Location is off"}</h3>
          <p>{loc.error ?? "The browser asks you once. Your position stays on this device. We only use it to look up what is around you."}</p>
          <button type="button" className="btn btn-green btn-block" onClick={() => void startLocation()}>
            {loc.status === "off" ? "Turn on location" : "Try again"}
          </button>
        </div>
      )}

      {!locOff && <div className="near" aria-label="Near me">
        <div className="near-head">
          <div>
            <h3>Near me</h3>
            <div className="sub">
              {loc.fix
                ? nearest
                  ? nearest.inReach
                    ? "one is in reach · tap it to catch"
                    : `nearest ${formatDistance(nearest.meters)} on foot (${walkMinutes(nearest.meters)} min walk) · ±${Math.round(loc.fix.accuracy)} m`
                  : "Counting what is on the map…"
                : loc.status === "asking"
                  ? "Finding you…"
                  : "Location is off"}
            </div>
          </div>
        </div>
        {view.length > 0 ? (
          <div className="near-list">
            {view.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`near-row ${d.inReach ? "in" : ""}`}
                onClick={() => {
                  flyTo(d);
                  setSelected(d);
                }}
              >
                <span className={`badge ${d.rarity}`}>{d.sym}</span>
                <span>
                  <span className="nm">
                    {d.name} · {usd(d.usd)}
                  </span>
                  <br />
                  <span className="sb">
                    {d.rarity}
                    {d.mine ? " · yours" : ""} · gone in {until(d.expiresAt, now)}
                  </span>
                </span>
                <span className="d num">{d.inReach ? "in reach" : formatDistance(d.meters)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="near-body">
            {loadErr ? (
              <p>{loadErr}</p>
            ) : !loc.fix ? (
              <p>
                Turn on location to catch anything. You will see the eight drops nearest you, and which are in reach.{" "}
                <b className="green">Green</b> means close enough to catch.
              </p>
            ) : !wallet ? (
              <>
                <p>Sign in and your own drop lands within a few hundred metres of you.</p>
                <button type="button" className="btn btn-green btn-sm" onClick={openSheet}>
                  Sign in to start
                </button>
              </>
            ) : (
              <p>Nothing within walking distance of you right now. New ones land through the day, and the first one here is yours.</p>
            )}
            {TEST_MODE && loc.fix && <p className="muted">Test mode: tap the map to walk there.</p>}
          </div>
        )}
      </div>

      }
      {sel && <CatchSheet key={sel.id} drop={sel} live={live} onClose={() => setSelected(null)} onCaught={() => loc.fix && void report(loc.fix)} />}
    </div>
  );
}
