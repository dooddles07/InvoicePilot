import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { getSql } from "./db/index.js";
import { applyMigrations } from "./db/migrate.js";

/**
 * Migrations run before listen(), not as a deploy hook: Render's free plan has
 * none. The _migrations table makes it idempotent, and a free plan runs one
 * instance, so nothing races.
 */
const config = loadConfig();

const applied = await applyMigrations(config.databaseUrl);
console.log(
  applied.length ? `applied: ${applied.join(", ")}` : "schema up to date",
);

createApp(config, getSql(config.databaseUrl)).listen(config.port, () => {
  console.log(`listening on ${config.port} (${config.environment})`);
});
