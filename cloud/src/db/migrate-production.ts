/**
 * Production Migration Runner
 *
 * Run against a real PostgreSQL database.
 * Usage: DATABASE_URL=postgresql://... npx tsx src/db/migrate-production.ts
 */

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

const MIGRATIONS = [
  {
    name: "001_create_users",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        profession VARCHAR(50) NOT NULL DEFAULT 'other',
        firm VARCHAR(255),
        phone VARCHAR(20),
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        tier VARCHAR(20) NOT NULL DEFAULT 'free',
        last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
    `,
  },
  {
    name: "002_create_subscriptions",
    sql: `
      CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tier VARCHAR(20) NOT NULL,
        billing_cycle VARCHAR(10) NOT NULL,
        amount INTEGER NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'INR',
        status VARCHAR(20) NOT NULL DEFAULT 'pending_payment',
        payment_id VARCHAR(255),
        start_date TIMESTAMPTZ NOT NULL,
        end_date TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
    `,
  },
  {
    name: "003_create_usage_logs",
    sql: `
      CREATE TABLE IF NOT EXISTS usage_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_logs(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_usage_type ON usage_logs(type);
    `,
  },
  {
    name: "004_create_audit_logs",
    sql: `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action VARCHAR(100) NOT NULL,
        user_id UUID NOT NULL,
        tenant_id UUID,
        resource_type VARCHAR(100),
        resource_id VARCHAR(255),
        metadata JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        outcome VARCHAR(20) NOT NULL DEFAULT 'success',
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    `,
  },
  {
    name: "005_create_api_keys",
    sql: `
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        key_hash VARCHAR(255) NOT NULL,
        key_prefix VARCHAR(10) NOT NULL,
        permissions JSONB NOT NULL DEFAULT '[]',
        rate_limit INTEGER DEFAULT 100,
        last_used_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
    `,
  },
  {
    name: "006_create_tariff_data",
    sql: `
      CREATE TABLE IF NOT EXISTS tariff_data (
        id SERIAL PRIMARY KEY,
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tariff_item ON tariff_data(tariff_item);
      CREATE INDEX IF NOT EXISTS idx_tariff_desc ON tariff_data USING gin(to_tsvector('english', description));
      CREATE INDEX IF NOT EXISTS idx_tariff_year ON tariff_data(year);
    `,
  },
];

async function runMigrations() {
  console.log("[Jarvis DB] Running production migrations...");
  console.log(`[Jarvis DB] Database: ${DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  for (const migration of MIGRATIONS) {
    const result = await pool.query(
      "SELECT name FROM migrations WHERE name = $1",
      [migration.name],
    );

    if (result.rows.length === 0) {
      console.log(`  Applying: ${migration.name}`);
      await pool.query(migration.sql);
      await pool.query("INSERT INTO migrations (name) VALUES ($1)", [migration.name]);
      console.log(`  Applied: ${migration.name}`);
    } else {
      console.log(`  Skipped: ${migration.name} (already applied)`);
    }
  }

  console.log("[Jarvis DB] All migrations complete.");
  await pool.end();
}

runMigrations().catch((err) => {
  console.error("[Jarvis DB] Migration failed:", err);
  process.exit(1);
});
