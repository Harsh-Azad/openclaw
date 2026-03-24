import { db } from "./connection.js";

const migrations = [
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
        last_login TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP
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
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP
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
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
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
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
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
        last_used_at TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
    `,
  },
  {
    name: "006_create_migrations",
    sql: `
      CREATE TABLE IF NOT EXISTS migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `,
  },
];

async function migrate() {
  console.log("[Jarvis DB] Running migrations...");

  try {
    // Ensure migrations table exists first
    await db.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    for (const migration of migrations) {
      const result = await db.query(
        "SELECT name FROM migrations WHERE name = $1",
        [migration.name],
      );

      if (result.rows.length === 0) {
        console.log(`  Applying: ${migration.name}`);
        await db.query(migration.sql);
        await db.query("INSERT INTO migrations (name) VALUES ($1)", [
          migration.name,
        ]);
        console.log(`  Applied: ${migration.name}`);
      } else {
        console.log(`  Skipped: ${migration.name} (already applied)`);
      }
    }

    console.log("[Jarvis DB] Migrations complete.");
  } catch (err) {
    console.error("[Jarvis DB] Migration failed:", err);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

migrate();
