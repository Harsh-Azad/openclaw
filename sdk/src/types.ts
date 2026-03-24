/**
 * Jarvis Tax Assistant - Shared Types
 *
 * These types are used by both the SDK and the plugin system.
 * Import from '@jarvis-tax/sdk/types' for type-only imports.
 */

export type TaxDomain =
  | "gst"
  | "income-tax"
  | "customs"
  | "company-law"
  | "fema"
  | "transfer-pricing"
  | "international-tax"
  | "general";

export interface Reference {
  type: "section" | "rule" | "notification" | "circular" | "case-law" | "article";
  title: string;
  citation: string;
  url?: string;
  effectiveDate?: string;
}

export interface ComplianceDeadline {
  category: string;
  name: string;
  form: string;
  dueDate: string;
  description: string;
  applicableTo: string;
  penalty: string;
  status: "upcoming" | "overdue" | "completed";
  priority: "high" | "medium" | "low";
}

export interface TariffEntry {
  tariffItem: string;
  section: string;
  chapter: string;
  description: string;
  unit: string;
  basicRate: string;
  effectiveRate: string;
  igst: string;
  sws: string;
  nccd: string;
  totalRate: string;
  importPolicy: string;
  exportPolicy: string;
}

export interface SubscriptionTier {
  tier: string;
  pricing: {
    monthly: number;
    annual: number;
    currency: string;
  };
  limits: {
    queriesPerDay: number;
    documentsPerDay: number;
    features: string[];
  };
}

export type Role =
  | "super_admin"
  | "org_admin"
  | "manager"
  | "senior_associate"
  | "associate"
  | "intern"
  | "client_viewer"
  | "api_service";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  domains: TaxDomain[];
  capabilities: string[];
}
