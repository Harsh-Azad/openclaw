/**
 * Jarvis Plugin System
 *
 * Allows third parties (EY, PwC, etc.) to extend Jarvis with custom
 * tax modules, data sources, analysis engines, and UI components.
 */

export interface JarvisPluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  license: "agpl-3.0" | "commercial";
  domains: TaxDomain[];
  capabilities: PluginCapability[];
  config?: Record<string, PluginConfigField>;
  dependencies?: string[];
}

export type TaxDomain =
  | "gst"
  | "income-tax"
  | "customs"
  | "company-law"
  | "fema"
  | "transfer-pricing"
  | "international-tax"
  | "audit"
  | "accounting"
  | "payroll"
  | "litigation"
  | "general";

export type PluginCapability =
  | "chat"
  | "document-analysis"
  | "compliance-tracking"
  | "rate-lookup"
  | "return-filing"
  | "notice-management"
  | "audit-support"
  | "reporting"
  | "data-import"
  | "data-export"
  | "custom-ui";

export interface PluginConfigField {
  type: "string" | "number" | "boolean" | "select";
  label: string;
  required: boolean;
  default?: any;
  options?: string[];
  secret?: boolean;
}

export interface PluginContext {
  userId: string;
  tenantId?: string;
  tier: string;
  config: Record<string, any>;
  logger: PluginLogger;
  storage: PluginStorage;
  events: PluginEvents;
}

export interface PluginLogger {
  info(message: string, data?: Record<string, any>): void;
  warn(message: string, data?: Record<string, any>): void;
  error(message: string, data?: Record<string, any>): void;
  debug(message: string, data?: Record<string, any>): void;
}

export interface PluginStorage {
  get(key: string): Promise<any>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export interface PluginEvents {
  emit(event: string, data: any): void;
  on(event: string, handler: (data: any) => void): void;
  off(event: string, handler: (data: any) => void): void;
}

export interface ChatRequest {
  query: string;
  domain: TaxDomain;
  context: Array<{ role: string; content: string }>;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface ChatResponse {
  answer: string;
  references: Reference[];
  confidence: number;
  domain: TaxDomain;
  followUp?: string[];
  metadata?: Record<string, any>;
}

export interface Reference {
  type: "section" | "rule" | "notification" | "circular" | "case-law" | "article";
  title: string;
  citation: string;
  url?: string;
  effectiveDate?: string;
}

export interface DocumentAnalysisRequest {
  action: "analyze" | "compare" | "extract" | "validate";
  files: Array<{ name: string; type: string; content: Buffer }>;
  analysisType?: string;
  options?: Record<string, any>;
}

export interface DocumentAnalysisResponse {
  summary: string;
  findings: Finding[];
  metrics: Record<string, any>;
  recommendations: string[];
}

export interface Finding {
  severity: "critical" | "warning" | "info";
  category: string;
  description: string;
  location?: string;
  reference?: Reference;
}

export interface ComplianceItem {
  id: string;
  name: string;
  form: string;
  domain: TaxDomain;
  dueDate: string;
  description: string;
  applicableTo: string;
  penalty: string;
  status: "upcoming" | "overdue" | "completed" | "not-applicable";
  priority: "high" | "medium" | "low";
}

/**
 * Base interface for all Jarvis plugins.
 * Implement this to create a custom tax module.
 */
export interface JarvisPlugin {
  manifest: JarvisPluginManifest;

  initialize(context: PluginContext): Promise<void>;
  shutdown(): Promise<void>;

  onChat?(request: ChatRequest): Promise<ChatResponse | null>;
  onDocumentAnalysis?(request: DocumentAnalysisRequest): Promise<DocumentAnalysisResponse | null>;
  getComplianceItems?(month: number, year: number): Promise<ComplianceItem[]>;
  onRateLookup?(query: string, params: Record<string, any>): Promise<any>;

  getHealth?(): Promise<{ status: "ok" | "degraded" | "error"; details?: string }>;
}
