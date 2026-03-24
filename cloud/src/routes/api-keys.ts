/**
 * API Key Management
 *
 * Create, list, revoke API keys for programmatic access.
 * Required for enterprise integrations and SDK usage.
 */

import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { db } from "../db/connection.js";
import { createRbacMiddleware } from "../enterprise/rbac.js";
import { logAudit } from "../enterprise/audit-log.js";

const router = Router();

function generateApiKey(): { key: string; prefix: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  const key = `jrv_${raw}`;
  const prefix = key.substring(0, 10);
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return { key, prefix, hash };
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT id, name, key_prefix, permissions, rate_limit, last_used_at, expires_at, created_at
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user!.userId],
    );
    res.json({ keys: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to list API keys" });
  }
});

router.post(
  "/",
  createRbacMiddleware("api:access"),
  async (req: Request, res: Response) => {
    try {
      const { name, permissions, rateLimitPerMin, expiresInDays } = req.body;

      if (!name) {
        res.status(400).json({ error: "Name is required" });
        return;
      }

      const { key, prefix, hash } = generateApiKey();
      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
        : null;

      await db.query(
        `INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, permissions, rate_limit, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          crypto.randomUUID(),
          req.user!.userId,
          name,
          hash,
          prefix,
          JSON.stringify(permissions || ["tax:chat", "tariff:lookup", "compliance:view"]),
          rateLimitPerMin || 100,
          expiresAt,
          new Date().toISOString(),
        ],
      );

      await logAudit({
        action: "api.key_create",
        userId: req.user!.userId,
        metadata: { name, prefix },
        outcome: "success",
      });

      // Return the full key ONLY on creation (never stored in plain text)
      res.status(201).json({
        message: "API key created. Save this key -- it won't be shown again.",
        key,
        prefix,
        name,
        expiresAt,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to create API key" });
    }
  },
);

router.delete("/:keyId", async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      "DELETE FROM api_keys WHERE id = $1 AND user_id = $2",
      [req.params.keyId, req.user!.userId],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "API key not found" });
      return;
    }

    await logAudit({
      action: "api.key_revoke",
      userId: req.user!.userId,
      resourceId: req.params.keyId,
      outcome: "success",
    });

    res.json({ message: "API key revoked" });
  } catch (err) {
    res.status(500).json({ error: "Failed to revoke API key" });
  }
});

export { router as apiKeysRouter };

/**
 * Middleware to authenticate via API key (X-API-Key header).
 * Falls back to JWT auth if no API key provided.
 */
export async function apiKeyAuthMiddleware(
  req: any,
  res: any,
  next: any,
) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) return next();

  const hash = crypto.createHash("sha256").update(apiKey).digest("hex");

  const result = await db.query(
    `SELECT ak.*, u.email, u.role, u.tier
     FROM api_keys ak JOIN users u ON ak.user_id = u.id
     WHERE ak.key_hash = $1`,
    [hash],
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  const keyData = result.rows[0];

  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return res.status(401).json({ error: "API key expired" });
  }

  // Update last_used_at
  await db.query(
    "UPDATE api_keys SET last_used_at = $1 WHERE id = $2",
    [new Date().toISOString(), keyData.id],
  );

  req.user = {
    userId: keyData.user_id,
    email: keyData.email,
    role: keyData.role,
    tier: keyData.tier,
  };

  next();
}
