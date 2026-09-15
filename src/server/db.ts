import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// max: 1 because a serverless function should not hold a pool, and
// prepare: false because Neon's pooled endpoint runs PgBouncer in transaction
// mode, which rejects prepared statements.
export const sql = postgres(connectionString, { max: 1, prepare: false });

export const db = drizzle(sql);
