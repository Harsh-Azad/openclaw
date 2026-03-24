/**
 * @jarvis-tax/openclaw-tools
 *
 * OpenClaw plugin that registers Jarvis tax-domain tools.
 * The agent can invoke these tools to call the Jarvis Cloud Backend API.
 */

const JARVIS_CLOUD_URL = process.env.JARVIS_CLOUD_URL || "http://localhost:3001";
let cachedToken = null;

async function getToken() {
  if (cachedToken) return cachedToken;

  const email = "gateway@jarvis.internal";
  const password = "jarvis-gateway-service-key";

  try {
    const res = await fetch(`${JARVIS_CLOUD_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Jarvis Gateway", profession: "other" }),
    });
    if (res.ok) {
      const data = await res.json();
      cachedToken = data.accessToken;
      return cachedToken;
    }
  } catch {}

  try {
    const res = await fetch(`${JARVIS_CLOUD_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const data = await res.json();
      cachedToken = data.accessToken;
      return cachedToken;
    }
  } catch {}

  return null;
}

async function callApi(method, path, body) {
  const token = await getToken();
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (token) opts.headers["Authorization"] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${JARVIS_CLOUD_URL}${path}`, opts);
  return res.json();
}

export function activate(api) {
  api.registerTool("jarvis_tax_chat", {
    description: "Ask a tax question about Indian law (GST, Income Tax, Customs, Company Law, FEMA). Returns answer with legal citations.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Tax question" },
        domain: { type: "string", enum: ["gst", "income-tax", "customs", "company-law", "fema", "general"] },
      },
      required: ["query"],
    },
    handler: async ({ query, domain }) => {
      const result = await callApi("POST", "/api/v1/tax/chat", { query, domain: domain || "general" });
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool("jarvis_compliance", {
    description: "Get Indian tax compliance deadlines for a given month/year. Returns due dates, forms, penalties, priorities.",
    parameters: {
      type: "object",
      properties: {
        month: { type: "number", description: "Month (1-12)" },
        year: { type: "number", description: "Year" },
        category: { type: "string", enum: ["gst", "income-tax", "tds", "company-law", "fema"] },
      },
    },
    handler: async ({ month, year, category }) => {
      const m = month || new Date().getMonth() + 1;
      const y = year || new Date().getFullYear();
      let url = `/api/v1/tax/compliance-calendar?month=${m}&year=${y}`;
      if (category) url += `&category=${category}`;
      const result = await callApi("GET", url);
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool("jarvis_tariff", {
    description: "Look up India Customs Tariff (16,885 entries). Search by HSN code, keyword, or chapter.",
    parameters: {
      type: "object",
      properties: {
        hsn: { type: "string", description: "HSN code (e.g., 8471)" },
        search: { type: "string", description: "Keyword (e.g., rice, steel)" },
        chapter: { type: "string", description: "Chapter (e.g., Chapter 84)" },
      },
    },
    handler: async ({ hsn, search, chapter }) => {
      const params = new URLSearchParams();
      if (hsn) params.set("hsn", hsn);
      if (search) params.set("search", search);
      if (chapter) params.set("chapter", chapter);
      const result = await callApi("GET", `/api/v1/tax/tariff-lookup?${params}`);
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool("jarvis_doc_analyze", {
    description: "Analyze an uploaded tax document (Excel/PDF/Word).",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["analyze", "compare", "extract", "validate"] },
        fileType: { type: "string", enum: ["excel", "pdf", "word", "csv"] },
        analysisType: { type: "string" },
      },
      required: ["action", "fileType"],
    },
    handler: async (params) => {
      const result = await callApi("POST", "/api/v1/tax/analyze-document", params);
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool("jarvis_usage", {
    description: "Check Jarvis subscription usage (queries used, limits, plan).",
    parameters: { type: "object", properties: {} },
    handler: async () => {
      const result = await callApi("GET", "/api/v1/subscription/usage");
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool("jarvis_rag_search", {
    description: "Search Jarvis knowledge base for tax notifications, circulars, case laws.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        domain: { type: "string", enum: ["gst", "income-tax", "customs", "company-law", "fema"] },
      },
      required: ["query"],
    },
    handler: async ({ query, domain }) => {
      let url = `/api/v1/rag/search?q=${encodeURIComponent(query)}`;
      if (domain) url += `&domain=${domain}`;
      const result = await callApi("GET", url);
      return JSON.stringify(result, null, 2);
    },
  });

  console.log("[Jarvis Plugin] 6 tax tools registered");
}
