/**
 * Audit Log System
 *
 * Enterprise-grade audit trail for compliance and regulatory requirements.
 * Required by Big 4 firms for SOC 2, ISO 27001, and client data governance.
 */

import { db } from "../db/connection.js";

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "auth.register"
  | "auth.password_change"
  | "tax.chat.query"
  | "tax.chat.response"
  | "document.upload"
  | "document.analyze"
  | "document.delete"
  | "document.share"
  | "compliance.view"
  | "compliance.update"
  | "compliance.assign"
  | "tariff.lookup"
  | "tariff.data_update"
  | "subscription.change"
  | "subscription.payment"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "user.role_change"
  | "plugin.install"
  | "plugin.uninstall"
  | "plugin.configure"
  | "settings.update"
  | "export.data"
  | "api.key_create"
  | "api.key_revoke";

export interface AuditEntry {
  action: AuditAction;
  userId: string;
  tenantId?: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  outcome: "success" | "failure" | "denied";
  errorMessage?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_logs (
        id, action, user_id, tenant_id, resource_type, resource_id,
        metadata, ip_address, user_agent, outcome, error_message, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()
      )`,
      [
        entry.action,
        entry.userId,
        entry.tenantId || null,
        entry.resourceType || null,
        entry.resourceId || null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.ipAddress || null,
        entry.userAgent || null,
        entry.outcome,
        entry.errorMessage || null,
      ],
    );
  } catch (err) {
    // Audit logging should never break the main flow
    console.error("[AuditLog] Failed to write audit entry:", err);
  }
}

export async function queryAuditLog(params: {
  userId?: string;
  tenantId?: string;
  action?: AuditAction;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}) {
  const conditions: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (params.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    values.push(params.userId);
  }
  if (params.tenantId) {
    conditions.push(`tenant_id = $${paramIndex++}`);
    values.push(params.tenantId);
  }
  if (params.action) {
    conditions.push(`action = $${paramIndex++}`);
    values.push(params.action);
  }
  if (params.startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    values.push(params.startDate);
  }
  if (params.endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    values.push(params.endDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = params.limit || 100;
  const offset = params.offset || 0;

  const result = await db.query(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...values, limit, offset],
  );

  return result.rows;
}

export function createAuditMiddleware() {
  return (req: any, res: any, next: any) => {
    const originalJson = res.json.bind(res);
    res.json = function (data: any) {
      const action = mapRouteToAction(req.method, req.path);
      if (action && req.user) {
        logAudit({
          action,
          userId: req.user.userId,
          tenantId: req.user.tenantId,
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
          outcome: res.statusCode < 400 ? "success" : "failure",
          metadata: { method: req.method, path: req.path },
        });
      }
      return originalJson(data);
    };
    next();
  };
}

function mapRouteToAction(method: string, path: string): AuditAction | null {
  if (path.includes("/auth/login")) return "auth.login";
  if (path.includes("/auth/register")) return "auth.register";
  if (path.includes("/tax/chat")) return "tax.chat.query";
  if (path.includes("/tax/analyze-document")) return "document.analyze";
  if (path.includes("/tax/compliance-calendar")) return "compliance.view";
  if (path.includes("/tax/tariff-lookup")) return "tariff.lookup";
  if (path.includes("/subscription/subscribe")) return "subscription.change";
  if (path.includes("/subscription/confirm-payment")) return "subscription.payment";
  return null;
}
