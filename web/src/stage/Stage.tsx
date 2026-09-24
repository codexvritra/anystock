import { useCallback, useEffect, useRef, useState } from "react";
import { Map as MLMap, Marker, setWorkerUrl, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { Feature, Polygon } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

import { streetNight } from "./mapStyle.ts";
import { Board, Ticker } from "./Board.tsx";
import { CatchSheet } from "./CatchSheet.tsx";
import { BigLogo } from "../components/Brand.tsx";
import { IcBack, IcCity, IcNav, IcPin, IcTrophy } from "../components/Icons.tsx";
import { getJson, postJson, type Claim, type Drop, type Stats, type Vault } from "../lib/api.ts";
import { deviceId, simulateWalkTo, startLocation, useLocation, type Fix } from "../lib/gps.ts";
import { href, usePoll, useNow } from "../lib/hooks.ts";
import { useSession } from "../lib/session.tsx";
import { TEST_MODE } from "../lib/chain.ts";
import { count, until, usd } from "../lib/format.ts";
import { destination, distanceM, formatDistance, walkMinutes } from "../../../shared/geo.ts";
import { cityCoords, CITIES } from "../../../shared/cities.ts";
import { CATCH, STOCKS, reachFor } from "../../../shared/rules.ts";

// maplibre finds its worker relative to its own file, which bundlers rewrite; point it at ours
setWorkerUrl(workerUrl);

const REPORT_EVERY_MS = 30_000;
const REPORT_WHEN_MOVED_M = 25;
const TOUR_MS = 10_000;
/** where the landing tour goes when nobody has caught anything yet */
const DEFAULT_TOUR = ["New York", "Tbilisi", "London", "Tokyo", "Madrid", "São Paulo", "Singapore", "Berlin", "Dubai", "Paris"];

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

/** A pill-shaped drop marker: monogram coin, ticker, value. */
function dropEl(sym: string, value: number, cls: string): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `drop-mk ${cls}`;
  el.innerHTML = `<span class="mk-logo">${sym.slice(0, 1)}</span><span class="mk-sym">${sym}</span><span class="mk-usd">${usd(value)}</span>`;
  return el;
}

function youEl(): HTMLElement {
  const el = document.createElement("span");
  el.className = "you";
  el.innerHTML = `<span class="you-ring"></span><span class="you-dot"></span>`;
  return el;
}

