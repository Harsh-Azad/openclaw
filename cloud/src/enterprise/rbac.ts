/**
 * Role-Based Access Control (RBAC)
 *
 * Enterprise-grade permission system for multi-tenant deployments.
 * Allows firms like EY/PwC to define granular access per user role.
 */

export type Role =
  | "super_admin"
  | "org_admin"
  | "manager"
  | "senior_associate"
  | "associate"
  | "intern"
  | "client_viewer"
  | "api_service";

export type Permission =
  | "tax:chat"
  | "tax:chat:all_domains"
  | "tax:chat:gst"
  | "tax:chat:income_tax"
  | "tax:chat:customs"
  | "tax:chat:company_law"
  | "tax:chat:fema"
  | "documents:analyze"
  | "documents:upload"
  | "documents:delete"
  | "documents:share"
  | "compliance:view"
  | "compliance:manage"
  | "compliance:assign"
  | "tariff:lookup"
  | "tariff:manage_data"
  | "users:view"
  | "users:manage"
  | "users:invite"
  | "users:delete"
  | "subscription:view"
  | "subscription:manage"
  | "plugins:view"
  | "plugins:install"
  | "plugins:manage"
  | "audit:view"
  | "audit:export"
  | "settings:view"
  | "settings:manage"
  | "api:access"
  | "reports:view"
  | "reports:generate"
  | "reports:export";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [
    "tax:chat",
    "tax:chat:all_domains",
    "documents:analyze",
    "documents:upload",
    "documents:delete",
    "documents:share",
    "compliance:view",
    "compliance:manage",
    "compliance:assign",
    "tariff:lookup",
    "tariff:manage_data",
    "users:view",
    "users:manage",
    "users:invite",
    "users:delete",
    "subscription:view",
    "subscription:manage",
    "plugins:view",
    "plugins:install",
    "plugins:manage",
    "audit:view",
    "audit:export",
    "settings:view",
    "settings:manage",
    "api:access",
    "reports:view",
    "reports:generate",
    "reports:export",
  ],
  org_admin: [
    "tax:chat",
    "tax:chat:all_domains",
    "documents:analyze",
    "documents:upload",
    "documents:delete",
    "documents:share",
    "compliance:view",
    "compliance:manage",
    "compliance:assign",
    "tariff:lookup",
    "users:view",
    "users:manage",
    "users:invite",
    "subscription:view",
    "subscription:manage",
    "plugins:view",
    "plugins:install",
    "audit:view",
    "audit:export",
    "settings:view",
    "settings:manage",
    "api:access",
    "reports:view",
    "reports:generate",
    "reports:export",
  ],
  manager: [
    "tax:chat",
    "tax:chat:all_domains",
    "documents:analyze",
    "documents:upload",
    "documents:share",
    "compliance:view",
    "compliance:manage",
    "compliance:assign",
    "tariff:lookup",
    "users:view",
    "users:invite",
    "audit:view",
    "reports:view",
    "reports:generate",
    "reports:export",
  ],
  senior_associate: [
    "tax:chat",
    "tax:chat:all_domains",
    "documents:analyze",
    "documents:upload",
    "documents:share",
    "compliance:view",
    "compliance:manage",
    "tariff:lookup",
    "reports:view",
    "reports:generate",
  ],
  associate: [
    "tax:chat",
    "tax:chat:gst",
    "tax:chat:income_tax",
    "documents:analyze",
    "documents:upload",
    "compliance:view",
    "tariff:lookup",
    "reports:view",
  ],
  intern: [
    "tax:chat",
    "tax:chat:gst",
    "tax:chat:income_tax",
    "compliance:view",
    "tariff:lookup",
  ],
  client_viewer: ["compliance:view", "reports:view"],
  api_service: [
    "tax:chat",
    "tax:chat:all_domains",
    "documents:analyze",
    "tariff:lookup",
    "compliance:view",
    "api:access",
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;

  if (permissions.includes(permission)) return true;

  // Check domain-level wildcard
  if (
    permission.startsWith("tax:chat:") &&
    permissions.includes("tax:chat:all_domains")
  ) {
    return true;
  }

  return false;
}

export function getPermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

export function getRoles(): Role[] {
  return Object.keys(ROLE_PERMISSIONS) as Role[];
}

export function createRbacMiddleware(requiredPermission: Permission) {
  return (req: any, res: any, next: any) => {
    const userRole = req.user?.role as Role;

    if (!userRole) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!hasPermission(userRole, requiredPermission)) {
      return res.status(403).json({
        error: "Insufficient permissions",
        required: requiredPermission,
        role: userRole,
      });
    }

    next();
  };
}
