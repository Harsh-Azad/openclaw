import { Router, Request, Response } from "express";
import { queryAuditLog } from "../enterprise/audit-log.js";
import { getRoles, getPermissions, Role } from "../enterprise/rbac.js";
import { createRbacMiddleware } from "../enterprise/rbac.js";

const router = Router();

// --- Audit Logs ---

router.get(
  "/audit-logs",
  createRbacMiddleware("audit:view"),
  async (req: Request, res: Response) => {
    try {
      const logs = await queryAuditLog({
        userId: req.query.userId as string,
        action: req.query.action as any,
        startDate: req.query.startDate
          ? new Date(req.query.startDate as string)
          : undefined,
        endDate: req.query.endDate
          ? new Date(req.query.endDate as string)
          : undefined,
        limit: Number(req.query.limit) || 100,
        offset: Number(req.query.offset) || 0,
      });
      res.json({ logs, count: logs.length });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  },
);

// --- RBAC Info ---

router.get("/roles", (_req: Request, res: Response) => {
  const roles = getRoles().map((role) => ({
    role,
    permissions: getPermissions(role),
  }));
  res.json({ roles });
});

router.get("/roles/:role/permissions", (req: Request, res: Response) => {
  const role = req.params.role as Role;
  const permissions = getPermissions(role);
  if (permissions.length === 0) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  res.json({ role, permissions });
});

// --- SSO Config (stub) ---

router.get("/sso/config", createRbacMiddleware("settings:view"), (_req: Request, res: Response) => {
  res.json({
    sso: {
      enabled: false,
      providers: ["saml", "oidc", "azure-ad", "okta", "google-workspace"],
      message:
        "SSO requires commercial license. Contact licensing@jarvis-tax.ai",
    },
  });
});

// --- License Info ---

router.get("/license", (_req: Request, res: Response) => {
  res.json({
    license: {
      type: "agpl-3.0",
      product: "Jarvis Tax Assistant",
      version: "1.0.0",
      features: {
        core: true,
        taxChat: true,
        docAnalyzer: true,
        complianceCalendar: true,
        customsTariff: true,
        pluginSystem: true,
        sdk: true,
        multiTenancy: false,
        sso: false,
        whiteLabel: false,
        prioritySupport: false,
      },
      commercial: {
        required_for: [
          "multi-tenancy",
          "SSO (SAML/OIDC)",
          "white-labeling",
          "priority support",
          "on-premise deployment support",
          "custom plugin development",
        ],
        contact: "licensing@jarvis-tax.ai",
      },
    },
  });
});

export { router as enterpriseRouter };
