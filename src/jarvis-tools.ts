/**
 * Jarvis Custom Tools for OpenClaw
 *
 * Registers tax-domain tools that the AI agent can invoke.
 * These tools call the Jarvis Cloud Backend REST API.
 *
 * Tools:
 * - jarvis_tax_chat: Query tax laws with legal citations
 * - jarvis_compliance: Get compliance calendar deadlines
 * - jarvis_tariff: Look up customs tariff by HSN/keyword
 * - jarvis_doc_analyze: Analyze uploaded documents
 */

const JARVIS_CLOUD_URL = process.env.JARVIS_CLOUD_URL || "http://localhost:3001";
let jarvisToken: string | null = null;

async function getToken(): Promise<string> {
  if (jarvisToken) return jarvisToken;

  // Auto-register a service account for the gateway
  const email = "gateway@jarvis.internal";
  const password = "jarvis-gateway-internal-" + Date.now();

  try {
    const regRes = await fetch(`${JARVIS_CLOUD_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        name: "Jarvis Gateway",
        profession: "other",
      }),
    });

    if (regRes.ok) {
      const data = await regRes.json();
      jarvisToken = data.accessToken;
      return jarvisToken!;
    }
  } catch {}

  // If registration fails (already exists), try login
  try {
    const loginRes = await fetch(`${JARVIS_CLOUD_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (loginRes.ok) {
      const data = await loginRes.json();
      jarvisToken = data.accessToken;
      return jarvisToken!;
    }
  } catch {}

  throw new Error("Could not authenticate with Jarvis Cloud Backend");
}

async function jarvisApi(method: string, path: string, body?: any): Promise<any> {
  const token = await getToken();
  const opts: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${JARVIS_CLOUD_URL}${path}`, opts);
  return res.json();
}

// --- Tool Definitions ---

export const jarvisTaxChatTool = {
  name: "jarvis_tax_chat",
  description:
    "Ask a tax question and get a detailed answer with legal citations. " +
    "Covers GST, Income Tax, Customs, Company Law, and FEMA. " +
    "Returns structured response with answer, references, and confidence score.",
  parameters: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "The tax question to ask (e.g., 'What is the TDS rate on professional fees?')",
      },
      domain: {
        type: "string",
        enum: ["gst", "income-tax", "customs", "company-law", "fema", "general"],
        description: "Tax domain to focus on. Use 'general' if unsure.",
      },
    },
    required: ["query"],
  },
  handler: async (params: { query: string; domain?: string }) => {
    const result = await jarvisApi("POST", "/api/v1/tax/chat", {
      query: params.query,
      domain: params.domain || "general",
    });
    return JSON.stringify(result, null, 2);
  },
};

export const jarvisComplianceTool = {
  name: "jarvis_compliance",
  description:
    "Get compliance calendar deadlines for Indian tax filings. " +
    "Returns deadlines with due dates, forms, penalties, and priority levels. " +
    "Adjusts for weekends and Indian national holidays.",
  parameters: {
    type: "object" as const,
    properties: {
      month: {
        type: "number",
        description: "Month number (1-12). Defaults to current month.",
      },
      year: {
        type: "number",
        description: "Year (e.g., 2026). Defaults to current year.",
      },
      category: {
        type: "string",
        enum: ["gst", "income-tax", "tds", "company-law", "fema"],
        description: "Filter by tax category. Omit for all categories.",
      },
    },
  },
  handler: async (params: { month?: number; year?: number; category?: string }) => {
    const m = params.month || new Date().getMonth() + 1;
    const y = params.year || new Date().getFullYear();
    let url = `/api/v1/tax/compliance-calendar?month=${m}&year=${y}`;
    if (params.category) url += `&category=${params.category}`;
    const result = await jarvisApi("GET", url);
    return JSON.stringify(result, null, 2);
  },
};

export const jarvisTariffTool = {
  name: "jarvis_tariff",
  description:
    "Look up India's Customs Tariff (16,885 entries, 229 chapters). " +
    "Search by HSN code, keyword description, or chapter number. " +
    "Returns tariff item, description, duty rates (BCD, IGST, SWS), and import/export policy.",
  parameters: {
    type: "object" as const,
    properties: {
      hsn: {
        type: "string",
        description: "HSN code to search (e.g., '8471' for data processing machines)",
      },
      search: {
        type: "string",
        description: "Keyword to search in descriptions (e.g., 'rice', 'steel', 'data processing')",
      },
      chapter: {
        type: "string",
        description: "Chapter to filter by (e.g., 'Chapter 84')",
      },
    },
  },
  handler: async (params: { hsn?: string; search?: string; chapter?: string }) => {
    const qp = new URLSearchParams();
    if (params.hsn) qp.set("hsn", params.hsn);
    if (params.search) qp.set("search", params.search);
    if (params.chapter) qp.set("chapter", params.chapter);
    const result = await jarvisApi("GET", `/api/v1/tax/tariff-lookup?${qp.toString()}`);
    return JSON.stringify(result, null, 2);
  },
};

export const jarvisDocAnalyzeTool = {
  name: "jarvis_doc_analyze",
  description:
    "Analyze an uploaded tax document (Excel, PDF, Word). " +
    "Can compare files, extract data, validate GST returns, and review tax computations.",
  parameters: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        enum: ["analyze", "compare", "extract", "validate"],
        description: "Type of analysis to perform",
      },
      fileType: {
        type: "string",
        enum: ["excel", "pdf", "word", "csv"],
        description: "Format of the uploaded file",
      },
      analysisType: {
        type: "string",
        description: "Specific analysis (e.g., 'financial-statement', 'gst-return', 'tariff-comparison')",
      },
    },
    required: ["action", "fileType"],
  },
  handler: async (params: { action: string; fileType: string; analysisType?: string }) => {
    const result = await jarvisApi("POST", "/api/v1/tax/analyze-document", params);
    return JSON.stringify(result, null, 2);
  },
};

export const jarvisUsageTool = {
  name: "jarvis_usage",
  description: "Check current usage statistics and subscription status.",
  parameters: { type: "object" as const, properties: {} },
  handler: async () => {
    const result = await jarvisApi("GET", "/api/v1/subscription/usage");
    return JSON.stringify(result, null, 2);
  },
};

export const jarvisRagSearchTool = {
  name: "jarvis_rag_search",
  description:
    "Search the Jarvis knowledge base for tax notifications, circulars, case laws, and articles. " +
    "Uses semantic search to find relevant legal documents.",
  parameters: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Search query for legal documents",
      },
      domain: {
        type: "string",
        enum: ["gst", "income-tax", "customs", "company-law", "fema"],
        description: "Filter by tax domain",
      },
    },
    required: ["query"],
  },
  handler: async (params: { query: string; domain?: string }) => {
    let url = `/api/v1/rag/search?q=${encodeURIComponent(params.query)}`;
    if (params.domain) url += `&domain=${params.domain}`;
    const result = await jarvisApi("GET", url);
    return JSON.stringify(result, null, 2);
  },
};

// --- Export all tools ---
export const JARVIS_TOOLS = [
  jarvisTaxChatTool,
  jarvisComplianceTool,
  jarvisTariffTool,
  jarvisDocAnalyzeTool,
  jarvisUsageTool,
  jarvisRagSearchTool,
];
