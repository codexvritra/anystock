# Streetstock

**Stocks are lying on the street.** A walk-to-earn map game on [Robinhood Chain](https://docs.robinhood.com/chain): fragments of real stock tokens (Nvidia, Tesla, Apple…) drop on the map around you. Walk there, tap, and the stock moves from a public vault into your wallet. Free to play; the house pays the gas.

Same concept as [stokn.fun](https://stokn.fun) (which runs on Solana with xStocks), rebuilt for Robinhood Chain's ERC-20 stock tokens and Chainlink feeds.

```
 creator fees (ETH) ──► FeeSplitter ──50%──► DropVault ──buyStock()──► NVDA / TSLA / AAPL tokens
                         (immutable) ──40%──► buy back $WALK ──► 0x…dEaD           │
                                     ──10%──► team                                 │ pay(dropId)
                                                                                   ▼
 phone GPS log ──► API: anti-cheat ──► catch row (sending) ──► payout worker ──► your wallet
```

## Layout

| Path | What |
|---|---|
| `contracts/` | Foundry. `DropVault` (capped keeper payouts, oracle-floored swaps), `FeeSplitter` (50/40/10, immutable), `WalkToken` (fixed supply). 20 tests incl. fuzzing. |
| `server/` | Fastify + `node:sqlite` + viem. SIWE auth, drop spawning, walk verification, payout worker, keeper, stats. |
| `web/` | Vite + React + MapLibre (OpenFreeMap tiles). Google/X sign-in via Privy (optional) or any browser wallet. |
| `shared/` | Game rules and geodesy, imported by both server and web so they can't drift. |

## The rules (same numbers as the original)

- One personal drop at a time, 300–500 m away (your very first one lands 40 m away). Drops live 20 min.
- Catch radius 60 m + half the GPS error, capped at 80 m. GPS must be ≤ 65 m, with ≥ 4 readings over ≥ 20 s.
- One catch per 45 min, 6 per day. One catch per wallet per drop; a drop goes quiet 10 min after a catch.
- Drops pay $0.50–$1.25; rare ×2, epic ×4. A drop only spawns if the vault can pay it.
- Weekly **Legendary**: one full share at one spot, announced 24 h ahead, 60-minute window, 25 m radius, and a code physically stuck to the spot.

### Anti-cheat, in layers

1. **Log shape**: walking pace between readings, the log agrees with the fix, no future timestamps, no clock skew, no synthetic logs (identical points and accuracy, sub-metre accuracy).
2. **Device**: accelerometer must show a hand-held phone.
3. **Server trail**: positions reported while the map is open must also be a walk. No teleports.
4. **Limits**: per wallet, device, network and 11 m square, per day.
5. **On-chain**: even with the server key stolen, `DropVault` caps each payout and each day's total per stock, pays each drop id once, and can be paused by the keeper or owner.

## Run it locally

```bash
npm install
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git --root contracts
cp server/.env.example server/.env   # set TEST_MODE=1 to play on a laptop
cp web/.env.example web/.env         # VITE_TEST_MODE=1 lets you tap the map to "walk"
npm run dev                          # api :8787, web :5173
npm test                             # server unit tests + forge tests
```

Without contracts configured the server runs in **demo mode**: the whole game works and catches are recorded, but nothing moves on chain and the UI says so.

## Going live on Robinhood Chain

1. Deploy (owner should be a multisig; keeper is the server's hot key):
   ```bash
   cd contracts
   OWNER=0x… KEEPER=0x… TEAM=0x… WETH=0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73 \
     forge script script/Deploy.s.sol --rpc-url robinhood --broadcast --verify
   ```
2. List each stock. Take the token address from the on-chain asset registry in [Robinhood's contract docs](https://docs.robinhood.com/chain/contracts) and the feed from [Chainlink's Robinhood page](https://docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood). Explorers show copycat tokens with the same ticker; `ListStock.s.sol` refuses anything without `uiMultiplier()`.
   ```bash
   DROP_VAULT=0x… STOCK=0x… STOCK_FEED=0x… MAX_PER_CATCH=… DAILY_CAP=… \
     forge script script/ListStock.s.sol --rpc-url robinhood --broadcast
   ```
3. `setSwapConfig` on the vault (Uniswap V3 router, ETH/USD feed, sequencer feed) and `setRouter` on the splitter.
4. Point the launchpad's creator fees at `FeeSplitter`.
5. Fill in `DROP_VAULT`, `FEE_SPLITTER`, `WALK_TOKEN`, `KEEPER_PRIVATE_KEY`, `STOCK_*` on the server and restart. The pill on the map turns from **demo** to **live**.

## Deployment

- **API → Railway** (`Dockerfile`, `railway.json`). Needs a volume mounted at `/data` for SQLite, and `NODE_ENV=production`, `SESSION_SECRET`, `PUBLIC_ORIGIN`, `TRUST_PROXY=1`, `LEGENDARY_PEPPER`.
- **Web → Vercel** (`vercel.json`). `/api/*` is rewritten to the Railway service, so the session cookie is first-party and SIWE's domain is the site's own.

Scheduling a legendary:

```bash
npm run legendary -w server -- --city Tbilisi --spot "Freedom Square, by the statue" \
  --lat 41.6934 --lng 44.8015 --sym NVDA --code K7X2 --at 2026-10-03T15:00:00Z
```

---

Not affiliated with Robinhood. Stock tokens are not offered to US persons and may not be available in your region.
