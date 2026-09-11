import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 500,
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
