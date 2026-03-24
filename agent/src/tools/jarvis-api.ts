/**
 * Jarvis Cloud API Tools
 *
 * Tools that call the Jarvis Cloud Backend REST API.
 * These give the agent access to tax knowledge, compliance data, and tariff lookup.
 */

import { Tool, AgentContext, ToolResult } from "../types.js";

function ok(output: string): ToolResult { return { success: true, output }; }
function fail(error: string): ToolResult { return { success: false, output: "", error }; }

let cachedToken: string | null = null;

async function getToken(cloudUrl: string): Promise<string | null> {
  if (cachedToken) return cachedToken;
  const email = "agent@jarvis.internal";
  const password = "jarvis-agent-runtime-key";

  try {
    let res = await fetch(`${cloudUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Jarvis Agent", profession: "other" }),
    });
    if (res.ok) { cachedToken = (await res.json()).accessToken; return cachedToken; }

    res = await fetch(`${cloudUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) { cachedToken = (await res.json()).accessToken; return cachedToken; }
  } catch {}
  return null;
}

async function callCloud(ctx: AgentContext, method: string, path: string, body?: any): Promise<any> {
  const cloudUrl = (ctx as any).jarvisCloudUrl || "http://localhost:3001";
  const token = await getToken(cloudUrl);
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } as any };
  if (token) (opts.headers as any)["Authorization"] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${cloudUrl}${path}`, opts);
  return res.json();
}

export const taxChatTool: Tool = {
  name: "jarvis_tax_chat",
  description: "Ask a tax question about Indian law (GST, Income Tax, Customs, Company Law, FEMA). Returns a detailed answer with legal citations, references, and confidence score.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The tax question to ask" },
      domain: { type: "string", enum: ["gst", "income-tax", "customs", "company-law", "fema", "general"], description: "Tax domain" },
    },
    required: ["query"],
  },
  riskLevel: "low",
  execute: async (params, ctx) => {
    try {
      const r = await callCloud(ctx, "POST", "/api/v1/tax/chat", { query: params.query, domain: params.domain || "general" });
      return ok(JSON.stringify(r, null, 2));
    } catch (e: any) { return fail(e.message); }
  },
};

export const complianceTool: Tool = {
  name: "jarvis_compliance",
  description: "Get Indian tax compliance deadlines for a given month/year. Returns due dates, forms, penalties, priority levels. Deadlines are adjusted for weekends and Indian national holidays.",
  parameters: {
    type: "object",
    properties: {
      month: { type: "number", description: "Month 1-12" },
      year: { type: "number", description: "Year" },
      category: { type: "string", enum: ["gst", "income-tax", "tds", "company-law", "fema"] },
    },
  },
  riskLevel: "low",
  execute: async (params, ctx) => {
    try {
      const m = params.month || new Date().getMonth() + 1;
      const y = params.year || new Date().getFullYear();
      let url = `/api/v1/tax/compliance-calendar?month=${m}&year=${y}`;
      if (params.category) url += `&category=${params.category}`;
      const r = await callCloud(ctx, "GET", url);
      return ok(JSON.stringify(r, null, 2));
    } catch (e: any) { return fail(e.message); }
  },
};

export const tariffTool: Tool = {
  name: "jarvis_tariff",
  description: "Look up India Customs Tariff (16,885 entries, 229 chapters). Search by HSN code, keyword description, or chapter. Returns tariff item, description, duty rates (BCD, IGST, SWS), and import/export policy.",
  parameters: {
    type: "object",
    properties: {
      hsn: { type: "string", description: "HSN code (e.g. 8471)" },
      search: { type: "string", description: "Keyword (e.g. rice, steel)" },
      chapter: { type: "string", description: "Chapter (e.g. Chapter 84)" },
    },
  },
  riskLevel: "low",
  execute: async (params, ctx) => {
    try {
      const qp = new URLSearchParams();
      if (params.hsn) qp.set("hsn", params.hsn);
      if (params.search) qp.set("search", params.search);
      if (params.chapter) qp.set("chapter", params.chapter);
      const r = await callCloud(ctx, "GET", `/api/v1/tax/tariff-lookup?${qp}`);
      return ok(JSON.stringify(r, null, 2));
    } catch (e: any) { return fail(e.message); }
  },
};

export const ragSearchTool: Tool = {
  name: "jarvis_rag_search",
  description: "Search the Jarvis knowledge base for tax notifications, circulars, case laws, and articles.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      domain: { type: "string", enum: ["gst", "income-tax", "customs", "company-law", "fema"] },
    },
    required: ["query"],
  },
  riskLevel: "low",
  execute: async (params, ctx) => {
    try {
      let url = `/api/v1/rag/search?q=${encodeURIComponent(params.query)}`;
      if (params.domain) url += `&domain=${params.domain}`;
      const r = await callCloud(ctx, "GET", url);
      return ok(JSON.stringify(r, null, 2));
    } catch (e: any) { return fail(e.message); }
  },
};

export const JARVIS_API_TOOLS = [taxChatTool, complianceTool, tariffTool, ragSearchTool];
