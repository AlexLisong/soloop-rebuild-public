import { openStore } from "./store.mjs";
import { createProvider, providerConfig } from "./provider.mjs";
import { createApp } from "./app.mjs";

const production = process.env.NODE_ENV === "production";
const store = openStore(process.env.SOLOOP_DB || ".data/soloop.db");
const provider = createProvider(providerConfig());
if (production && !provider.ready)
  throw new Error("Foundry credentials must be configured in production.");
const app = await createApp({
  store,
  provider,
  origin: process.env.APP_ORIGIN || "http://localhost:5173",
  secure: production,
  trustProxy: production,
});
app.server.listen(
  Number(process.env.SOLOOP_API_PORT || 8014),
  "127.0.0.1",
  () => console.log("Soloop API is ready."),
);
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    store.close();
    process.exit(0);
  });
