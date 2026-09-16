/**
 * Runtime configuration.
 *
 * Read through a function rather than at import time, so importing any module
 * loads no environment and touches no network -- a test, a CLI command or a
 * migration can import half the application without a full .env. Ported from
 * app/core/config.py, which cached the same thing behind get_settings().
 *
 * No secret has a default that would work in production. A missing SECRET_KEY
 * stops the process rather than falling back to something guessable.
 */
const SECRET_KEY_MIN_LENGTH = 32;

export function loadConfig(env = process.env) {
  const secretKey = env.SECRET_KEY;
  if (!secretKey) throw new Error("SECRET_KEY is not set");
  if (secretKey.length < SECRET_KEY_MIN_LENGTH) {
    throw new Error(
      `SECRET_KEY must be at least ${SECRET_KEY_MIN_LENGTH} characters`,
    );
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  return {
    environment: env.NODE_ENV ?? "local",
    port: Number(env.PORT ?? 3001),
    databaseUrl,
    secretKey,
  };
}
