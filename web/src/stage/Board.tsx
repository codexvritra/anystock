import { useState } from "react";
import { IcChev } from "../components/Icons.tsx";
import type { Claim, Stats } from "../lib/api.ts";
import { href, useNow } from "../lib/hooks.ts";
import { ago, count, usd } from "../lib/format.ts";

/** The stats card on the landing. On phones it collapses to one line above the dock. */
export function Board({ stats: s }: { stats: Stats | null }) {
  const [on, setOn] = useState(false);
  const rows: [string, string][] = [
    ["today", s ? usd(s.todayUsd, s.todayUsd < 100 ? 2 : 0) : "—"],
    ["ready to catch", s ? usd(s.readyUsd, 0) : "—"],
    ["drops payable", s ? count(s.dropsPayable) : "—"],
    ["walkers", s ? count(s.walkers) : "—"],
    ["cities", s ? count(s.cities) : "—"],
  ];
  return (
    <aside className={`board ${on ? "on" : ""}`} aria-label="The numbers">
      <button type="button" className="board-handle" onClick={() => setOn(!on)} aria-expanded={on}>
        <span className="board-big">
          <span className="board-big-label">given away, all time</span>
          <span className="num board-big-value">{s ? usd(s.givenUsd, s.givenUsd < 100 ? 2 : 0) : "—"}</span>
        </span>
        <span className="chev">
          <IcChev />
        </span>
      </button>
      <div className="board-body">
        <dl className="board-rows">
          {rows.map(([k, v]) => (
            <div className="brow" key={k}>
              <dt>{k}</dt>
              <dd className="num">{v}</dd>
            </div>
          ))}
        </dl>
        <a className="linkish board-more" href={href("stats")}>
          All the numbers →
        </a>
      </div>
    </aside>
  );
}

/** Every catch, as it happens, scrolling along the bottom (the top, once the map is open). */
export function Ticker({ claims }: { claims: Claim[] | null }) {
  const now = useNow(30_000);
  if (!claims?.length)
    return (
      <div className="ticker">
        <span className="ticker-soon">
          <span className="dot" /> Nothing caught yet · the first one on the street takes it
        </span>
      </div>
    );
  // repeat so the loop is seamless, then the track scrolls exactly half its width
  const reps = Math.max(1, Math.ceil(10 / claims.length));
  const run = Array.from({ length: reps }, () => claims).flat();
  const Run = ({ hidden }: { hidden?: boolean }) => (
    <ul className="ticker-run" aria-hidden={hidden}>
      {run.map((c, i) => (
        <li key={`${c.id}-${i}`}>
          <span className="t-dot" />
          <span>wallet</span>
          <b className="t-who">{c.walker}</b>
          <span>caught</span>
          <b className="num t-usd">{usd(c.usd)}</b>
          <span>of</span>
          <b className="t-sym">{c.sym}</b>
          {c.city && <span>in {c.city}</span>}
          <span className="t-when">{ago(c.at, now)}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="ticker" aria-label="Latest catches">
      <div className="ticker-track">
        <Run />
        <Run hidden />
      </div>
    </div>
  );
}
