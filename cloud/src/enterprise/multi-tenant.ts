/**
 * Multi-Tenant Isolation
 *
 * Provides tenant-level data isolation for enterprise deployments.
 * Each firm (EY, PwC, etc.) gets its own tenant with:
 * - Separate data namespace in the database
 * - Tenant-scoped API keys
 * - Isolated RAG knowledge bases
 * - Separate audit logs
 * - Custom branding configuration
 */

import { Request, Response, NextFunction, Router } from "express";
import { db } from "../db/connection.js";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: "starter" | "professional" | "enterprise";
  status: "active" | "suspended" | "trial";
  settings: TenantSettings;
  createdAt: string;
  expiresAt?: string;
}

interface TenantSettings {
  maxUsers: number;
  maxStorageGB: number;
  allowedDomains: string[];
  branding: {
    name: string;
    logoUrl?: string;
    primaryColor: string;
    accentColor: string;
  };
  features: string[];
  llmConfig: {
    provider: string;
    model: string;
    maxTokensPerDay: number;
  };
}

const DEFAULT_SETTINGS: TenantSettings = {
  maxUsers: 50,
  maxStorageGB: 10,
  allowedDomains: [],
  branding: { name: "Jarvis", primaryColor: "#4f6ef7", accentColor: "#2dd4a8" },
  features: ["tax-chat", "compliance-calendar", "customs-tariff"],
  llmConfig: { provider: "openai", model: "gpt-4o", maxTokensPerDay: 100000 },
};

export async function initMultiTenantTables(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      plan TEXT DEFAULT 'starter',
      status TEXT DEFAULT 'trial',
      settings TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS tenant_users (
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, user_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS tenant_invites (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      invited_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      accepted_at DATETIME
    )
  `);
}

// Middleware: extract tenant from request (via subdomain, header, or API key)
export function tenantMiddleware() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    let tenantId: string | null = null;

    // Method 1: X-Tenant-ID header
    tenantId = req.headers["x-tenant-id"] as string || null;

    // Method 2: API key with tenant scope
    if (!tenantId && req.headers.authorization?.startsWith("Bearer tenant_")) {
      const key = req.headers.authorization.slice(7);
      try {
        const result = await db.query("SELECT tenant_id FROM tenant_api_keys WHERE key_hash = $1", [key]);
        if (result.rows.length > 0) tenantId = result.rows[0].tenant_id;
      } catch {}
    }

    // Method 3: User's tenant membership
    if (!tenantId && (req as any).user?.userId) {
      try {
        const result = await db.query(
          "SELECT tenant_id FROM tenant_users WHERE user_id = $1 ORDER BY joined_at DESC LIMIT 1",
          [(req as any).user.userId]
        );
        if (result.rows.length > 0) tenantId = result.rows[0].tenant_id;
      } catch {}
    }

    (req as any).tenantId = tenantId;
    next();
  };
}

// Tenant management routes
export const tenantRouter = Router();

tenantRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { name, slug, plan } = req.body;
    if (!name || !slug) {
      res.status(400).json({ error: "name and slug are required" });
      return;
    }

    const id = crypto.randomUUID();
    const settings = JSON.stringify(DEFAULT_SETTINGS);

    await db.query(
      `INSERT INTO tenants (id, name, slug, plan, settings) VALUES ($1, $2, $3, $4, $5)`,
      [id, name, slug, plan || "starter", settings]
    );

    // Add creating user as admin
    if ((req as any).user?.userId) {
      await db.query(
        `INSERT INTO tenant_users (tenant_id, user_id, role) VALUES ($1, $2, 'admin')`,
        [id, (req as any).user.userId]
      );
    }

    res.status(201).json({ id, name, slug, plan: plan || "starter", status: "trial" });
  } catch (e: any) {
    if (e.message?.includes("UNIQUE")) {
      res.status(409).json({ error: "Tenant slug already exists" });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

tenantRouter.get("/current", async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  if (!tenantId) {
    res.status(404).json({ error: "No tenant context" });
    return;
  }

  try {
    const result = await db.query("SELECT * FROM tenants WHERE id = $1", [tenantId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    const tenant = result.rows[0];
    const users = await db.query(
      "SELECT COUNT(*) as count FROM tenant_users WHERE tenant_id = $1",
      [tenantId]
    );

    res.json({
      ...tenant,
      settings: JSON.parse(tenant.settings || "{}"),
      userCount: Number(users.rows[0].count),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

tenantRouter.get("/members", async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  if (!tenantId) {
    res.status(404).json({ error: "No tenant context" });
    return;
  }

  try {
    const result = await db.query(
      `SELECT tu.user_id, tu.role, tu.joined_at, u.email, u.name
       FROM tenant_users tu LEFT JOIN users u ON tu.user_id = u.id
       WHERE tu.tenant_id = $1 ORDER BY tu.joined_at`,
      [tenantId]
    );
    res.json({ members: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

tenantRouter.post("/invite", async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  if (!tenantId) {
    res.status(400).json({ error: "No tenant context" });
    return;
  }

  const { email, role } = req.body;
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  try {
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.query(
      `INSERT INTO tenant_invites (id, tenant_id, email, role, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, tenantId, email, role || "member", (req as any).user?.userId || "system", expiresAt]
    );
    res.status(201).json({ inviteId: id, email, role: role || "member", expiresAt });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