export function Stage({ open }: { open: boolean }) {
  const loc = useLocation();
  const { wallet, me, openSheet } = useSession();
  const now = useNow(1000);

  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const ghosts = useRef<Marker[]>([]);
  const markers = useRef(new Map<string, { m: Marker; el: HTMLElement }>());
  const you = useRef<Marker | null>(null);
  const lastReport = useRef<{ at: number; fix: Fix } | null>(null);
  const centred = useRef(false);

  const [drops, setDrops] = useState<Drop[]>([]);
  const [liveFromPos, setLive] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Drop | null>(null);
  const [panel, setPanel] = useState<"near" | "cities" | null>(null);
  const [noteHidden, setNoteHidden] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const { data: vault } = usePoll(() => getJson<Vault>("/vault"), 60_000);
  const { data: stats } = usePoll(() => getJson<Stats>("/stats"), 60_000);
  const { data: claims } = usePoll(() => getJson<Claim[]>("/claims"), 30_000);

  // ─── the map, created once ───
  useEffect(() => {
    if (!box.current) return;
    const m = new MLMap({
      container: box.current,
      style: streetNight,
      center: [-73.9855, 40.758],
      zoom: 11.8,
      attributionControl: { compact: true },
      pitchWithRotate: false,
      fadeDuration: 0,
    });
    map.current = m;
    m.on("load", () => {
      m.addSource("reach", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "reach-fill", type: "fill", source: "reach", paint: { "fill-color": "#23d3b0", "fill-opacity": 0.08 } });
      m.addLayer({
        id: "reach-line",
        type: "line",
        source: "reach",
        paint: { "line-color": "#23d3b0", "line-opacity": 0.6, "line-width": 1.5, "line-dasharray": [2, 2] },
      });
      setReady(true);
    });
    m.on("error", (e) => console.warn("[map]", e.error?.message ?? e));
    if (TEST_MODE) m.on("click", (e: MapMouseEvent) => simulateWalkTo({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    return () => {
      m.remove();
      map.current = null;
      markers.current.clear();
      ghosts.current = [];
      you.current = null;
    };
  }, []);

  // ─── ambient tour on the landing: city to city, drops popping in and out ───
  const tourCities = (claims ?? [])
    .map((c) => c.city)
    .filter((c, i, a) => c && a.indexOf(c) === i)
    .map((c) => ({ name: c, at: cityCoords(c) }))
    .filter((c): c is { name: string; at: { lat: number; lng: number } } => Boolean(c.at));
  const tourKey = tourCities.map((c) => c.name).join("|");

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || open) return;
    const list =
      tourCities.length >= 2
        ? tourCities.map((c) => c.at)
        : DEFAULT_TOUR.map((n) => cityCoords(n)).filter((c): c is { lat: number; lng: number } => Boolean(c));
    let i = Math.floor(Math.random() * list.length);
    let timer: number;
    const canvas = box.current;

    const clearGhosts = () => {
      ghosts.current.forEach((g) => g.remove());
      ghosts.current = [];
    };
    const visit = () => {
      const c = list[i % list.length];
      i++;
      m.stop();
      m.jumpTo({ center: [c.lng, c.lat], zoom: 11.8, bearing: 0 });
      m.easeTo({ center: [c.lng + 0.016, c.lat + 0.0072], duration: TOUR_MS, easing: (t) => t, essential: true });
      canvas?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, fill: "forwards", easing: "ease-out" });
      clearGhosts();
      for (let k = 0; k < 8; k++) {
        const s = STOCKS[k % 3];
        const p = destination(c, 600 + Math.random() * 3200, Math.random() * 360);
        const el = dropEl(`${s.sym}`, 0.5 + Math.random() * 1.2 * (k % 5 === 4 ? 3 : 1), `ghost ${k % 5 === 4 ? "rare" : ""}`);
        el.style.setProperty("--gd", `${(k * 1.1).toFixed(1)}s`);
        ghosts.current.push(new Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(m));
      }
      timer = window.setTimeout(() => {
        canvas?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, fill: "forwards", easing: "ease-in" });
        timer = window.setTimeout(visit, 700);
      }, TOUR_MS);
    };
    visit();
    return () => {
      clearTimeout(timer);
      clearGhosts();
      canvas?.getAnimations().forEach((a) => a.cancel());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, open, tourKey]);

  // opening the map: unblur, and go to the player if we know where they are
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !open) return;
    m.stop();
    if (loc.fix) {
      centred.current = true;
      m.flyTo({ center: [loc.fix.lng, loc.fix.lat], zoom: 16, speed: 1.4 });
    } else {
      centred.current = false;
      m.easeTo({ zoom: 12.6, duration: 900 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready]);

  // ─── the player ───
  useEffect(() => {
    const m = map.current;
    const f = loc.fix;
    if (!m || !ready || !f || !open) return;
    if (!you.current) you.current = new Marker({ element: youEl() }).setLngLat([f.lng, f.lat]).addTo(m);
    else you.current.setLngLat([f.lng, f.lat]);
    (m.getSource("reach") as GeoJSONSource | undefined)?.setData(circle(f, reachFor(f.accuracy)));
    if (!centred.current) {
      centred.current = true;
      m.flyTo({ center: [f.lng, f.lat], zoom: 16, speed: 1.4 });
    }
  }, [loc.fix, ready, open]);

  useEffect(() => {
    if (open) return;
    you.current?.remove();
    you.current = null;
    (map.current?.getSource("reach") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
  }, [open]);

  // ─── report position, receive drops ───
  const report = useCallback(async (f: Fix) => {
    lastReport.current = { at: Date.now(), fix: f };
    try {
      const r = await postJson<{ drops: Drop[]; live: boolean }>("/position", { lat: f.lat, lng: f.lng, accuracy: f.accuracy, device_id: deviceId() });
      setDrops(r.drops);
      setLive(r.live);
      setLoadErr(null);
    } catch {
      setLoadErr("Could not load the drops near you.");
    }
  }, []);

  useEffect(() => {
    const f = loc.fix;
    if (!f || !open) return;
    const last = lastReport.current;
    if (!last || Date.now() - last.at > REPORT_EVERY_MS || distanceM(last.fix, f) > REPORT_WHEN_MOVED_M) void report(f);
  }, [loc.fix, report, open]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => loc.fix && void report(loc.fix), REPORT_EVERY_MS);
    return () => clearInterval(t);
  }, [loc.fix, report, open]);

  useEffect(() => {
    if (wallet && loc.fix && open) void report(loc.fix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  // live distances between reports
  const reach = loc.fix ? reachFor(loc.fix.accuracy) : CATCH.radiusM;
  const view = drops
    .map((d) => {
      const meters = loc.fix ? distanceM(loc.fix, d) : d.meters;
      return { ...d, meters, inReach: meters <= reach };
    })
    .sort((a, b) => a.meters - b.meters);

  // ─── drop markers ───
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const seen = new Set<string>();
    if (open) {
      for (const d of view) {
        seen.add(d.id);
        let e = markers.current.get(d.id);
        if (!e) {
          const el = dropEl(d.sym, d.usd, `pop ${d.rarity}`);
          el.setAttribute("aria-label", `${d.name} drop, ${usd(d.usd)}`);
          el.addEventListener("click", (ev) => {
            ev.stopPropagation();
            setSelected(d);
          });
          e = { el, m: new Marker({ element: el, anchor: "bottom" }).setLngLat([d.lng, d.lat]).addTo(m) };
          markers.current.set(d.id, e);
        }
        e.el.classList.toggle("reach", d.inReach);
        e.el.classList.toggle("quiet", d.quietUntil > Date.now());
      }
    }
    for (const [id, e] of markers.current) {
      if (!seen.has(id)) {
        e.m.remove();
        markers.current.delete(id);
      }
    }
  });

  const flyTo = (p: { lat: number; lng: number }, zoom = 16.5) => map.current?.flyTo({ center: [p.lng, p.lat], zoom, speed: 1.4 });
  const sel = selected ? (view.find((d) => d.id === selected.id) ?? selected) : null;
  const nearest = view[0];
  const live = liveFromPos ?? vault?.live ?? false;
  const payable = vault ? vault.holdings.reduce((t, h) => t + h.dropsPayable, 0) : null;
  const locOff = loc.status === "off" || loc.status === "denied" || loc.status === "error";
  const cities = stats?.topCities ?? [];

  // the one big button on the map
  let cta: { label: string; icon?: React.ReactNode; onClick: () => void; lime?: boolean };
  if (locOff)
    cta = { label: loc.status === "off" ? "Turn on location" : "Try location again", icon: <IcPin />, onClick: () => void startLocation(), lime: true };
  else if (loc.status === "asking" && !loc.fix) cta = { label: "Finding you…", onClick: () => {} };
  else if (!wallet) cta = { label: "Sign in to start", onClick: openSheet };
  else if (nearest?.inReach) cta = { label: `Catch ${nearest.sym}`, onClick: () => setSelected(nearest) };
  else if (nearest) cta = { label: `Walk to ${nearest.sym} · ${formatDistance(nearest.meters)}`, icon: <IcNav />, onClick: () => flyTo(nearest, 16) };
  else cta = { label: "Centre on me", icon: <IcNav />, onClick: () => loc.fix && flyTo(loc.fix, 16) };

  // the note above the button
  let note: React.ReactNode = null;
  let bad = false;
  if (loc.error) {
    note = loc.error;
    bad = true;
  } else if (loadErr) {
    note = loadErr;
    bad = true;
  } else if (loc.fix && nearest) {
    note = nearest.inReach ? (
      <>
        <span className="reach">in reach</span> · tap it to catch
      </>
    ) : (
      <>
        nearest <b>{formatDistance(nearest.meters)}</b> on foot ({walkMinutes(nearest.meters)} min walk) · ±{Math.round(loc.fix.accuracy)} m
      </>
    );
  } else if (loc.fix && wallet) note = "Nothing within walking distance right now. New ones land through the day.";
  if (TEST_MODE && loc.fix && !bad) note = <>{note} · test mode: tap the map to walk</>;

  return (
    <section className={`stage ${open ? "open" : ""}`}>
      <div className="map-layer">
        <div ref={box} className={`map-canvas ${open ? "" : "ambient ambient-pins"}`} />
        <div className={`loader ${ready ? "gone" : ""}`} aria-hidden={ready}>
          <span className="loader-mark">
            <span className="loader-ring" />
            <span className="loader-ring" />
            <svg className="loader-pin" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2c-4 0-7 3-7 6.9C5 14.1 12 22 12 22s7-7.9 7-13.1C19 5 16 2 12 2zm0 9.5a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z" />
            </svg>
          </span>
          Drawing the streets…
        </div>
      </div>

      <div className="veil" />
      <div className="logo-layer">
        <BigLogo className="big-logo" />
      </div>

      <div className="copy">
        <h1 className="title">
          <span className="title-top">Stocks are lying</span>
          <span className="title-bottom">on the street.</span>
        </h1>
        <p className="sub">
          <span>Real fragments of Nvidia, Tesla and Apple drop on the map around you.</span>
          <span>Walk there, tap, and the stock lands in your own wallet.</span>
          <span>Free to play, nothing to buy, ever.</span>
        </p>
        <div className="cta">
          <a className="btn lg pulse" href={href("map")}>
            Open the map
          </a>
          <a className="btn lg ghost" href={href("how")}>
            How it works
          </a>
        </div>
      </div>

      <Board stats={stats} />
      <Ticker claims={claims} />

      {/* ─── map open ─── */}
      <div className="map-ui" aria-hidden={!open}>
        <a className="paper-pill back" href={href("home")}>
          <IcBack /> Back
        </a>
        <span className="paper-pill status-pill">
          <span className={`dot ${live ? "" : "amber"}`} />
          {live ? "live" : "demo"}
          {payable !== null ? ` · ${count(payable)} drops funded` : ""}
        </span>
        <a className="trophy" href={href("legendary")} aria-label="Legendary">
          <IcTrophy size={22} />
        </a>
        {open && note && !noteHidden && (
          <div className={`note ${bad ? "bad" : ""}`} role="status">
            <span>{note}</span>
            <button type="button" className="note-x" onClick={() => setNoteHidden(true)} aria-label="Hide">
              ×
            </button>
          </div>
        )}
        <div className="map-cta">
          {wallet && me.perDay ? (
            <span className="note" style={{ position: "static" }}>
              <b>
                {me.catchesToday}/{me.perDay}
              </b>{" "}
              today{me.nextCatchAt && me.nextCatchAt > now ? ` · next in ${until(me.nextCatchAt, now)}` : ""}
            </span>
          ) : null}
          <button type="button" className={`btn lg ${cta.lime ? "lime" : ""}`} onClick={cta.onClick}>
            {cta.icon}
            {cta.label}
          </button>
          <button type="button" className={`corner c-near ${panel === "near" ? "on" : ""}`} onClick={() => setPanel(panel === "near" ? null : "near")}>
            <span className="corner-icon">
              <IcPin />
              <span className="corner-num num">{view.length}</span>
            </span>
            <span className="corner-name">Near me</span>
          </button>
          <button type="button" className={`corner c-cities ${panel === "cities" ? "on" : ""}`} onClick={() => setPanel(panel === "cities" ? null : "cities")}>
            <span className="corner-icon">
              <IcCity />
              <span className="corner-num num">{cities.length}</span>
            </span>
            <span className="corner-name">Cities</span>
          </button>
        </div>
      </div>

      <aside className="panels" aria-hidden={!open}>
        <div className={`pnl near ${panel === "near" ? "on" : ""}`}>
          <h3 className="pnl-title">
            Near me <small>{loc.fix ? `the ${Math.min(8, view.length) || "eight"} nearest` : ""}</small>
          </h3>
          {!loc.fix ? (
            <div className="blank">
              <span className="blank-icon">
                <IcPin />
              </span>
              <p className="blank-title">{loc.status === "off" ? "Location is off" : loc.status === "asking" ? "Finding you…" : "Location is off"}</p>
              <p className="blank-line">
                Turn it on and the eight nearest drops land here. <b>Green</b> means close enough to catch.
              </p>
            </div>
          ) : view.length === 0 ? (
            <div className="blank">
              <span className="blank-icon">
                <IcPin />
              </span>
              <p className="blank-title">{wallet ? "Nothing near you yet" : "Sign in for your drop"}</p>
              <p className="blank-line">
                {wallet
                  ? "New ones land through the day, and the first one here is yours."
                  : "Sign in and your own drop lands within a few hundred metres of you."}
              </p>
            </div>
          ) : (
            <ul className="list near-list">
              {view.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className={d.inReach ? "in" : ""}
                    onClick={() => {
                      flyTo(d, 17);
                      setSelected(d);
                    }}
                  >
                    <span className="mk-logo">{d.sym.slice(0, 1)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="l-name">
                        {d.name} · {usd(d.usd)}
                      </span>
                      <span className="l-sub">
                        {d.rarity}
                        {d.mine ? " · yours" : ""} · gone in {until(d.expiresAt, now)}
                      </span>
                    </span>
                    <span className="l-count num">{d.inReach ? "in reach" : formatDistance(d.meters)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`pnl cities ${panel === "cities" ? "on" : ""}`}>
          <h3 className="pnl-title">
            Cities <small>{cities.length ? `${cities.length} with catches` : ""}</small>
          </h3>
          <p className="pnl-lead">Where people have walked for stock. Tap one to fly there.</p>
          {cities.length ? (
            <ul className="list">
              {cities.map((c) => {
                const at = cityCoords(c.city);
                return (
                  <li key={c.city}>
                    <button type="button" disabled={!at} onClick={() => at && flyTo(at, 12.5)}>
                      <span className="l-name">{c.city}</span>
                      <span className="l-sub" style={{ marginLeft: 6 }}>
                        {usd(c.usd)}
                      </span>
                      <span className="l-count num">{c.n}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="l-empty">No catches in any city yet. The first one on the street takes it.</p>
          )}
          <p className="pnl-lead" style={{ marginTop: 10, marginBottom: 0 }}>
            {CITIES.length} cities on the list · drops land wherever a player stands
          </p>
        </div>
      </aside>

      {open && sel && (
        <div className="play">
          <CatchSheet
            key={sel.id}
            drop={sel}
            live={live}
            onClose={() => setSelected(null)}
            onCaught={() => loc.fix && void report(loc.fix)}
          />
        </div>
      )}
    </section>
  );
}
