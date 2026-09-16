/**
 * Refuse to run against anything not obviously a test database.
 *
 * The suite drops the public schema before migrating. Aimed at a development
 * database that is irreversible data loss, and the mistake is one stale
 * environment variable away.
 */
export function assertTestDatabase(url) {
  const name = url.split("?")[0].split("/").pop() ?? "";
  if (!name.toLowerCase().includes("test")) {
    throw new Error(
      `${JSON.stringify(name)} does not look like a test database. ` +
        "Point DATABASE_URL at one whose name contains 'test'.",
    );
  }
}

export function testConnectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  assertTestDatabase(url);
  return url;
}
