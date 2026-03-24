/**
 * SQLite Fallback for Development
 *
 * When PostgreSQL is not available, this provides a compatible
 * interface using better-sqlite3. Enables local development
 * without any external dependencies.
 */

import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, "../../jarvis-dev.db");

let sqliteDb: Database.Database | null = null;

function getDb(): Database.Database {
  if (!sqliteDb) {
    sqliteDb = new Database(DB_PATH);
    sqliteDb.pragma("journal_mode = WAL");
    sqliteDb.pragma("foreign_keys = ON");
    initializeTables(sqliteDb);
  }
  return sqliteDb;
}

function initializeTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      profession TEXT NOT NULL DEFAULT 'other',
      firm TEXT,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      tier TEXT NOT NULL DEFAULT 'free',
      last_login TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tier TEXT NOT NULL,
      billing_cycle TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'pending_payment',
      payment_id TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS usage_logs (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      action TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tenant_id TEXT,
      resource_type TEXT,
      resource_id TEXT,
      metadata TEXT,
      ip_address TEXT,
      user_agent TEXT,
      outcome TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT '[]',
      rate_limit INTEGER DEFAULT 100,
      last_used_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tariff_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT,
      chapter TEXT,
      tariff_item TEXT,
      dash TEXT,
      description TEXT,
      unit TEXT,
      basic_rate TEXT,
      effective_rate TEXT,
      igst TEXT,
      sws TEXT,
      nccd TEXT,
      total_rate TEXT,
      import_policy TEXT,
      export_policy TEXT,
      year INTEGER DEFAULT 2026,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * PostgreSQL-compatible query interface for SQLite.
 * Maps $1, $2, ... placeholders to ? for SQLite.
 */
export const sqliteAdapter = {
  query: (text: string, params?: any[]) => {
    const db = getDb();
    const sqliteText = text.replace(/\$(\d+)/g, "?");
    // Remove PostgreSQL-specific functions
    const cleaned = sqliteText
      .replace(/gen_random_uuid\(\)/g, "lower(hex(randomblob(16)))")
      .replace(/NOW\(\)/g, "datetime('now')")
      .replace(/DATE\(created_at\)/g, "date(created_at)")
      .replace(/JSONB/g, "TEXT")
      .replace(/::text/g, "");

    try {
      if (
        cleaned.trim().toUpperCase().startsWith("SELECT") ||
        cleaned.trim().toUpperCase().startsWith("WITH")
      ) {
        const rows = db.prepare(cleaned).all(...(params || []));
        return { rows, rowCount: rows.length };
      } else {
        const result = db.prepare(cleaned).run(...(params || []));
        return { rows: [], rowCount: result.changes };
      }
    } catch (err) {
      console.error("[SQLite] Query error:", cleaned, params, err);
      return { rows: [], rowCount: 0 };
    }
  },
  getClient: () => {
    throw new Error("getClient not supported in SQLite mode");
  },
  pool: {
    end: () => {
      if (sqliteDb) {
        sqliteDb.close();
        sqliteDb = null;
      }
    },
  },
};

export function getSqliteDb(): Database.Database {
  return getDb();
}
