import { useState } from "react";
import { Sheet } from "./Sheet.tsx";
import { ApiError, postJson, waitForCatch, type CatchState, type Drop } from "../lib/api.ts";
import { deviceId, readLocation, readyToClaim, useLocation } from "../lib/gps.ts";
import { useSession } from "../lib/session.tsx";
import { usd, tokens } from "../lib/format.ts";
import { distanceM, formatDistance, walkMinutes } from "../../../shared/geo.ts";
import { reachFor } from "../../../shared/rules.ts";

type Phase = { k: "idle" } | { k: "sending" } | { k: "done"; c: CatchState } | { k: "error"; msg: string };

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
      if (c.state === "failed") setPhase({ k: "error", msg: c.error ?? "That one did not go through." });
      else setPhase({ k: "done", c });
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

  if (phase.k === "sending")
    return (
      <Sheet onClose={() => {}} narrow label="Sending">
        <div className="landed">
          <div className="spinner" />
          <p className="muted">Moving {drop.sym} out of the vault and into your wallet…</p>
        </div>
      </Sheet>
    );

  if (phase.k === "done") {
    const c = phase.c;
    return (
      <Sheet onClose={onClose} narrow eyebrow="caught" label="Caught">
        <div className="landed">
          <div className={`badge big ${drop.rarity}`} style={{ margin: "0 auto" }}>
            {c.sym}
          </div>
          <div className="big">{usd(c.usd)}</div>
          <p style={{ margin: 0, fontWeight: 800 }}>
            {tokens(c.tokens)} {c.sym} is yours
          </p>
          <div className="kv" style={{ marginTop: 18 }}>
            <div>
              <div className="k">walked</div>
              <div className="v">{formatDistance(c.walkM)}</div>
            </div>
            <div>
              <div className="k">steps</div>
              <div className="v">~{c.steps}</div>
            </div>
            <div>
              <div className="k">kcal</div>
              <div className="v">~{c.kcal}</div>
            </div>
          </div>
          {c.state === "demo" && <p className="notice">Recorded in demo mode: the vault is not live yet, so nothing moved on chain.</p>}
          {c.timedOut && <p className="notice">It is still going through. It will show up on your page.</p>}
          {c.tx && (
            <a className="btn btn-ghost btn-block" href={c.tx} target="_blank" rel="noreferrer" style={{ marginTop: 14 }}>
              See the transfer on Blockscout
            </a>
          )}
          <button type="button" className="btn btn-green btn-block" style={{ marginTop: 10 }} onClick={onClose}>
            Keep walking
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose} narrow label={`${drop.name} drop`}>
      <div className="catch-head">
        <div className={`badge big ${drop.rarity}`}>{drop.sym}</div>
        <div>
          <div className="t">{drop.name}</div>
          <div className="s">
            <span className={`rar ${drop.rarity}`}>{drop.rarity}</span> {drop.mine ? "· your drop" : ""}
          </div>
        </div>
      </div>
      <div className="kv">
        <div>
          <div className="k">worth</div>
          <div className="v green">{usd(drop.usd)}</div>
        </div>
        <div>
          <div className="k">{drop.sym}</div>
          <div className="v">{tokens(drop.amount)}</div>
        </div>
        <div>
          <div className="k">distance</div>
          <div className="v" style={{ color: inReach ? "var(--green)" : undefined }}>
            {inReach ? "in reach" : formatDistance(meters)}
          </div>
        </div>
      </div>
      {phase.k === "error" && <p className="err">{phase.msg}</p>}
      <button type="button" className="btn btn-green btn-block" disabled={action.disabled} onClick={action.onClick}>
        {action.label}
      </button>
      <p className="why">
        {inReach
          ? `in reach · reach is ${Math.round(reach)} m`
          : `${formatDistance(meters)} away (${walkMinutes(meters)} min walk), reach is ${Math.round(reach)} m`}
        {loc.fix ? ` · ±${Math.round(loc.fix.accuracy)} m` : ""}
        {!live ? " · demo" : ""}
      </p>
      <button type="button" className="btn-quiet btn-block" onClick={onClose}>
        Keep walking
      </button>
    </Sheet>
  );
}
