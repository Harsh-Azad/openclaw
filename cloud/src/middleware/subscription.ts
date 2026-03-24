import { Request, Response, NextFunction } from "express";
import { getSubscription } from "../services/subscription-service.js";

export interface TierLimits {
  queriesPerDay: number;
  documentsPerDay: number;
  features: string[];
}

const TIER_LIMITS: Record<string, TierLimits> = {
  free: {
    queriesPerDay: 1000,
    documentsPerDay: 100,
    features: ["tax-chat", "compliance-calendar", "customs-tariff"],
  },
  professional: {
    queriesPerDay: 200,
    documentsPerDay: 50,
    features: [
      "tax-chat",
      "doc-analyzer",
      "compliance-calendar",
      "customs-tariff",
    ],
  },
  enterprise: {
    queriesPerDay: -1, // unlimited
    documentsPerDay: -1,
    features: [
      "tax-chat",
      "doc-analyzer",
      "compliance-calendar",
      "customs-tariff",
      "priority-support",
      "api-access",
      "multi-user",
    ],
  },
};

export function subscriptionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const tier = req.user.tier || "free";
  const limits = TIER_LIMITS[tier];

  if (!limits) {
    res.status(403).json({ error: "Invalid subscription tier" });
    return;
  }

  (req as any).tierLimits = limits;
  next();
}

export { TIER_LIMITS };
