/**
 * Jarvis SDK
 *
 * Official SDK for integrating with the Jarvis Tax Assistant API.
 * Use this to embed Jarvis in enterprise applications, build custom
 * frontends, or integrate with existing tax workflows.
 *
 * Usage:
 *   import { JarvisClient } from '@jarvis-tax/sdk';
 *   const client = new JarvisClient({ apiKey: 'xxx', baseUrl: 'https://...' });
 *   const answer = await client.taxChat({ query: 'GST rate on IT services?' });
 */

export interface JarvisClientConfig {
  baseUrl: string;
  apiKey?: string;
  accessToken?: string;
  timeout?: number;
  retries?: number;
  onTokenExpired?: () => Promise<string>;
}

export interface TaxChatParams {
  query: string;
  domain?:
    | "gst"
    | "income-tax"
    | "customs"
    | "company-law"
    | "fema"
    | "general";
  context?: Array<{ role: string; content: string }>;
  sessionId?: string;
}

export interface TaxChatResult {
  answer: string;
  references: Array<{
    type: string;
    title: string;
    citation: string;
    url?: string;
  }>;
  confidence: number;
  domain: string;
  followUp?: string[];
}

export interface ComplianceCalendarParams {
  month?: number;
  year?: number;
  category?: string;
}

export interface TariffLookupParams {
  hsn?: string;
  search?: string;
  chapter?: number;
}

export interface DocumentAnalysisParams {
  action: "analyze" | "compare" | "extract" | "validate";
  fileType: "excel" | "pdf" | "word" | "csv";
  analysisType?: string;
  options?: Record<string, any>;
}

export interface SubscriptionInfo {
  tier: string;
  limits: {
    queriesPerDay: number;
    documentsPerDay: number;
    features: string[];
  };
  usage: {
    queries: { used: number; limit: number };
    documents: { used: number; limit: number };
  };
}

export class JarvisClient {
  private config: Required<
    Pick<JarvisClientConfig, "baseUrl" | "timeout" | "retries">
  > &
    JarvisClientConfig;

  constructor(config: JarvisClientConfig) {
    this.config = {
      timeout: 30000,
      retries: 2,
      ...config,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.apiKey) {
      headers["X-API-Key"] = this.config.apiKey;
    }
    if (this.config.accessToken) {
      headers["Authorization"] = `Bearer ${this.config.accessToken}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeout,
        );

        const response = await fetch(`${this.config.baseUrl}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 401 && this.config.onTokenExpired) {
          this.config.accessToken = await this.config.onTokenExpired();
          continue;
        }

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new JarvisApiError(
            (error as any).error || `HTTP ${response.status}`,
            response.status,
            error,
          );
        }

        return (await response.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.config.retries) {
          await new Promise((r) =>
            setTimeout(r, Math.pow(2, attempt) * 1000),
          );
        }
      }
    }

    throw lastError;
  }

  // --- Auth ---

  async login(email: string, password: string) {
    return this.request<{
      user: any;
      accessToken: string;
      refreshToken: string;
    }>("POST", "/api/v1/auth/login", { email, password });
  }

  async register(data: {
    email: string;
    password: string;
    name: string;
    profession: string;
    firm?: string;
  }) {
    return this.request<{
      user: any;
      accessToken: string;
      refreshToken: string;
    }>("POST", "/api/v1/auth/register", data);
  }

  // --- Tax Chat ---

  async taxChat(params: TaxChatParams): Promise<TaxChatResult> {
    return this.request<TaxChatResult>("POST", "/api/v1/tax/chat", params);
  }

  // --- Compliance ---

  async getComplianceCalendar(params?: ComplianceCalendarParams) {
    const query = new URLSearchParams();
    if (params?.month) query.set("month", String(params.month));
    if (params?.year) query.set("year", String(params.year));
    if (params?.category) query.set("category", params.category);
    return this.request<any>(
      "GET",
      `/api/v1/tax/compliance-calendar?${query}`,
    );
  }

  // --- Tariff ---

  async tariffLookup(params: TariffLookupParams) {
    const query = new URLSearchParams();
    if (params.hsn) query.set("hsn", params.hsn);
    if (params.search) query.set("search", params.search);
    if (params.chapter) query.set("chapter", String(params.chapter));
    return this.request<any>(`GET`, `/api/v1/tax/tariff-lookup?${query}`);
  }

  // --- Document Analysis ---

  async analyzeDocument(params: DocumentAnalysisParams) {
    return this.request<any>("POST", "/api/v1/tax/analyze-document", params);
  }

  // --- Subscription ---

  async getSubscription(): Promise<SubscriptionInfo> {
    return this.request<SubscriptionInfo>(
      "GET",
      "/api/v1/subscription/current",
    );
  }

  async getUsage() {
    return this.request<any>("GET", "/api/v1/subscription/usage");
  }

  async getPlans() {
    return this.request<any>("GET", "/api/v1/subscription/plans");
  }

  // --- Plugins ---

  async getPlugins() {
    return this.request<any>("GET", "/api/v1/plugins");
  }

  // --- Health ---

  async health() {
    return this.request<{ status: string; version: string }>(
      "GET",
      "/api/health",
    );
  }
}

export class JarvisApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: any,
  ) {
    super(message);
    this.name = "JarvisApiError";
  }
}
