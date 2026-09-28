import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  // Was 500ms, which closed a connection almost as soon as a request finished,
  // so nearly every burst paid a fresh TCP + TLS + auth handshake to Supabase
  // over the public internet. 30s keeps warm connections across ordinary gaps
  // between requests; `max` still bounds what is held against the pooler.
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("[db] Idle client error:", err.message);
});

/**
 * The same pool the ORM uses, exported so /health can report saturation while a
 * load test runs. Read-only use — nothing should acquire clients from it
 * directly; go through `db`.
 */
export const dbPool = pool;

export const db = drizzle(pool, { schema });
