// Manual end-to-end smoke: run against a TEST_MODE server.  BASE=http://localhost:8799 npx tsx test/e2e.smoke.ts
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { destination } from "../../shared/geo.ts";

const BASE = process.env.BASE ?? "http://localhost:8799";
let cookie = "";
async function api(path: string, body?: unknown): Promise<any> {
  const r = await fetch(`${BASE}/api/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", cookie, origin: "http://localhost:5173" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const j: any = await r.json();
  return { status: r.status, ...j };
}

const acct = privateKeyToAccount(generatePrivateKey());
const { nonce, chainId, domain } = await api("/auth/nonce");
const message = createSiweMessage({ address: acct.address, chainId, domain, nonce, uri: "http://localhost:5173", version: "1", statement: "Sign in to Streetstock." });
console.log("verify:", (await api("/auth/verify", { message, signature: await acct.signMessage({ message }) })).ok);

const home = { lat: 41.6934, lng: 44.8015 };
const pos = await api("/position", { ...home, accuracy: 8, device_id: "device-e2e-0001" });
const mine = pos.drops.find((d: any) => d.mine);
console.log("my drop:", mine?.sym, mine?.rarity, `$${mine?.usd}`, `${Math.round(mine?.meters)} m`);

const fix0 = { lat: mine.lat, lng: mine.lng };
// "walk" to it: a believable log arriving at the drop
const log = Array.from({ length: 5 }, (_, i) => {
  const p = destination(mine, (4 - i) * 3, 200);
  return { ...p, lat: p.lat + i * 1e-7, accuracy: 7 + i, ts: Date.now() - (4 - i) * 6000 };
});
// walk from home to the drop at ~7 m/s (the server timestamps each report itself)
const fix = log[log.length - 1];
for (let k = 1; k <= 5; k++) {
  await new Promise((r) => setTimeout(r, 1500));
  const f = k / 5;
  await api("/position", { lat: home.lat + (fix0.lat - home.lat) * f, lng: home.lng + (fix0.lng - home.lng) * f, accuracy: 8, device_id: "device-e2e-0001" });
}
const c = await api("/claim", { spawn_id: mine.id, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, gps_log: log, motion: [{x:0,y:9.7,z:.2},{x:.3,y:9.9,z:-.1}], device_id: "device-e2e-0001", client_time: new Date().toISOString() });
console.log("claim:", c.status, c.state ?? c.error);
if (c.catch_id) {
  for (let i = 0; i < 10; i++) { const s = await api(`/catch/${c.catch_id}`); if (s.state !== "sending") { console.log("landed:", s.state, s.tokens, s.sym, `$${s.usd}`, `walk ${Math.round(s.walkM)} m`); break; } await new Promise(r => setTimeout(r, 700)); }
}
const again = await api("/claim", { spawn_id: mine.id, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, gps_log: log, motion: [], device_id: "device-e2e-0001", client_time: new Date().toISOString() });
console.log("double-claim:", again.status, again.error);
const st = await api("/stats"); console.log("stats:", { given: st.givenUsd, walkers: st.walkers, cities: st.cities, ready: Math.round(st.readyUsd) });
console.log("feed:", ((await fetch(`${BASE}/api/v1/claims`).then((r) => r.json())) as any[])[0]);
console.log("me:", (await api("/me")).catchesToday, "today");
