import { useState } from "react";
import { Popup, Sec } from "../components/Popup.tsx";
import { ApiError, getJson, postJson, waitForCatch, type BoardRow, type LegendaryView, type Proof, type Stats, type Vault } from "../lib/api.ts";
import { go, href, useNow, usePoll } from "../lib/hooks.ts";
import { ago, count, short, tokens, until, usd } from "../lib/format.ts";
import { deviceId, readLocation, readyToClaim, startLocation, useLocation } from "../lib/gps.ts";
import { useSession } from "../lib/session.tsx";
import { CATCH, DROP, LEGENDARY, RULES_TABLE, SPLIT, STOCKS, STREET, TOKEN } from "../../../shared/rules.ts";
import { distanceM, formatDistance } from "../../../shared/geo.ts";

const close = () => go("home");

// ─────────────────────────── how it works ───────────────────────────

export function HowItWorks() {
  const { data: v } = usePoll(() => getJson<Vault>("/vault"), 60_000);
  return (
    <Popup
      onClose={close}
      eyebrow="how it works"
      title="Three steps. That is the whole game."
      lede="No purchase, no subscription, no in-app currency. You walk, you catch, you keep it."
    >
      <Sec>
        <div className="steps">
          {[
            ["01", "Open the map", "Sign in with Google, X or a wallet. A wallet is made for you. No app store, no seed phrase, no crypto homework."],
            [
              "02",
              "Walk to the tag",
              `One stock at a time drops ${STREET.ringMinM} to ${STREET.ringM} m from wherever you are: any street, any city on earth. Walk to within ${CATCH.radiusM} m of it.`,
            ],
            ["03", "Tap. Own a company.", "The fragment moves out of the public vault and into your wallet on Robinhood Chain. Real stock, seconds, free."],
          ].map(([n, t, b]) => (
            <div className="step" key={n}>
              <div className="step-num">{n}</div>
              <h4 className="step-title">{t}</h4>
              <p className="step-body">{b}</p>
            </div>
          ))}
        </div>
      </Sec>

      <Sec title="What is on the map" note="Real ERC-20 stock tokens on Robinhood Chain, held by the vault before they appear.">
        <div className="stocks">
          {STOCKS.map((s) => {
            const h = v?.holdings.find((x) => x.sym === s.sym);
            const on = s.phase === "launch";
            return (
              <div className="stock" key={s.sym}>
                <div className="stock-top">
                  <span className="sym">{s.sym}</span>
                  <span className={`pill ${on ? "live" : ""}`}>{on ? "on the map" : "week 3"}</span>
                </div>
                <div className="stock-line num">
                  {h ? usd(h.priceUsd) : "—"} <span className="stock-fine">a share</span>
                </div>
                <div className="stock-fine">{s.name}</div>
              </div>
            );
          })}
        </div>
      </Sec>

      <Sec title="The rules" note="Six of them. None of them bend.">
        <div className="box">
          <dl className="rows">
            {RULES_TABLE.map(([k, val]) => (
              <div className="row" key={k}>
                <dt>{k}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Sec>

      <Sec title="Why spoofing does not pay" note="The server checks the shape of your GPS log, not just the number.">
        <div className="box">
          <dl className="rows">
            <div className="row">
              <dt>The walk</dt>
              <dd>Keep the map open while you walk. Your trail must move at walking speed; teleports and cars are refused.</dd>
            </div>
            <div className="row">
              <dt>The phone</dt>
              <dd>A real phone jitters and its accelerometer twitches. Perfect coordinates and a perfectly still device look like an emulator.</dd>
            </div>
            <div className="row">
              <dt>The limits</dt>
              <dd>Per wallet, per phone, per network and per {CATCH.squareM} m square, every day. Farming is slower than walking.</dd>
            </div>
            <div className="row">
              <dt>The vault</dt>
              <dd>Even if everything else failed, the vault contract caps what it pays per catch and per day, on-chain.</dd>
            </div>
          </dl>
        </div>
      </Sec>
      <div className="foot">
        <a className="btn sm" href={href("map")}>
          Open the map
        </a>
        <a className="btn sm ghost" href={href("soon")}>
          Coming soon
        </a>
        <span className="foot-note">If a catch fails, the drop stays on the map and nothing is spent.</span>
      </div>
    </Popup>
  );
}

// ─────────────────────────── proof ───────────────────────────

export function ProofPopup() {
  const { data: p } = usePoll(() => getJson<Proof>("/proof"), 60_000);
  const { data: v } = usePoll(() => getJson<Vault>("/vault"), 60_000);
  const now = useNow(30_000);
  const addrs: [string, string, Proof["addresses"]["vault"] | undefined][] = [
    ["Drop vault", "receives the map share, buys the stock, holds it and pays every catch", p?.addresses.vault],
    ["Fee splitter", `splits every creator fee ${SPLIT.map} / ${SPLIT.burn} / ${SPLIT.team}; immutable, anyone can trigger it`, p?.addresses.splitter],
    [`${TOKEN.symbol} token`, "fixed supply, no mint function, no owner", p?.addresses.token],
  ];

  return (
    <Popup
      onClose={close}
      color="var(--t-cyan)"
      wide
      eyebrow="proof"
      title="Two public contracts and one published rule."
      lede="Every fee is split the same way, every burn is a transaction, and every stock on the map was bought into the vault before it appeared. Read it straight off Robinhood Chain."
    >
      <Sec>
        <div className="tiles">
          <div className="tile">
            <span className="num tile-v g">{v ? usd(v.reserveUsd, 0) : "—"}</span>
            <span className="tile-l">in the vault</span>
          </div>
          <div className="tile">
            <span className="num tile-v">{p?.splitter ? `${Number(p.splitter.toMapEth).toFixed(3)} ETH` : "—"}</span>
            <span className="tile-l">to the map</span>
          </div>
          <div className="tile">
            <span className="num tile-v">{p?.splitter ? count(Math.round(Number(p.splitter.walkBurned))) : "—"}</span>
            <span className="tile-l">{TOKEN.symbol} burned</span>
          </div>
          <div className="tile">
            <span className="num tile-v">{p ? (p.live ? "live" : "demo") : "—"}</span>
            <span className="tile-l">vault status</span>
          </div>
        </div>
      </Sec>

      <Sec title="The split" note="Hard-coded in FeeSplitter. Nobody can change it, including us.">
        <div className="bars">
          {(
            [
              ["map", SPLIT.map, "buys stock into the vault"],
              ["burn", SPLIT.burn, `buys ${TOKEN.symbol} and sends it to 0x…dEaD`],
              ["team", SPLIT.team, "keeps the lights on"],
            ] as const
          ).map(([k, pct, why]) => (
            <div className="bar" key={k}>
              <span className="bar-name">
                {k} {pct}%
              </span>
              <span className="bar-track">
                <span className="bar-fill" style={{ display: "block", width: `${pct}%` }} />
              </span>
              <span className="bar-num">{why}</span>
            </div>
          ))}
        </div>
      </Sec>

      <Sec title="The addresses" note="All created for this project and used for nothing else. If an address is not on this list, it is not ours.">
        <div className="box">
          <dl className="rows">
            {addrs.map(([what, why, a]) => (
              <div className="row" key={what}>
                <dt>{what}</dt>
                <dd>
                  {why}
                  <br />
                  {a ? (
                    <a className="addr-mono" href={a.url} target="_blank" rel="noreferrer">
                      {a.address} ↗
                    </a>
                  ) : (
                    <span className="muted">not deployed yet</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Sec>

      <Sec title="In the vault" note="A drop only appears where the vault can pay it. These are the payable counts.">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Stock</th>
                <th className="right">Price</th>
                <th className="right">Held</th>
                <th className="right">Worth</th>
                <th className="right">Drops payable</th>
              </tr>
            </thead>
            <tbody>
              {(v?.holdings ?? []).map((h) => (
                <tr key={h.sym}>
                  <td>
                    <span className="sym">{h.sym}</span> <span className="muted">{h.name}</span>
                  </td>
                  <td className="right num">{usd(h.priceUsd)}</td>
                  <td className="right num">{tokens(h.tokens)}</td>
                  <td className="right num">{usd(h.usd, 0)}</td>
                  <td className="right num ok">{count(h.dropsPayable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sec>

      <Sec title="Payouts" note="Every one of these is a transfer on the chain. The transaction is the receipt.">
        {p?.payouts.length ? (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {p.payouts.map((x) => (
                  <tr key={x.tx + x.at}>
                    <td className="mono">{x.walker}</td>
                    <td>
                      {tokens(x.tokens)} <span className="sym">{x.sym}</span>
                    </td>
                    <td className="right num ok">{usd(x.usd)}</td>
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
          </div>
        ) : (
          <div className="hint">{p?.live === false ? "Demo mode: the vault is not live yet, so there are no on-chain payouts to show." : "No payouts yet."}</div>
        )}
      </Sec>
    </Popup>
  );
}

// ─────────────────────────── legendary ───────────────────────────

export function LegendaryPopup() {
  const { data, reload } = usePoll(() => getJson<LegendaryView>("/legendary"), 30_000);
  const now = useNow(1000);
  const loc = useLocation();
  const { wallet, openSheet } = useSession();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const n = data?.next;
  const ready = readyToClaim(loc);

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
  const dist = n?.lat != null && n.lng != null && loc.fix ? distanceM(loc.fix, { lat: n.lat, lng: n.lng }) : null;

  return (
    <Popup
      onClose={close}
      color="var(--r-legend)"
      eyebrow="legendary"
      title="A whole share. One spot. One code."
      lede="Once a week a whole share is put down at one spot in the featured city. First person to stand there and type the code takes it home."
    >
      <Sec>
        {n ? (
          <div className="prize">
            <div>
              <span className="pill" style={{ color: "var(--r-legend)" }}>
                {n.open ? "open now" : n.announced ? "announced" : "next one"}
              </span>
              <div className="num prize-big" style={{ marginTop: 6 }}>
                1 {n.sym} · ~{usd(n.usd, 0)}
              </div>
              <p className="prize-where">{n.announced ? `${n.spot}, ${n.city}` : `City and spot announced ${LEGENDARY.announceHoursAhead} h before.`}</p>
            </div>
            <div>
              <span className="tile-l">{n.open ? "closes in" : "opens in"}</span>
              <div className="num prize-big" style={{ color: "var(--ink)" }}>
                {until(n.open ? n.endsAt : n.startsAt, now)}
              </div>
              {n.open && (
                <div style={{ marginTop: 8 }}>
                  {!wallet ? (
                    <button type="button" className="btn sm wide" onClick={openSheet}>
                      Sign in to claim
                    </button>
                  ) : !loc.fix ? (
                    <button type="button" className="btn sm lime wide" onClick={() => void startLocation()}>
                      Turn on location
                    </button>
                  ) : (
                    <>
                      {dist !== null && (
                        <p className="muted" style={{ margin: 0, fontSize: 11 }}>
                          {dist <= LEGENDARY.radiusM ? "You are on the spot." : `${formatDistance(dist)} from the spot. Radius ${LEGENDARY.radiusM} m.`}
                        </p>
                      )}
                      <input
                        className="code-input"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 16))}
                        placeholder="CODE"
                        aria-label="The code on the spot"
                        autoComplete="off"
                      />
                      <button type="button" className="btn sm wide" disabled={busy || code.length < 3 || !ready.ready} onClick={() => void claim()}>
                        {busy ? "Checking…" : ready.ready ? "Claim the share" : ready.why}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="hint gold">The next legendary has not been placed yet. It is announced a day ahead.</div>
        )}
        {msg && <div className={msg.ok ? "hint gold" : "problem"}>{msg.text}</div>}
      </Sec>

      <Sec title="How it stays fair">
        <div className="box">
          <dl className="rows">
            <div className="row">
              <dt>Announced a day ahead</dt>
              <dd>City and spot, {LEGENDARY.announceHoursAhead} hours before. Enough time to get there. Not enough time to fake it.</dd>
            </div>
            <div className="row">
              <dt>A code, stuck to the spot</dt>
              <dd>A short code is physically at the place. You type it in. GPS spoofing gets nothing because the code is not on the internet.</dd>
            </div>
            <div className="row">
              <dt>Tight and short</dt>
              <dd>
                The window is {LEGENDARY.windowMin} minutes. The catch radius is {LEGENDARY.radiusM} m, not the usual {CATCH.radiusM}. You have to be
                standing there.
              </dd>
            </div>
            <div className="row">
              <dt>One winner</dt>
              <dd>The first valid claim takes it. The winner slot is written before the payout is sent, so two people cannot both win.</dd>
            </div>
          </dl>
        </div>
      </Sec>

      <Sec title="Past winners" note="Every one of these is a transfer on the chain.">
        {data?.past.length ? (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {data.past.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="sym">{p.city}</span> <span className="muted">{p.spot}</span>
                    </td>
                    <td className="sym">{p.sym}</td>
                    <td className="mono">{p.winner ? short(p.winner) : <span className="muted">nobody made it</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="hint">Nothing caught yet. The first one on the street takes it.</div>
        )}
      </Sec>
    </Popup>
  );
}

// ─────────────────────────── coming soon ───────────────────────────

export function ComingSoon() {
  const items: [string, string, string][] = [
    ["week 3", "Amazon and Meta on the map", "Two more companies join Nvidia, Tesla and Apple once the vault holds a week of reserve for them."],
    ["next", `Boosts for ${TOKEN.symbol} holders`, "Hold for 7 days and your wait between catches drops: Bronze 40 min, Silver 35 min and +1 a day, Gold 30 min and +2 a day."],
    ["next", "Sponsored drops", "A brand funds drops around its door. The walk still has to be real; the stock still comes from the vault."],
    ["next", "The app", "The map stays awake while you walk, and your drop arrives as a notification. Until then, the site plays the same game."],
    ["later", "Streaks", "Walk three days in a row and the fourth brings a guaranteed rare."],
  ];
  return (
    <Popup onClose={close} color="var(--t-violet)" eyebrow="coming soon" title="What lands next." lede="In the order we expect to ship it. Nothing here costs you anything either.">
      <div className="steps">
        {items.map(([when, t, b]) => (
          <div className="step" key={t}>
            <div className="step-num">{when}</div>
            <h4 className="step-title">{t}</h4>
            <p className="step-body">{b}</p>
          </div>
        ))}
      </div>
    </Popup>
  );
}

// ─────────────────────────── stats ───────────────────────────

export function StatsPopup() {
  const { data: s } = usePoll(() => getJson<Stats>("/stats"), 60_000);
  const { data: board } = usePoll(() => getJson<BoardRow[]>("/board"), 60_000);
  const max = Math.max(0.01, ...(s?.days.map((d) => d.usd) ?? [0]));
  const maxCity = Math.max(1, ...(s?.topCities.map((c) => c.n) ?? [1]));
  const [first, second, third] = board ?? [];
  const avg = ((DROP.normalUsd[0] + DROP.normalUsd[1]) / 2).toFixed(2);

  return (
    <Popup
      onClose={close}
      color="var(--accent-2)"
      wide
      eyebrow="stats"
      title="All the numbers."
      lede="Read straight off the chain, or counted from rows that reference a transaction. Live, refreshed every minute."
    >
      <Sec>
        <div className="tiles">
          {(
            [
              ["given away", s ? usd(s.givenUsd) : "—", true],
              ["today", s ? usd(s.todayUsd) : "—"],
              ["ready to catch", s ? usd(s.readyUsd, 0) : "—"],
              ["drops payable", s ? count(s.dropsPayable) : "—"],
              ["on the map now", s ? count(s.onMap) : "—"],
              ["walkers", s ? count(s.walkers) : "—"],
              ["cities", s ? count(s.cities) : "—"],
              ["walked", s ? `${s.walkedKm.toFixed(1)} km` : "—"],
              ["median tap → wallet", s?.medianLandMs ? `${(s.medianLandMs / 1000).toFixed(1)} s` : "—"],
              ["typical drop", `$${avg}`],
            ] as [string, string, boolean?][]
          ).map(([k, v, g]) => (
            <div className="tile" key={k}>
              <span className={`num tile-v ${g ? "g" : ""}`}>{v}</span>
              <span className="tile-l">{k}</span>
            </div>
          ))}
        </div>
      </Sec>

      <Sec title="Payouts received over the last 14 days">
        {s?.days.length ? (
          <div className="chart">
            {s.days.map((d) => (
              <div className="bar-col" key={d.day} title={`${usd(d.usd)} · ${d.n} catches`}>
                <div className="bar-col-track">
                  <div className="bar-col-fill" style={{ height: `${(d.usd / max) * 100}%` }} />
                </div>
                <span className="bar-col-day">{new Date(d.day).getUTCDate()}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="hint">No payouts yet.</div>
        )}
      </Sec>

      <Sec
        title="Leaderboard"
        note="Every wallet that has ever caught something, counted from what was caught. Sending your stock out changes nothing here. Walk more, climb."
      >
        {board?.length ? (
          <>
            <div className="podium">
              {[second, first, third].map((b, i) => (
                <div key={i} className={`pstep ${["second", "first", "third"][i]} ${b ? "" : "blank"}`}>
                  <span className="medal">{["🥈", "🥇", "🥉"][i]}</span>
                  <span className="pwho">{b?.walker ?? "—"}</span>
                  <span className="num pamt">{b ? usd(b.usd) : ""}</span>
                  <span className="ptimes">{b ? `${b.catches} catches` : ""}</span>
                </div>
              ))}
            </div>
            <div className="table-wrap">
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
                      <td className="right num ok">{usd(b.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="hint">Nobody yet. The first one on the street takes it.</div>
        )}
      </Sec>

      {s?.topCities.length ? (
        <Sec title="Cities" note="Counted in coarse areas. We never store where one person was.">
          <div className="bars">
            {s.topCities.map((c) => (
              <div className="bar" key={c.city}>
                <span className="bar-name">{c.city}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ display: "block", width: `${(c.n / maxCity) * 100}%` }} />
                </span>
                <span className="bar-num">
                  {c.n} · {usd(c.usd)}
                </span>
              </div>
            ))}
          </div>
        </Sec>
      ) : null}
    </Popup>
  );
}
