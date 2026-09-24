import { useState } from "react";
import { Sheet } from "../components/Sheet.tsx";
import { ApiError, getJson, postJson, waitForCatch, type BoardRow, type LegendaryView, type Proof, type Stats, type Vault } from "../lib/api.ts";
import { usePoll, useNow, go } from "../lib/hooks.ts";
import { ago, count, short, tokens, until, usd } from "../lib/format.ts";
import { deviceId, readLocation, readyToClaim, startLocation, useLocation } from "../lib/gps.ts";
import { useSession } from "../lib/session.tsx";
import { CATCH, LEGENDARY, RULES_TABLE, SPLIT, STREET } from "../../../shared/rules.ts";
import { distanceM, formatDistance } from "../../../shared/geo.ts";

const close = () => go("home");

// ─────────────────────────── how it works ───────────────────────────

export function HowItWorks() {
  return (
    <Sheet onClose={close} eyebrow="how it works" title="Three steps. That is the whole game." lede="No purchase, no subscription, no in-app currency. You walk, you catch, you keep it.">
      <div className="steps" style={{ marginTop: 0 }}>
        <div className="step">
          <div className="n">01</div>
          <h3>Open the map</h3>
          <p>Sign in with Google, X or a wallet. A wallet is made for you. No app store, no seed phrase.</p>
        </div>
        <div className="step">
          <div className="n">02</div>
          <h3>Walk to the tag</h3>
          <p>
            One stock at a time drops {STREET.ringMinM} to {STREET.ringM} m from wherever you are. Walk to within {CATCH.radiusM} m of it.
          </p>
        </div>
        <div className="step">
          <div className="n">03</div>
          <h3>Tap. Own a company.</h3>
          <p>The fragment moves out of the public vault into your wallet on Robinhood Chain. Free: we pay the gas.</p>
        </div>
      </div>

      <h3>The rules</h3>
      <p className="note">Six of them. None of them bend.</p>
      <dl className="rules">
        {RULES_TABLE.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <h3>Why spoofing does not pay</h3>
      <p className="note">The server checks the shape of your GPS log, not just the number.</p>
      <dl className="rules">
        <div>
          <dt>The walk</dt>
          <dd>Keep the map open while you walk. Your trail must move at walking speed; teleports and cars are refused.</dd>
        </div>
        <div>
          <dt>The phone</dt>
          <dd>A real phone jitters and its accelerometer twitches. Perfect coordinates and a perfectly still device look like an emulator.</dd>
        </div>
        <div>
          <dt>The limits</dt>
          <dd>Per wallet, per phone, per network and per 11 m square, every day. Farming is slower than walking.</dd>
        </div>
        <div>
          <dt>The vault</dt>
          <dd>Even if everything else failed, the vault contract caps what it pays per catch and per day, on-chain.</dd>
        </div>
      </dl>
      <p className="fine">If a catch fails, the drop stays on the map and nothing is spent.</p>
    </Sheet>
  );
}

// ─────────────────────────── proof ───────────────────────────

export function ProofPanel() {
  const { data: p } = usePoll(() => getJson<Proof>("/proof"), 60_000);
  const { data: v } = usePoll(() => getJson<Vault>("/vault"), 60_000);
  const now = useNow(30_000);

  const rows: [string, string, Proof["addresses"]["vault"] | undefined][] = [
    ["Drop vault", "receives the map share, buys the stock, holds it and pays every catch", p?.addresses.vault],
    ["Fee splitter", `splits every creator fee ${SPLIT.map} / ${SPLIT.burn} / ${SPLIT.team}, immutable, anyone can trigger it`, p?.addresses.splitter],
    ["$WALK token", "fixed supply, no mint function, no owner", p?.addresses.token],
  ];

  return (
    <Sheet
      onClose={close}
      tone="blue"
      eyebrow="proof"
      title="Two public contracts and one published rule."
      lede="Every fee is split the same way, every burn is a transaction, and every stock on the map was bought into the vault before it appeared. Read it straight off Robinhood Chain."
    >
      <h3>The split</h3>
      <p className="note">Hard-coded in FeeSplitter. Nobody can change it, including us.</p>
      <div className="split-bar">
        <div style={{ flex: SPLIT.map, background: "var(--green)" }}>map {SPLIT.map}%</div>
        <div style={{ flex: SPLIT.burn, background: "var(--gold)" }}>burn {SPLIT.burn}%</div>
        <div style={{ flex: SPLIT.team, background: "var(--blue)" }}>{SPLIT.team}%</div>
      </div>
      {p?.splitter && (
        <div className="cards" style={{ marginTop: 10 }}>
          <div className="card">
            <div className="label">to the map</div>
            <div className="value">{Number(p.splitter.toMapEth).toFixed(3)} ETH</div>
          </div>
          <div className="card">
            <div className="label">$WALK burned</div>
            <div className="value">{count(Math.round(Number(p.splitter.walkBurned)))}</div>
            <div className="sub">for {Number(p.splitter.burnEth).toFixed(3)} ETH</div>
          </div>
          <div className="card">
            <div className="label">waiting to burn</div>
            <div className="value">{Number(p.splitter.burnReserveEth).toFixed(3)} ETH</div>
          </div>
        </div>
      )}

      <h3>The addresses</h3>
      <p className="note">All created for this project and used for nothing else. If an address is not on this list, it is not ours.</p>
      {rows.map(([what, why, a]) => (
        <div className="addr" key={what}>
          <div>
            <div className="what">{what}</div>
            <div className="why">{why}</div>
            {a && <div className="mono muted">{short(a.address)}</div>}
          </div>
          {a ? (
            <a href={a.url} target="_blank" rel="noreferrer">
              Blockscout ↗
            </a>
          ) : (
            <span className="muted">not deployed yet</span>
          )}
        </div>
      ))}

      <h3>In the vault</h3>
      <p className="note">A drop only appears where the vault can pay it. These are the payable counts.</p>
      {v?.holdings.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>Stock</th>
              <th className="right">Held</th>
              <th className="right">Worth</th>
              <th className="right">Drops</th>
            </tr>
          </thead>
          <tbody>
            {v.holdings.map((h) => (
              <tr key={h.sym}>
                <td>
                  <b>{h.sym}</b> <span className="muted">{h.name}</span>
                </td>
                <td className="right num">{tokens(h.tokens)}</td>
                <td className="right num">{usd(h.usd, 0)}</td>
                <td className="right num">{count(h.dropsPayable)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty">Reading the vault…</div>
      )}

      <h3>Payouts</h3>
      <p className="note">Every one of these is a transfer on the chain. The transaction is the receipt.</p>
      {p?.payouts.length ? (
        <table className="table">
          <tbody>
            {p.payouts.map((x) => (
              <tr key={x.tx + x.walker + x.at}>
                <td className="mono">{x.walker}</td>
                <td>
                  {tokens(x.tokens)} {x.sym}
                </td>
                <td className="right num">{usd(x.usd)}</td>
                <td className="right muted">{ago(x.at, now)}</td>
                <td className="right">
                  <a href={x.tx} target="_blank" rel="noreferrer">
                    tx ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty">{p?.live === false ? "Demo mode: the vault is not live yet, so there are no on-chain payouts to show." : "No payouts yet."}</div>
      )}
    </Sheet>
  );
}

// ─────────────────────────── legendary ───────────────────────────

export function LegendaryPanel() {
  const { data, reload } = usePoll(() => getJson<LegendaryView>("/legendary"), 30_000);
  const now = useNow(1000);
  const loc = useLocation();
  const { wallet, openSheet } = useSession();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const n = data?.next;

  async function claim() {
    const s = readLocation();
    if (!n || !s.fix) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await postJson<{ catch_id: string }>("/legendary/claim", {
        id: n.id,
        code,
        lat: s.fix.lat,
        lng: s.fix.lng,
        accuracy: s.fix.accuracy,
        gps_log: s.log,
        motion: s.motion,
        device_id: deviceId(),
        client_time: new Date().toISOString(),
      });
      const c = await waitForCatch(r.catch_id, 60_000);
      setMsg({ ok: true, text: `It's yours: ${tokens(c.tokens)} ${c.sym}${c.state === "demo" ? " (demo mode, nothing moved on chain)" : ""}.` });
      reload();
    } catch (e) {
      if (e instanceof ApiError && e.code === "session") openSheet();
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const dist = n?.lat != null && loc.fix ? distanceM(loc.fix, { lat: n.lat, lng: n.lng! }) : null;

  return (
    <Sheet
      onClose={close}
      tone="gold"
      eyebrow="legendary"
      title="A whole share. One spot. One code."
      lede="Once a week a whole share is put down at one spot in the featured city. First person to stand there and type the code takes it home."
    >
      {n ? (
        <div className="legend-card">
          <span className="tag">{n.open ? "open now" : n.announced ? "announced" : "next one"}</span>
          <div className="when num">{n.open ? `${until(n.endsAt, now)} left` : until(n.startsAt, now)}</div>
          <p style={{ margin: "6px 0 0", fontWeight: 800 }}>
            1 share of {n.name} ({n.sym}) · about {usd(n.usd, 0)}
          </p>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {n.announced ? `${n.spot}, ${n.city}` : `The city and spot are announced ${LEGENDARY.announceHoursAhead} hours before.`}
          </p>
          {n.open && (
            <div style={{ marginTop: 16 }}>
              {!wallet ? (
                <button type="button" className="btn btn-green btn-block" onClick={openSheet}>
                  Sign in to claim
                </button>
              ) : !loc.fix ? (
                <button type="button" className="btn btn-green btn-block" onClick={() => void startLocation()}>
                  Turn on location
                </button>
              ) : (
                <>
                  {dist !== null && (
                    <p className="muted" style={{ margin: 0 }}>
                      {dist <= LEGENDARY.radiusM ? "You are on the spot." : `${formatDistance(dist)} from the spot. The radius is ${LEGENDARY.radiusM} m.`}
                    </p>
                  )}
                  <input
                    className="code-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 16))}
                    placeholder="CODE"
                    aria-label="The code on the spot"
                    autoCapitalize="characters"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="btn btn-green btn-block"
                    disabled={busy || code.length < 3 || !readyToClaim(loc).ready}
                    onClick={() => void claim()}
                  >
                    {busy ? "Checking…" : readyToClaim(loc).ready ? "Claim the share" : readyToClaim(loc).why}
                  </button>
                </>
              )}
              {msg && <p className={msg.ok ? "notice" : "err"} style={{ marginTop: 10 }}>{msg.text}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="empty">The next legendary has not been placed yet. It is announced a day ahead.</div>
      )}

      <h3>How it stays fair</h3>
      <dl className="rules">
        <div>
          <dt>Announced a day ahead</dt>
          <dd>City and spot, {LEGENDARY.announceHoursAhead} hours before. Enough time to get there. Not enough time to fake it.</dd>
        </div>
        <div>
          <dt>A code, stuck to the spot</dt>
          <dd>A short code is physically at the place. You type it in. GPS spoofing gets nothing because the code is not on the internet.</dd>
        </div>
        <div>
          <dt>Tight and short</dt>
          <dd>
            The window is {LEGENDARY.windowMin} minutes. The catch radius is {LEGENDARY.radiusM} m, not the usual {CATCH.radiusM}. You have to be
            standing there.
          </dd>
        </div>
        <div>
          <dt>One winner</dt>
          <dd>The first valid claim takes it. The winner slot is written before the payout is sent, so two people cannot both win.</dd>
        </div>
      </dl>

      <h3>Past winners</h3>
      {data?.past.length ? (
        <table className="table">
          <tbody>
            {data.past.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.city}</b>
                  <br />
                  <span className="muted">{p.spot}</span>
                </td>
                <td>{p.sym}</td>
                <td className="mono">{p.winner ? short(p.winner) : <span className="muted">nobody made it</span>}</td>
                <td className="right">{p.txHash ? "tx ↗" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty">Nothing caught yet. The first one on the street takes it.</div>
      )}
    </Sheet>
  );
}

// ─────────────────────────── coming soon ───────────────────────────

const SOON: [string, string, string][] = [
  ["week 3", "Amazon and Meta on the map", "Two more companies join Nvidia, Tesla and Apple once the vault has a week of reserve for them."],
  ["next", "Boosts for $WALK holders", "Hold $WALK for 7 days and your wait between catches drops: Bronze 40 min, Silver 35 min and +1 a day, Gold 30 min and +2 a day."],
  ["next", "Sponsored drops", "A brand funds drops around its door. The walk still has to be real; the stock still comes from the vault."],
  ["next", "The app", "The map stays awake while you walk, and your drop arrives as a notification. Until then, the site plays the same game."],
  ["later", "Streaks", "Walk three days in a row and the fourth day brings a guaranteed rare."],
];

export function ComingSoon() {
  return (
    <Sheet onClose={close} tone="epic" eyebrow="coming soon" title="What lands next." lede="In the order we expect to ship it. Nothing here costs you anything either.">
      <div className="soon-grid">
        {SOON.map(([when, t, p]) => (
          <div className="card" key={t}>
            <span className="tag">{when}</span>
            <h4>{t}</h4>
            <p>{p}</p>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

// ─────────────────────────── stats ───────────────────────────

export function StatsPanel() {
  const { data: s } = usePoll(() => getJson<Stats>("/stats"), 60_000);
  const { data: board } = usePoll(() => getJson<BoardRow[]>("/board"), 60_000);
  const max = Math.max(0.01, ...(s?.days.map((d) => d.usd) ?? [0]));

  return (
    <Sheet onClose={close} eyebrow="stats" title="All the numbers." lede="Read straight off the chain, or counted from rows that reference a transaction. Live, refreshed every minute.">
      <div className="cards">
        {(
          [
            ["given away", s ? usd(s.givenUsd) : "—", s ? `${count(s.catches)} catches` : ""],
            ["today", s ? usd(s.todayUsd) : "—", s ? `${count(s.todayCatches)} catches` : ""],
            ["ready to catch", s ? usd(s.readyUsd, 0) : "—", s ? `${count(s.dropsPayable)} drops payable` : ""],
            ["on the map now", s ? count(s.onMap) : "—", "open drops"],
            ["walkers", s ? count(s.walkers) : "—", s ? `across ${count(s.cities)} cities` : ""],
            ["walked", s ? `${s.walkedKm.toFixed(1)} km` : "—", "to catch them"],
            ["median time to landed", s?.medianLandMs ? `${(s.medianLandMs / 1000).toFixed(1)} s` : "—", "tap to wallet"],
          ] as const
        ).map(([k, v, sub]) => (
          <div className="card" key={k}>
            <div className="label">{k}</div>
            <div className="value">{v}</div>
            <div className="sub">{sub}</div>
          </div>
        ))}
      </div>

      <h3>Payouts, last 14 days</h3>
      {s?.days.length ? (
        <div className="bars">
          {s.days.map((d) => (
            <div key={d.day} style={{ height: `${(d.usd / max) * 100}%` }} data-tip={`${new Date(d.day).toLocaleDateString()} · ${usd(d.usd)} · ${d.n}`} />
          ))}
        </div>
      ) : (
        <div className="empty">No payouts yet.</div>
      )}

      <h3>Leaderboard</h3>
      <p className="note">Every wallet that has ever caught something. Sending your stock out changes nothing here: it counts what you caught. Walk more, climb.</p>
      {board?.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Walker</th>
              <th className="right">Catches</th>
              <th className="right">Walked</th>
              <th className="right">Caught</th>
            </tr>
          </thead>
          <tbody>
            {board.map((b) => (
              <tr key={b.wallet}>
                <td className="num">{b.rank}</td>
                <td className="mono">{b.walker}</td>
                <td className="right num">{b.catches}</td>
                <td className="right num">{b.walkedKm.toFixed(1)} km</td>
                <td className="right num green">{usd(b.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty">Nobody yet. The first one on the street takes it.</div>
      )}

      {s?.topCities.length ? (
        <>
          <h3>Cities</h3>
          <p className="note">Counted in coarse areas. We never store where one person was.</p>
          <table className="table">
            <tbody>
              {s.topCities.map((c) => (
                <tr key={c.city}>
                  <td>{c.city}</td>
                  <td className="right num">{c.n} catches</td>
                  <td className="right num">{usd(c.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </Sheet>
  );
}
