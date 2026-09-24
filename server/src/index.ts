import { config } from "./config.ts";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { HttpError } from "./auth.ts";
import { routes } from "./routes.ts";
import { startPayoutWorker } from "./payouts.ts";
import { startKeeper } from "./keeper.ts";
import { refreshMarket } from "./market.ts";

const app = Fastify({
  logger: { level: config.isProd ? "info" : "warn" },
  trustProxy: config.TRUST_PROXY === "1",
  bodyLimit: 64 * 1024,
});

await app.register(cookie);
await app.register(cors, { origin: config.PUBLIC_ORIGIN, credentials: true });
await app.register(rateLimit, { global: true, max: 240, timeWindow: "1 minute" });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof HttpError) return reply.status(err.status).send({ ok: false, error: err.message, code: err.code });
  if (err instanceof ZodError) return reply.status(400).send({ ok: false, error: "Bad request.", code: "validation" });
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  if (status >= 500) app.log.error(err);
  return reply.status(status).send({ ok: false, error: status === 429 ? "Slow down a little." : status >= 500 ? "Something broke on our side." : (err as Error).message });
});

await app.register(routes, { prefix: "/api/v1" });

// in production the API also serves the built web app
const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api/") ? reply.status(404).send({ ok: false, error: "Not found." }) : reply.sendFile("index.html"),
  );
}

await refreshMarket();
const stopPayouts = startPayoutWorker();
const stopKeeper = startKeeper();

const shutdown = async (signal: string) => {
  console.log(`\n[server] ${signal}, shutting down`);
  stopPayouts();
  stopKeeper();
  await app.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.PORT, host: config.HOST });
console.log(
  `[server] http://localhost:${config.PORT}  chain ${config.CHAIN_ID}  ${config.live ? "LIVE: paying on Robinhood Chain" : "DEMO: nothing moves on chain"}${config.testMode ? "  (test mode rules)" : ""}`,
);
