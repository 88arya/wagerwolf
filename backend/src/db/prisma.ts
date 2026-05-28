import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

// max:1 serializes queries through a single connection, preventing the
// unnamed prepared-statement conflict on the local PGlite dev server.
const pool = new Pool({ connectionString: process.env.DATABASE_DIRECT_URL, max: 1 });
export const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
