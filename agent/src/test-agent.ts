/**
 * Agent Runtime Tests
 *
 * Tests: tool registry, file tools, Jarvis API tools, memory manager,
 * RAG pipeline, document tools.
 *
 * Requires: Cloud backend running on http://localhost:3001
 * Does NOT require: LLM API key (tests tool execution directly)
 */

import { ToolRegistry } from "./tool-registry.js";
import { FILE_TOOLS } from "./tools/filesystem.js";
import { JARVIS_API_TOOLS } from "./tools/jarvis-api.js";
import { DOCUMENT_TOOLS } from "./tools/document.js";
import { MemoryManager } from "./memory.js";
import { RagPipeline, createRagTools } from "./rag.js";
import { ProviderManager } from "./llm/provider-manager.js";
import { DocumentPipeline, createDocumentPipelineTools } from "./vlm/index.js";
import { RagV2Pipeline, createRagV2Tools } from "./rag-v2.js";
import { AgentContext } from "./types.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e: any) {
    console.log(`  FAIL: ${name} -- ${e.message}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

const CLOUD_URL = process.env.JARVIS_CLOUD_URL || "http://localhost:3001";

function makeCtx(workDir?: string): AgentContext {
  return {
    sessionId: "test",
    userId: "test-user",
    workingDirectory: workDir || os.tmpdir(),
    memory: [],
    tools: new Map(),
    jarvisCloudUrl: CLOUD_URL,
  } as any;
}

async function run() {
  console.log("\n=== JARVIS AGENT RUNTIME TESTS ===\n");

  // 1. Tool Registry
  console.log("[1] Tool Registry");
  await test("Register and list tools", async () => {
    const reg = new ToolRegistry();
    reg.registerAll(FILE_TOOLS);
    reg.registerAll(JARVIS_API_TOOLS);
    assert(reg.list().length === 10, `Expected 10 tools, got ${reg.list().length}`);
  });

  await test("Convert to OpenAI format", async () => {
    const reg = new ToolRegistry();
    reg.registerAll(FILE_TOOLS);
    const oaiTools = reg.toOpenAITools();
    assert(oaiTools[0].type === "function", "Not function type");
    assert(oaiTools[0].function.name === "read_file", `Expected read_file, got ${oaiTools[0].function.name}`);
  });

  // 2. File System Tools
  console.log("\n[2] File System Tools");
  const tmpDir = path.join(os.tmpdir(), `jarvis-test-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  const ctx = makeCtx(tmpDir);

  await test("write_file creates file", async () => {
    const tool = FILE_TOOLS.find((t) => t.name === "write_file")!;
    const result = await tool.execute({ path: "test.txt", content: "Hello Jarvis" }, ctx);
    assert(result.success, result.error || "write failed");
    const content = await fs.readFile(path.join(tmpDir, "test.txt"), "utf-8");
    assert(content === "Hello Jarvis", "Content mismatch");
  });

  await test("read_file reads content", async () => {
    const tool = FILE_TOOLS.find((t) => t.name === "read_file")!;
    const result = await tool.execute({ path: "test.txt" }, ctx);
    assert(result.success, result.error || "read failed");
    assert(result.output.includes("Hello Jarvis"), "Content not found in output");
  });

  await test("list_files shows directory", async () => {
    const tool = FILE_TOOLS.find((t) => t.name === "list_files")!;
    const result = await tool.execute({ path: "." }, ctx);
    assert(result.success, result.error || "list failed");
    assert(result.output.includes("test.txt"), "test.txt not listed");
  });

  await test("search_files finds text", async () => {
    const tool = FILE_TOOLS.find((t) => t.name === "search_files")!;
    const result = await tool.execute({ query: "Jarvis" }, ctx);
    assert(result.success, result.error || "search failed");
    assert(result.output.includes("test.txt"), "Match not found");
  });

  await test("move_file renames", async () => {
    const tool = FILE_TOOLS.find((t) => t.name === "move_file")!;
    const result = await tool.execute({ source: "test.txt", destination: "renamed.txt" }, ctx);
    assert(result.success, result.error || "move failed");
    const exists = await fs.access(path.join(tmpDir, "renamed.txt")).then(() => true).catch(() => false);
    assert(exists, "renamed.txt not found");
  });

  await test("delete_file removes file", async () => {
    const tool = FILE_TOOLS.find((t) => t.name === "delete_file")!;
    const result = await tool.execute({ path: "renamed.txt" }, ctx);
    assert(result.success, result.error || "delete failed");
    const exists = await fs.access(path.join(tmpDir, "renamed.txt")).then(() => true).catch(() => false);
    assert(!exists, "File still exists after delete");
  });

  // 3. Jarvis API Tools (requires cloud backend running)
  console.log("\n[3] Jarvis API Tools (requires cloud backend at " + CLOUD_URL + ")");

  let cloudUp = false;
  try {
    const r = await fetch(`${CLOUD_URL}/api/health`);
    cloudUp = r.ok;
  } catch {}

  if (cloudUp) {
    await test("jarvis_tax_chat returns answer", async () => {
      const tool = JARVIS_API_TOOLS.find((t) => t.name === "jarvis_tax_chat")!;
      const result = await tool.execute({ query: "What is TDS rate on professional fees?", domain: "income-tax" }, ctx);
      assert(result.success, result.error || "API call failed");
      assert(result.output.includes("194J") || result.output.includes("answer"), "No relevant content in response");
    });

    await test("jarvis_compliance returns deadlines", async () => {
      const tool = JARVIS_API_TOOLS.find((t) => t.name === "jarvis_compliance")!;
      const result = await tool.execute({ month: 3, year: 2026 }, ctx);
      assert(result.success, result.error || "API call failed");
      assert(result.output.includes("deadlines") || result.output.includes("dueDate") || result.output.includes("month"), "No compliance data in response");
    });

    await test("jarvis_tariff searches HSN", async () => {
      const tool = JARVIS_API_TOOLS.find((t) => t.name === "jarvis_tariff")!;
      const result = await tool.execute({ hsn: "8471" }, ctx);
      assert(result.success, result.error || "API call failed");
      assert(result.output.includes("results") || result.output.includes("8471"), "No tariff results");
    });

    await test("jarvis_rag_search queries KB", async () => {
      const tool = JARVIS_API_TOOLS.find((t) => t.name === "jarvis_rag_search")!;
      const result = await tool.execute({ query: "GST rate" }, ctx);
      assert(result.success, result.error || "API call failed");
    });
  } else {
    console.log("  SKIP: Cloud backend not running at " + CLOUD_URL);
    console.log("  Start it with: cd cloud && DB_MODE=sqlite npx tsx demo.ts");
  }

  // 4. Document Analysis Tools
  console.log("\n[4] Document Analysis Tools");

  // Create test CSV
  const csvContent = `Name,Amount,Category,Date
  John,50000,Professional Fees,2026-01-15
  Jane,120000,Rent,2026-02-01
  Bob,25000,Commission,2026-03-10
  Alice,200000,Contract,2026-03-15
  Eve,75000,Professional Fees,2026-03-20`;

  await fs.writeFile(path.join(tmpDir, "test-data.csv"), csvContent);

  await test("parse_csv reads CSV data", async () => {
    const tool = DOCUMENT_TOOLS.find((t) => t.name === "parse_csv")!;
    const result = await tool.execute({ path: "test-data.csv" }, ctx);
    assert(result.success, result.error || "CSV parse failed");
    assert(result.output.includes("5 total rows"), `Expected 5 rows: ${result.output.substring(0, 100)}`);
  });

  await test("parse_csv filters rows", async () => {
    const tool = DOCUMENT_TOOLS.find((t) => t.name === "parse_csv")!;
    const result = await tool.execute({ path: "test-data.csv", filter: "Amount>50000" }, ctx);
    assert(result.success, result.error || "filter failed");
    assert(result.output.includes("3 after filter") || result.output.includes("Rent"), "Filter didn't work");
  });

  await test("parse_csv computes aggregation", async () => {
    const tool = DOCUMENT_TOOLS.find((t) => t.name === "parse_csv")!;
    const result = await tool.execute({ path: "test-data.csv", aggregate: "sum(Amount)" }, ctx);
    assert(result.success, result.error || "aggregation failed");
    assert(result.output.includes("470000"), `Expected 470000 in output: ${result.output}`);
  });

  // Create test JSON
  await fs.writeFile(path.join(tmpDir, "test.json"), JSON.stringify({
    company: "ACME Corp",
    filings: [{ type: "GSTR-1", status: "filed" }, { type: "GSTR-3B", status: "pending" }]
  }));

  await test("parse_json reads and queries JSON", async () => {
    const tool = DOCUMENT_TOOLS.find((t) => t.name === "parse_json")!;
    const result = await tool.execute({ path: "test.json", query: "filings[1].type" }, ctx);
    assert(result.success, result.error || "JSON parse failed");
    assert(result.output.includes("GSTR-3B"), "Did not extract GSTR-3B");
  });

  await test("analyze_data profiles CSV", async () => {
    const tool = DOCUMENT_TOOLS.find((t) => t.name === "analyze_data")!;
    const result = await tool.execute({ path: "test-data.csv" }, ctx);
    assert(result.success, result.error || "analysis failed");
    assert(result.output.includes("DATA PROFILE"), "No profile header");
    assert(result.output.includes("Amount"), "Missing Amount column");
  });

  // 5. Memory Manager
  console.log("\n[5] Memory Manager");

  const memDir = path.join(tmpDir, "memory");
  const mem = new MemoryManager(memDir);
  await mem.init();

  await test("Memory: add and retrieve messages", async () => {
    mem.addMessage("test-session", { role: "user", content: "What is GST rate on gold?", timestamp: Date.now() });
    mem.addMessage("test-session", { role: "assistant", content: "GST on gold is 3%.", timestamp: Date.now() });
    const working = mem.getWorkingMemory("test-session");
    assert(working.length === 2, `Expected 2 messages, got ${working.length}`);
    assert(working[0].content.includes("GST"), "Message content mismatch");
  });

  await test("Memory: add and search facts", async () => {
    mem.addFact("GST rate on gold jewellery is 3% under HSN 7113", "user-session-1");
    mem.addFact("TDS under section 194J is 10% for professional fees", "user-session-2");
    mem.addFact("GSTR-1 is due by 11th of following month", "user-session-3");
    const results = mem.searchLongTerm("TDS professional fees");
    assert(results.length > 0, "No search results");
    assert(results[0].content.includes("194J"), "Wrong fact retrieved");
  });

  await test("Memory: lessons (Reflexion pattern)", async () => {
    mem.addLesson("test-session", "Always check Section 194J threshold of Rs. 30,000 before advising on TDS");
    const lessons = mem.getLessons();
    assert(lessons.length > 0, "No lessons");
    assert(lessons[0].includes("194J"), "Lesson content mismatch");
  });

  await test("Memory: context assembly", async () => {
    const context = mem.assembleContext("test-session");
    assert(context.includes("LESSONS"), "No lessons section");
  });

  await test("Memory: persistence", async () => {
    await mem.endSession("test-session");
    const mem2 = new MemoryManager(memDir);
    await mem2.init();
    const stats = mem2.getStats();
    assert(stats.longTermEntries >= 3, `Expected >=3 long-term entries, got ${stats.longTermEntries}`);
  });

  // 6. RAG Pipeline
  console.log("\n[6] RAG Pipeline");

  const ragDir = path.join(tmpDir, "rag");
  await fs.mkdir(ragDir, { recursive: true });
  const rag = new RagPipeline({ storagePath: ragDir });

  await test("RAG: ingest document", async () => {
    const count = await rag.ingest(
      `Section 194J of Income Tax Act deals with TDS on professional and technical services.
      The rate of TDS under section 194J is 10% for professional services and 2% for technical services.
      The threshold limit is Rs. 30,000 per annum per payee.
      Section 194C deals with TDS on payments to contractors at 1% for individuals and 2% for companies.`,
      "income-tax-guide.md",
      "income-tax"
    );
    assert(count > 0, `Expected >0 chunks, got ${count}`);
  });

  await test("RAG: ingest from file", async () => {
    const gstContent = `GST Registration is mandatory when turnover exceeds Rs. 40 lakhs (Rs. 20 lakhs for NE states).
    GSTR-1 must be filed by the 11th of the following month for monthly filers.
    GSTR-3B is the summary return due by 20th of following month.
    Input Tax Credit can be claimed on purchases used for taxable supplies.
    Reverse Charge Mechanism applies to services from unregistered dealers above Rs. 5,000 per day.`;
    await fs.writeFile(path.join(tmpDir, "gst-guide.txt"), gstContent);
    const count = await rag.ingestFile(path.join(tmpDir, "gst-guide.txt"), "gst");
    assert(count > 0, `Expected >0 chunks from file, got ${count}`);
  });

  await test("RAG: search finds relevant chunks", async () => {
    const results = rag.search("TDS rate on professional services");
    assert(results.length > 0, "No results");
    assert(results[0].chunk.content.includes("194J"), "Top result should mention 194J");
    assert(results[0].score > 0, "Score should be positive");
  });

  await test("RAG: search with domain filter", async () => {
    const results = rag.search("registration threshold", "gst");
    assert(results.length > 0, "No results for GST domain");
    assert(results[0].chunk.domain === "gst", "Wrong domain in results");
  });

  await test("RAG: stats", async () => {
    const stats = rag.getStats();
    assert(stats.chunks > 0, "No chunks");
    assert(stats.vocabulary > 0, "No vocabulary");
    assert(stats.domains.includes("income-tax"), "Missing income-tax domain");
    assert(stats.domains.includes("gst"), "Missing gst domain");
  });

  // 7. RAG Tools (agent-facing)
  console.log("\n[7] RAG Tools (agent-facing)");
  const ragTools = createRagTools(rag);

  await test("RAG tool: rag_search_local", async () => {
    const tool = ragTools.find((t) => t.name === "rag_search_local")!;
    const result = await tool.execute({ query: "GSTR-1 due date" }, ctx);
    assert(result.success, result.error || "RAG search tool failed");
    assert(result.output.includes("relevant chunks"), "No chunks in result");
  });

  // 8. LLM Provider Manager
  console.log("\n[8] LLM Provider Manager");

  await test("ProviderManager: register providers", async () => {
    const pm = new ProviderManager();
    pm.addProvider("test-openai", {
      provider: "openai",
      apiKey: "test-key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      maxTokens: 4096,
      temperature: 0.2,
      timeout: 30000,
    }, true);
    pm.addProvider("test-ollama", {
      provider: "ollama",
      baseUrl: "http://localhost:11434/v1",
      model: "qwen3:8b",
      maxTokens: 4096,
      temperature: 0.2,
      timeout: 30000,
    });
    assert(pm.listProviders().length === 2, `Expected 2 providers, got ${pm.listProviders().length}`);
    assert(pm.listProviders().includes("test-openai"), "Missing test-openai");
    assert(pm.listProviders().includes("test-ollama"), "Missing test-ollama");
  });

  await test("ProviderManager: routing rules", async () => {
    const pm = new ProviderManager();
    pm.addProvider("fast", {
      provider: "ollama", baseUrl: "http://localhost:11434/v1",
      model: "qwen3:8b", maxTokens: 2048, temperature: 0.2, timeout: 30000,
    }, true);
    pm.addRoutingRule({
      name: "short-to-fast",
      condition: (req) => {
        const last = req.messages[req.messages.length - 1];
        return typeof last?.content === "string" && last.content.length < 50;
      },
      provider: "fast",
    });
    // Rule should match (we can't actually call the provider but we verify registration)
    const stats = pm.getStats();
    assert("fast" in stats, "Provider not in stats");
    assert(stats.fast.totalCalls === 0, "Should have 0 calls initially");
  });

  await test("ProviderManager: stats tracking", async () => {
    const pm = new ProviderManager();
    pm.addProvider("p1", {
      provider: "openai", apiKey: "k", baseUrl: "http://invalid:9999/v1",
      model: "m", maxTokens: 100, temperature: 0, timeout: 2000,
    }, true);
    const stats = pm.getStats();
    assert(stats.p1.totalCalls === 0, "Should start at 0");
    assert(stats.p1.errors === 0, "Should start with 0 errors");
  });

  // 9. Document Pipeline (VLM Phase 3)
  console.log("\n[9] Document Pipeline (VLM)");

  const docDir = path.join(tmpDir, "documents");
  const docStorageDir = path.join(tmpDir, "doc-storage");
  await fs.mkdir(docDir, { recursive: true });

  const pipeline = new DocumentPipeline({ storagePath: docStorageDir });

  // Create test invoice CSV
  const invoiceCSV = `Invoice No,Date,GSTIN,Item,HSN,Qty,Rate,CGST,SGST,Total
INV-2026-001,15/03/2026,27AABCU9603R1ZM,Steel Bars,7214,100,Rs. 450,Rs. 4050,Rs. 4050,Rs. 53100
INV-2026-001,15/03/2026,27AABCU9603R1ZM,Cement Bags,2523,50,Rs. 350,Rs. 1575,Rs. 1575,Rs. 20650`;
  await fs.writeFile(path.join(docDir, "invoice.csv"), invoiceCSV);

  // Create test notice TXT
  const noticeTXT = `OFFICE OF THE COMMISSIONER OF INCOME TAX
Notice under Section 148 of the Income Tax Act, 1961

To: M/s ABC Enterprises
PAN: AABCA1234F
Assessment Year: 2024-25

Sir/Madam,
Whereas I have reason to believe that your income chargeable to tax for AY 2024-25
amounting to Rs. 15,00,000 has escaped assessment within the meaning of Section 147.
You are hereby required to file a return of income for AY 2024-25 within 30 days.

Date: 10/03/2026
Penalty u/s 271(1)(c) may be imposed for concealment of income.`;
  await fs.writeFile(path.join(docDir, "notice.txt"), noticeTXT);

  await test("DocumentPipeline: scan CSV invoice", async () => {
    const result = await pipeline.processDocument(path.join(docDir, "invoice.csv"));
    assert(result.documentType === "invoice", `Expected invoice, got ${result.documentType}`);
    assert(result.fields.some((f) => f.name === "GSTIN"), "No GSTIN extracted");
    assert(result.tables.length > 0, "No tables extracted from CSV");
    assert(result.tables[0].rows.length === 2, `Expected 2 rows, got ${result.tables[0].rows.length}`);
    assert(result.taxRelevance.domain === "gst", `Expected gst domain, got ${result.taxRelevance.domain}`);
  });

  await test("DocumentPipeline: scan tax notice", async () => {
    const result = await pipeline.processDocument(path.join(docDir, "notice.txt"));
    assert(result.documentType === "notice", `Expected notice, got ${result.documentType}`);
    assert(result.fields.some((f) => f.name === "PAN"), "No PAN extracted");
    assert(result.fields.some((f) => f.name === "Assessment Year"), "No AY extracted");
    assert(result.taxRelevance.references.some((r) => r.includes("148")), "No Section 148 reference");
    assert(result.taxRelevance.amounts.length > 0, "No amounts extracted");
    assert(result.taxRelevance.domain === "income-tax", `Expected income-tax, got ${result.taxRelevance.domain}`);
  });

  await test("DocumentPipeline: scan directory", async () => {
    const results = await pipeline.processDirectory(docDir);
    assert(results.length === 2, `Expected 2 documents, got ${results.length}`);
  });

  await test("DocumentPipeline: extraction persistence", async () => {
    const files = await fs.readdir(docStorageDir);
    assert(files.length >= 2, `Expected >=2 saved extractions, got ${files.length}`);
  });

  // Test document pipeline tools
  const docTools = createDocumentPipelineTools(pipeline);

  await test("DocumentPipeline tool: scan_document", async () => {
    const tool = docTools.find((t) => t.name === "scan_document")!;
    const result = await tool.execute({ path: path.join(docDir, "invoice.csv") }, ctx);
    assert(result.success, result.error || "scan failed");
    assert(result.output.includes("GSTIN"), "No GSTIN in scan output");
    assert(result.output.includes("invoice"), "No invoice type in output");
  });

  await test("DocumentPipeline tool: scan_directory", async () => {
    const tool = docTools.find((t) => t.name === "scan_directory")!;
    const result = await tool.execute({ path: docDir }, ctx);
    assert(result.success, result.error || "directory scan failed");
    assert(result.output.includes("Documents processed: 2"), "Wrong document count");
  });

  await test("DocumentPipeline: no VLM configured", async () => {
    assert(!pipeline.hasVLM(), "Should not have VLM in test environment");
  });

  // 10. RAG v2 (Hybrid Search)
  console.log("\n[10] RAG v2 (Hybrid Search)");

  const ragV2Dir = path.join(tmpDir, "rag-v2");
  const ragV2 = new RagV2Pipeline(ragV2Dir);

  await test("RAG v2: load tax corpus", async () => {
    const count = await ragV2.loadTaxCorpus();
    assert(count > 0, `Expected >0 chunks, got ${count}`);
    const stats = ragV2.getStats();
    assert(stats.sources >= 5, `Expected >=5 sources, got ${stats.sources}`);
    assert(stats.chunks >= 6, `Expected >=6 chunks, got ${stats.chunks}`);
  });

  await test("RAG v2: BM25 search for TDS rate", async () => {
    const results = ragV2.search("TDS rate on professional fees section 194J");
    assert(results.length > 0, "No results");
    const top3 = results.slice(0, 3);
    assert(top3.some((r) => r.chunk.content.includes("194J")), "194J not in top 3 results");
    assert(results[0].score > 0, "Score should be positive");
  });

  await test("RAG v2: query expansion works", async () => {
    // "tds" should expand to include "tax deducted at source"
    const results = ragV2.search("tds threshold", { expandQuery: true });
    assert(results.length > 0, "No results with expansion");
  });

  await test("RAG v2: domain filter", async () => {
    const results = ragV2.search("registration", { domain: "gst" });
    assert(results.length > 0, "No GST results");
    assert(results.every((r) => r.chunk.domain === "gst"), "Non-GST result in filtered search");
  });

  await test("RAG v2: customs search", async () => {
    const results = ragV2.search("bill of entry import duty BCD", { domain: "customs" });
    assert(results.length > 0, "No customs results");
    assert(results[0].chunk.content.includes("Customs") || results[0].chunk.content.includes("BCD"), "Wrong content");
  });

  await test("RAG v2: company law search", async () => {
    const results = ragV2.search("AGM annual return filing", { domain: "company-law" });
    assert(results.length > 0, "No company law results");
  });

  await test("RAG v2: FEMA search", async () => {
    const results = ragV2.search("LRS remittance limit", { domain: "fema" });
    assert(results.length > 0, "No FEMA results");
    assert(results[0].chunk.content.includes("250000") || results[0].chunk.content.includes("2,50,000"), "LRS limit not found");
  });

  // Test RAG v2 tools
  const ragV2Tools = createRagV2Tools(ragV2);

  await test("RAG v2 tool: knowledge_search", async () => {
    const tool = ragV2Tools.find((t) => t.name === "knowledge_search")!;
    const result = await tool.execute({ query: "GST composition scheme turnover limit" }, ctx);
    assert(result.success, result.error || "Search failed");
    assert(result.output.includes("results"), "No results header");
    assert(result.output.includes("Composition") || result.output.includes("composition"), "Composition not found");
  });

  await test("RAG v2: stats", async () => {
    const stats = ragV2.getStats();
    assert(stats.chunks > 0, "No chunks");
    assert(stats.domains["income-tax"] > 0, "No income-tax chunks");
    assert(stats.domains["gst"] > 0, "No GST chunks");
    assert(stats.domains["customs"] > 0, "No customs chunks");
  });

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });

  // Results
  const total = passed + failed;
  console.log(`\n${"=".repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed, ${total} total`);
  console.log(`${"=".repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
