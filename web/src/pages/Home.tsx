import { StreetBackdrop } from "../components/StreetBackdrop.tsx";
import { Ticker } from "../components/Ticker.tsx";
import { getJson, type Stats } from "../lib/api.ts";
import { href, usePoll } from "../lib/hooks.ts";
import { count, usd } from "../lib/format.ts";
import { STREET, CATCH, SPLIT } from "../../../shared/rules.ts";

export function Home() {
  const { data: s } = usePoll(() => getJson<Stats>("/stats"), 60_000);

  const cells: [string, string, boolean?][] = [
    ["given away, all time", s ? usd(s.givenUsd, 0) : "—", true],
    ["today", s ? usd(s.todayUsd, 0) : "—"],
    ["ready to catch", s ? usd(s.readyUsd, 0) : "—"],
    ["drops payable", s ? count(s.dropsPayable) : "—"],
    ["walkers", s ? count(s.walkers) : "—"],
    ["cities", s ? count(s.cities) : "—"],
  ];

  return (
    <main className="page">
      <section className="hero">
        <StreetBackdrop />
        <div className="hero-inner">
          <span className="eyebrow">
            <span className="pulse" /> {s?.live === false ? "demo · vault not live yet" : "live on Robinhood Chain"}
          </span>
          <h1>
            Stocks are lying
            <br />
            on the <em>street.</em>
          </h1>
          <p className="lede">
            Real fragments of Nvidia, Tesla and Apple drop on the map around you. Walk there, tap, and the stock lands in your own wallet.
          </p>
          <p className="free">Free to play, nothing to buy, ever.</p>
          <div className="ctas">
            <a className="btn btn-green" href={href("map")}>
              Open the map
            </a>
            <a className="btn btn-ghost" href={href("how")}>
              How it works
            </a>
          </div>
          <div className="chain">
            <i>⛓</i> Real ERC-20 stock tokens, paid from a public vault on Robinhood Chain
          </div>
        </div>
      </section>

      <div className="stats-strip">
        {cells.map(([label, value, hi]) => (
          <div className="stat" key={label}>
            <div className="label">{label}</div>
            <div className={`value ${hi ? "green" : ""}`}>{value}</div>
          </div>
        ))}
      </div>
      <div className="strip-foot">
        <span>{s ? `${count(s.catches)} catches, ${s.walkedKm.toFixed(1)} km walked to get them` : "Counting what is on the map…"}</span>
        <a href={href("stats")}>All the numbers →</a>
      </div>

      <Ticker />

      <section className="section">
        <span className="eyebrow">how it works</span>
        <h2>Three steps. That is the whole game.</h2>
        <p>No purchase, no subscription, no in-app currency. You walk, you catch, you keep it.</p>
        <div className="steps">
          <div className="step">
            <div className="n">01</div>
            <h3>Open the map</h3>
            <p>Sign in with Google, X or a wallet. A wallet is made for you. No app store, no seed phrase, no crypto homework.</p>
          </div>
          <div className="step">
            <div className="n">02</div>
            <h3>Walk to the tag</h3>
            <p>
              One stock at a time drops {STREET.ringMinM} to {STREET.ringM} m from wherever you are: any street, any city on earth. Walk to
              within {CATCH.radiusM} m of it.
            </p>
          </div>
          <div className="step">
            <div className="n">03</div>
            <h3>Tap. Own a company.</h3>
            <p>The fragment moves out of the public vault and into your wallet. A real stock token on Robinhood Chain, in seconds, free.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <span className="eyebrow">where the stock comes from</span>
        <h2>Two public contracts and one published rule.</h2>
        <p>
          Every creator fee from the $WALK token is split the same way on-chain: {SPLIT.map}% to the map, {SPLIT.burn}% to buy back and
          burn, {SPLIT.team}% to the team. The map share buys stock into the vault before it ever appears on the street.
        </p>
        <a className="btn btn-ghost" href={href("proof")} style={{ marginTop: 12 }}>
          See the proof
        </a>
      </section>

      <footer className="footer">
        Streetstock is a game and is not affiliated with Robinhood. Stock tokens on Robinhood Chain are issued by their issuer, not by us; they are not offered to US persons and may not be
        available in your region. Prices move; the walk is the only thing we guarantee. Map data © OpenStreetMap contributors, tiles by
        OpenFreeMap.
      </footer>
    </main>
  );
}
