import { getJson, type Claim } from "../lib/api.ts";
import { usePoll, useNow } from "../lib/hooks.ts";
import { ago, usd } from "../lib/format.ts";

/** The live claim feed as a marquee. Refreshes every 30 s, like the original. */
export function Ticker() {
  const { data } = usePoll(() => getJson<Claim[]>("/claims"), 30_000);
  const now = useNow(30_000);
  if (!data?.length) return null;

  // repeat so the loop is seamless even with only a few rows
  const reps = Math.max(2, Math.ceil(12 / data.length) * 2);
  const rows = Array.from({ length: reps }, () => data).flat();

  return (
    <div className="ticker" aria-label="Latest catches">
      <div className="ticker-track">
        {rows.map((c, i) => (
          <a key={`${c.id}-${i}`} className="tick" href={c.tx ?? undefined} target="_blank" rel="noreferrer" aria-hidden={i >= data.length}>
            <span className="v">wallet</span>
            <b className="mono">{c.walker}</b>
            <span className="v">caught</span>
            <span className="amt">{usd(c.usd)}</span>
            <span className="v">of</span>
            <b>{c.sym}</b>
            {c.city && <span className="v">in {c.city}</span>}
            <span className="when">{ago(c.at, now)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
