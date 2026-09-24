import { useState } from "react";
import { ApiError, postJson, waitForCatch, type CatchState, type Drop } from "../lib/api.ts";
import { deviceId, readLocation, readyToClaim, useLocation } from "../lib/gps.ts";
import { useSession } from "../lib/session.tsx";
import { tokens, usd } from "../lib/format.ts";
import { distanceM, formatDistance, walkMinutes } from "../../../shared/geo.ts";
import { reachFor } from "../../../shared/rules.ts";

type Phase = { k: "idle" } | { k: "sending" } | { k: "done"; c: CatchState } | { k: "error"; msg: string };

const RARITY_COLOR: Record<string, string> = { common: "var(--r-common)", rare: "var(--r-rare)", epic: "var(--r-epic)" };

export function CatchSheet({ drop, live, onClose, onCaught }: { drop: Drop; live: boolean; onClose: () => void; onCaught: () => void }) {
  const loc = useLocation();
  const { wallet, openSheet, refresh } = useSession();
  const [phase, setPhase] = useState<Phase>({ k: "idle" });

  const meters = loc.fix ? distanceM(loc.fix, drop) : drop.meters;
  const reach = loc.fix ? reachFor(loc.fix.accuracy) : 60;
  const inReach = meters <= reach;
  const ready = readyToClaim(loc);
  const quiet = drop.quietUntil > Date.now();

  async function doCatch() {
    const s = readLocation();
    if (!s.fix) return;
    setPhase({ k: "sending" });
    try {
      const r = await postJson<{ catch_id: string }>("/claim", {
        spawn_id: drop.id,
        lat: s.fix.lat,
        lng: s.fix.lng,
        accuracy: s.fix.accuracy,
        gps_log: s.log,
        motion: s.motion,
        device_id: deviceId(),
        client_time: new Date().toISOString(),
      });
      const c = await waitForCatch(r.catch_id);
      setPhase(c.state === "failed" ? { k: "error", msg: c.error ?? "That one did not go through." } : { k: "done", c });
      onCaught();
      void refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "session") openSheet();
      setPhase({ k: "error", msg: (e as Error).message });
    }
  }

  let action: { label: string; disabled: boolean; onClick?: () => void };
  if (!wallet) action = { label: "Sign in to catch", disabled: false, onClick: openSheet };
  else if (quiet) action = { label: "Someone just took it", disabled: true };
  else if (!inReach) action = { label: `Walk ${Math.max(1, Math.round(meters - reach))} m closer`, disabled: true };
  else if (!ready.ready) action = { label: ready.why ?? "One moment", disabled: true };
  else action = { label: "Catch", disabled: false, onClick: () => void doCatch() };

  const head = (title: string, sub: string) => (
    <div className="play-head">
      <span className="big-coin" style={{ ["--rc" as string]: RARITY_COLOR[drop.rarity] }}>
        {drop.sym}
      </span>
      <div style={{ minWidth: 0 }}>
        <h3 className="play-title">{title}</h3>
        <div className="play-sub">{sub}</div>
      </div>
      {phase.k !== "sending" && (
        <button type="button" className="x-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      )}
    </div>
  );

  if (phase.k === "sending")
    return (
      <div className="play-sheet" role="status">
        {head(`Catching ${drop.sym}…`, "moving it out of the vault")}
        <div className="spin" />
        <p style={{ textAlign: "center" }}>About three seconds. Keep the page open.</p>
      </div>
    );

  if (phase.k === "done") {
    const c = phase.c;
    return (
      <div className="play-sheet" role="status">
        {head("It's yours.", `${tokens(c.tokens)} ${c.sym} landed in your wallet`)}
        <div className="num landed-usd">{usd(c.usd)}</div>
        <div className="tiles3">
          <div className="tile">
            <span className="num tile-v">{formatDistance(c.walkM)}</span>
            <span className="tile-l">walked</span>
          </div>
          <div className="tile">
            <span className="num tile-v">~{c.steps}</span>
            <span className="tile-l">steps</span>
          </div>
          <div className="tile">
            <span className="num tile-v">~{c.kcal}</span>
            <span className="tile-l">kcal</span>
          </div>
        </div>
        {c.state === "demo" && <div className="hint gold">Recorded in demo mode: the vault is not live yet, so nothing moved on chain.</div>}
        {c.timedOut && <div className="hint">It is still going through. It will show up on your page.</div>}
        {c.tx && (
          <a className="btn sm ghost wide" href={c.tx} target="_blank" rel="noreferrer">
            See the transfer ↗
          </a>
        )}
        <button type="button" className="btn wide" onClick={onClose}>
          Keep walking
        </button>
      </div>
    );
  }

  return (
    <div className="play-sheet">
      {head(`${drop.name} · ${usd(drop.usd)}`, `${drop.rarity}${drop.mine ? " · your drop" : ""}${live ? "" : " · demo"}`)}
      <div className="tiles3">
        <div className="tile">
          <span className="num tile-v g">{usd(drop.usd)}</span>
          <span className="tile-l">worth</span>
        </div>
        <div className="tile">
          <span className="num tile-v">{tokens(drop.amount)}</span>
          <span className="tile-l">{drop.sym}</span>
        </div>
        <div className="tile">
          <span className={`num tile-v ${inReach ? "g" : ""}`}>{inReach ? "in reach" : formatDistance(meters)}</span>
          <span className="tile-l">{inReach ? `reach ${Math.round(reach)} m` : `${walkMinutes(meters)} min walk`}</span>
        </div>
      </div>
      {phase.k === "error" && <div className="problem">{phase.msg}</div>}
      <button type="button" className="btn wide" disabled={action.disabled} onClick={action.onClick}>
        {action.label}
      </button>
      <p style={{ textAlign: "center" }}>
        {inReach ? "Close enough. Tap and it is yours." : `Walk to it: the pin breathes teal when you are in reach.`}
        {loc.fix ? ` ±${Math.round(loc.fix.accuracy)} m` : ""}
      </p>
    </div>
  );
}
