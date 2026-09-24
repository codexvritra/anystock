/**
 * Schedule the weekly legendary.
 *
 *   npm run legendary -w server -- --city Tbilisi --spot "Freedom Square, by the statue" \
 *     --lat 41.6934 --lng 44.8015 --sym NVDA --code K7X2 --at 2026-10-03T15:00:00Z
 *
 * The code is printed nowhere else and stored only as an HMAC. Print it, stick it to the spot.
 */
import { parseArgs } from "node:util";
import { STOCKS, type StockSym } from "../../../shared/rules.ts";
import { createLegendary } from "../legendary.ts";

const { values } = parseArgs({
  options: {
    city: { type: "string" },
    spot: { type: "string" },
    lat: { type: "string" },
    lng: { type: "string" },
    sym: { type: "string", default: "NVDA" },
    code: { type: "string" },
    at: { type: "string" },
  },
});

const need = ["city", "spot", "lat", "lng", "code", "at"] as const;
for (const k of need) if (!values[k]) throw new Error(`--${k} is required`);
if (!STOCKS.some((s) => s.sym === values.sym)) throw new Error(`--sym must be one of ${STOCKS.map((s) => s.sym).join(", ")}`);

const id = createLegendary({
  city: values.city!,
  spot: values.spot!,
  lat: Number(values.lat),
  lng: Number(values.lng),
  code: values.code!,
  sym: values.sym as StockSym,
  startsAt: Date.parse(values.at!),
});
console.log(`legendary ${id} scheduled for ${new Date(Date.parse(values.at!)).toISOString()} at ${values.spot}, ${values.city}`);
process.exit(0);
