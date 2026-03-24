import pg from "pg";
import dotenv from "dotenv";
import { sqliteAdapter } from "./sqlite-fallback.js";

dotenv.config();

const USE_SQLITE = process.env.DB_MODE === "sqlite" || !process.env.DATABASE_URL;

let db: {
  query: (text: string, params?: any[]) => any;
  getClient: () => any;
  pool: { end: () => any };
};

if (USE_SQLITE) {
  console.log("[DB] Using SQLite (development mode)");
  db = sqliteAdapter as any;
} else {
  console.log("[DB] Using PostgreSQL");
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on("error", (err) => {
    console.error("[DB] Unexpected error on idle client:", err);
  });

  db = {
    query: (text: string, params?: any[]) => pool.query(text, params),
    getClient: () => pool.connect(),
    pool,
  };
}

export { db };
