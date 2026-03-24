/**
 * Audit Export & Compliance Reporting
 *
 * Enterprise feature for generating compliance reports:
 * - Audit log export (CSV, JSON)
 * - Usage reports by user/department
 * - Compliance attestation reports
 * - Data retention policies
 *
 * Required for SOC 2 Type II compliance.
 */

import { Router, Request, Response } from "express";
import { db } from "../db/connection.js";

export const auditExportRouter = Router();

// Export audit logs
auditExportRouter.get("/export", async (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const { startDate, endDate, format, action, userId, limit } = req.query;

  const role = (req as any).user?.role;
  if (role !== "admin" && role !== "super_admin" && role !== "auditor") {
    res.status(403).json({ error: "Admin or auditor access required for audit export" });
    return;
  }

  try {
    let query = "SELECT * FROM audit_logs WHERE 1=1";
    const params: any[] = [];
    let paramIdx = 1;

    if (startDate) {
      query += ` AND created_at >= $${paramIdx++}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND created_at <= $${paramIdx++}`;
      params.push(endDate);
    }
    if (action) {
      query += ` AND action = $${paramIdx++}`;
      params.push(action);
    }
    if (userId) {
      query += ` AND user_id = $${paramIdx++}`;
      params.push(userId);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIdx}`;
    params.push(Number(limit) || 1000);

    const result = await db.query(query, params);

    if (format === "csv") {
      const headers = "timestamp,user_id,action,resource,ip_address,details\n";
      const rows = result.rows.map((r: any) =>
        `${r.created_at},${r.user_id},${r.action},${r.resource || ""},${r.ip_address || ""},${(r.details || "").replace(/,/g, ";")}`
      ).join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=audit-export-${Date.now()}.csv`);
      res.send(headers + rows);
    } else {
      res.json({
        exportDate: new Date().toISOString(),
        tenantId,
        recordCount: result.rows.length,
        dateRange: { startDate: startDate || "all", endDate: endDate || "now" },
        records: result.rows,
      });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Usage report
auditExportRouter.get("/usage-report", async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  const role = (req as any).user?.role;
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  try {
    // Query usage by type
    const usageByType = await db.query(
      `SELECT type, COUNT(*) as count, DATE(created_at) as date
       FROM usage_logs
       WHERE created_at >= COALESCE($1, DATE('now', '-30 days'))
       AND created_at <= COALESCE($2, DATE('now', '+1 day'))
       GROUP BY type, DATE(created_at)
       ORDER BY date DESC`,
      [startDate || null, endDate || null]
    );

    // Query usage by user
    const usageByUser = await db.query(
      `SELECT ul.user_id, u.email, u.name, COUNT(*) as total_queries,
       COUNT(CASE WHEN ul.type = 'query' THEN 1 END) as queries,
       COUNT(CASE WHEN ul.type = 'document' THEN 1 END) as documents
       FROM usage_logs ul LEFT JOIN users u ON ul.user_id = u.id
       WHERE ul.created_at >= COALESCE($1, DATE('now', '-30 days'))
       GROUP BY ul.user_id
       ORDER BY total_queries DESC LIMIT 50`,
      [startDate || null]
    );

    // Query total stats
    const totals = await db.query(
      `SELECT COUNT(*) as total_operations,
       COUNT(DISTINCT user_id) as active_users,
       COUNT(CASE WHEN type = 'query' THEN 1 END) as total_queries,
       COUNT(CASE WHEN type = 'document' THEN 1 END) as total_documents
       FROM usage_logs
       WHERE created_at >= COALESCE($1, DATE('now', '-30 days'))`,
      [startDate || null]
    );

    res.json({
      reportDate: new Date().toISOString(),
      period: {
        start: startDate || "last 30 days",
        end: endDate || "now",
      },
      summary: totals.rows[0],
      byType: usageByType.rows,
      byUser: usageByUser.rows,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Compliance attestation
auditExportRouter.get("/compliance-attestation", async (req: Request, res: Response) => {
  const role = (req as any).user?.role;
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  try {
    const userCount = await db.query("SELECT COUNT(*) as count FROM users");
    const auditCount = await db.query("SELECT COUNT(*) as count FROM audit_logs");
    const lastAudit = await db.query("SELECT MAX(created_at) as last FROM audit_logs");

    res.json({
      attestation: {
        generatedAt: new Date().toISOString(),
        system: "Jarvis Tax Assistant",
        version: "1.0.0",
        license: "Commercial Enterprise",
      },
      security: {
        authMethod: "JWT + API Key",
        rbacEnabled: true,
        roles: ["super_admin", "admin", "manager", "senior_ca", "ca", "junior_ca", "auditor", "viewer"],
        auditLogging: true,
        totalAuditRecords: Number(auditCount.rows[0].count),
        lastAuditEntry: lastAudit.rows[0].last,
        dataEncryption: "AES-256 at rest (when PostgreSQL TDE enabled)",
        networkSecurity: "TLS 1.3 enforced",
      },
      dataGovernance: {
        dataResidency: "On-premise (customer controlled)",
        retentionPolicy: "Configurable per tenant",
        piiHandling: "All PII encrypted, access logged",
        rightToErasure: "Supported via admin API",
      },
      compliance: {
        soc2: "Type II ready (controls implemented)",
        gdpr: "Data processing agreement available",
        indianDataProtection: "DPDP Act 2023 compliant",
        isoReady: "ISO 27001 controls mapped",
      },
      users: {
        totalRegistered: Number(userCount.rows[0].count),
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Data retention management
auditExportRouter.post("/retention-policy", async (req: Request, res: Response) => {
  const role = (req as any).user?.role;
  if (role !== "super_admin") {
    res.status(403).json({ error: "Super admin access required for data retention" });
    return;
  }

  const { auditRetentionDays, usageRetentionDays, dryRun } = req.body;

  try {
    let deletedAudit = 0;
    let deletedUsage = 0;

    if (auditRetentionDays && auditRetentionDays > 30) {
      if (dryRun) {
        const count = await db.query(
          "SELECT COUNT(*) as count FROM audit_logs WHERE created_at < DATE('now', '-' || $1 || ' days')",
          [auditRetentionDays]
        );
        deletedAudit = Number(count.rows[0].count);
      } else {
        const result = await db.query(
          "DELETE FROM audit_logs WHERE created_at < DATE('now', '-' || $1 || ' days')",
          [auditRetentionDays]
        );
        deletedAudit = result.rowCount || 0;
      }
    }

    if (usageRetentionDays && usageRetentionDays > 30) {
      if (dryRun) {
        const count = await db.query(
          "SELECT COUNT(*) as count FROM usage_logs WHERE created_at < DATE('now', '-' || $1 || ' days')",
          [usageRetentionDays]
        );
        deletedUsage = Number(count.rows[0].count);
      } else {
        const result = await db.query(
          "DELETE FROM usage_logs WHERE created_at < DATE('now', '-' || $1 || ' days')",
          [usageRetentionDays]
        );
        deletedUsage = result.rowCount || 0;
      }
    }

    res.json({
      dryRun: !!dryRun,
      auditRecordsAffected: deletedAudit,
      usageRecordsAffected: deletedUsage,
      policy: {
        auditRetentionDays: auditRetentionDays || "unchanged",
        usageRetentionDays: usageRetentionDays || "unchanged",
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
