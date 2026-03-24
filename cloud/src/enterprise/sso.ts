/**
 * SSO (Single Sign-On) Integration
 *
 * Supports SAML 2.0 and OIDC for enterprise identity providers.
 * Common enterprise IdPs: Azure AD, Okta, OneLogin, Google Workspace.
 *
 * This is a scaffold -- production deployment requires:
 * - SAML: passport-saml or saml2-js
 * - OIDC: openid-client
 * Both gated behind commercial license.
 */

import { Router, Request, Response } from "express";
import { db } from "../db/connection.js";

export interface SSOConfig {
  tenantId: string;
  provider: "saml" | "oidc";
  issuer: string;
  ssoUrl: string;
  certificate?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
  allowedDomains: string[];
  autoProvision: boolean;
  defaultRole: string;
}

export async function initSSOTables(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS sso_configs (
      tenant_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      issuer TEXT NOT NULL,
      sso_url TEXT NOT NULL,
      certificate TEXT,
      client_id TEXT,
      client_secret TEXT,
      redirect_uri TEXT NOT NULL,
      allowed_domains TEXT DEFAULT '[]',
      auto_provision INTEGER DEFAULT 1,
      default_role TEXT DEFAULT 'member',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS sso_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT,
      provider TEXT NOT NULL,
      external_id TEXT NOT NULL,
      email TEXT NOT NULL,
      attributes TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    )
  `);
}

export const ssoRouter = Router();

// Get SSO config for tenant
ssoRouter.get("/config", async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  if (!tenantId) {
    res.status(400).json({ error: "No tenant context" });
    return;
  }

  // Only admin can view SSO config
  const role = (req as any).user?.role;
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Admin access required for SSO configuration" });
    return;
  }

  try {
    const result = await db.query("SELECT * FROM sso_configs WHERE tenant_id = $1", [tenantId]);
    if (result.rows.length === 0) {
      res.json({ configured: false, message: "SSO not configured for this tenant" });
      return;
    }

    const config = result.rows[0];
    res.json({
      configured: true,
      provider: config.provider,
      issuer: config.issuer,
      ssoUrl: config.sso_url,
      redirectUri: config.redirect_uri,
      allowedDomains: JSON.parse(config.allowed_domains || "[]"),
      autoProvision: !!config.auto_provision,
      defaultRole: config.default_role,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Configure SSO for tenant
ssoRouter.put("/config", async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  if (!tenantId) {
    res.status(400).json({ error: "No tenant context" });
    return;
  }

  const role = (req as any).user?.role;
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { provider, issuer, ssoUrl, certificate, clientId, clientSecret, redirectUri, allowedDomains, autoProvision, defaultRole } = req.body;

  if (!provider || !issuer || !ssoUrl || !redirectUri) {
    res.status(400).json({ error: "provider, issuer, ssoUrl, and redirectUri are required" });
    return;
  }

  try {
    await db.query(
      `INSERT INTO sso_configs (tenant_id, provider, issuer, sso_url, certificate, client_id, client_secret, redirect_uri, allowed_domains, auto_provision, default_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (tenant_id) DO UPDATE SET
         provider = $2, issuer = $3, sso_url = $4, certificate = $5,
         client_id = $6, client_secret = $7, redirect_uri = $8,
         allowed_domains = $9, auto_provision = $10, default_role = $11,
         updated_at = CURRENT_TIMESTAMP`,
      [tenantId, provider, issuer, ssoUrl, certificate || null, clientId || null,
       clientSecret || null, redirectUri, JSON.stringify(allowedDomains || []),
       autoProvision ? 1 : 0, defaultRole || "member"]
    );

    res.json({ message: "SSO configured successfully", provider, issuer });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// SAML callback endpoint (scaffold)
ssoRouter.post("/saml/callback", async (req: Request, res: Response) => {
  res.status(501).json({
    error: "SAML callback not implemented in development mode",
    message: "Production deployment requires passport-saml package. Contact support@jarvis.tax for enterprise setup.",
  });
});

// OIDC callback endpoint (scaffold)
ssoRouter.get("/oidc/callback", async (req: Request, res: Response) => {
  res.status(501).json({
    error: "OIDC callback not implemented in development mode",
    message: "Production deployment requires openid-client package. Contact support@jarvis.tax for enterprise setup.",
  });
});

// SSO login initiation
ssoRouter.get("/login/:tenantSlug", async (req: Request, res: Response) => {
  const { tenantSlug } = req.params;

  try {
    const tenant = await db.query("SELECT id FROM tenants WHERE slug = $1", [tenantSlug]);
    if (tenant.rows.length === 0) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    const config = await db.query("SELECT * FROM sso_configs WHERE tenant_id = $1", [tenant.rows[0].id]);
    if (config.rows.length === 0) {
      res.status(404).json({ error: "SSO not configured for this tenant" });
      return;
    }

    const ssoConfig = config.rows[0];

    if (ssoConfig.provider === "saml") {
      res.json({
        type: "saml",
        redirectUrl: ssoConfig.sso_url,
        message: "Redirect to SAML IdP",
      });
    } else {
      // OIDC
      const authUrl = new URL(ssoConfig.sso_url);
      authUrl.searchParams.set("client_id", ssoConfig.client_id || "");
      authUrl.searchParams.set("redirect_uri", ssoConfig.redirect_uri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "openid email profile");
      authUrl.searchParams.set("state", crypto.randomUUID());

      res.json({
        type: "oidc",
        redirectUrl: authUrl.toString(),
        message: "Redirect to OIDC IdP",
      });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
