/**
 * RAG v2: Hybrid Search Pipeline
 *
 * Upgrades the Phase 1 TF-IDF RAG with:
 * 1. BM25 scoring (better than raw TF-IDF for keyword search)
 * 2. Hybrid search: BM25 + TF-IDF combined with Reciprocal Rank Fusion
 * 3. Metadata-aware reranking (boost by domain, recency, authority)
 * 4. Pre-loaded Indian tax knowledge corpus
 * 5. Query expansion (synonyms for tax terms)
 *
 * Based on Enterprise RAG research (arXiv):
 * - BM25 remains competitive with dense retrievers for keyword queries
 * - Hybrid (sparse + dense) outperforms either alone
 * - Reciprocal Rank Fusion (RRF) is the simplest effective fusion method
 *
 * Upgrade path: Replace TF-IDF with BGE-M3 embeddings + pgvector
 */

import fs from "node:fs/promises";
import path from "node:path";
import { Tool, ToolResult } from "./types.js";

interface ChunkV2 {
  id: string;
  content: string;
  source: string;
  domain: string;
  authority: number;
  createdAt: number;
  metadata: Record<string, any>;
}

// Tax domain synonym map for query expansion
const TAX_SYNONYMS: Record<string, string[]> = {
  tds: ["tax deducted at source", "withholding tax", "deduction"],
  gst: ["goods and services tax", "cgst", "sgst", "igst", "utgst"],
  itr: ["income tax return", "return of income"],
  pan: ["permanent account number"],
  gstin: ["gst identification number", "gst number"],
  section: ["sec", "u/s", "under section"],
  penalty: ["fine", "interest", "late fee"],
  exemption: ["deduction", "rebate", "relief"],
  turnover: ["revenue", "sales", "receipts", "gross receipts"],
  assessment: ["scrutiny", "reassessment", "best judgment"],
  advance_tax: ["advance payment of tax", "installment"],
  capital_gains: ["ltcg", "stcg", "long term capital gains", "short term capital gains"],
  tcs: ["tax collected at source", "collection"],
  hra: ["house rent allowance"],
  lta: ["leave travel allowance", "leave travel concession"],
};

export class RagV2Pipeline {
  private chunks: ChunkV2[] = [];
  private storagePath: string;

  // BM25 parameters
  private k1 = 1.5;
  private b = 0.75;
  private avgDocLength = 0;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  async init(): Promise<void> {
    if (this.storagePath) {
      try {
        const raw = await fs.readFile(path.join(this.storagePath, "rag-v2-index.json"), "utf-8");
        const data = JSON.parse(raw);
        this.chunks = data.chunks || [];
        this.recalcAvgDocLength();
      } catch {}
    }
  }

  async ingest(content: string, source: string, domain: string, authority = 0.5, metadata: Record<string, any> = {}): Promise<number> {
    const textChunks = this.semanticChunk(content);
    let count = 0;

    for (const text of textChunks) {
      this.chunks.push({
        id: `${source}-${this.chunks.length}`,
        content: text,
        source,
        domain,
        authority,
        createdAt: Date.now(),
        metadata,
      });
      count++;
    }

    this.recalcAvgDocLength();
    await this.save();
    return count;
  }

  async ingestFile(filePath: string, domain: string, authority = 0.5): Promise<number> {
    const content = await fs.readFile(filePath, "utf-8");
    return this.ingest(content, path.basename(filePath), domain, authority, { filePath });
  }

  // Hybrid search: BM25 + keyword matching combined with RRF
  search(query: string, options: { domain?: string; maxResults?: number; expandQuery?: boolean } = {}): Array<{ chunk: ChunkV2; score: number; method: string }> {
    const limit = options.maxResults || 10;
    const expandedQuery = options.expandQuery !== false ? this.expandQuery(query) : query;

    let candidates = this.chunks;
    if (options.domain) {
      candidates = candidates.filter((c) => c.domain === options.domain);
    }

    if (candidates.length === 0) return [];

    // BM25 scoring
    const bm25Scores = this.bm25Score(expandedQuery, candidates);
    // Keyword matching (simpler, catches exact phrases)
    const keywordScores = this.keywordScore(expandedQuery, candidates);

    // Reciprocal Rank Fusion
    const bm25Ranked = this.rankByScore(bm25Scores);
    const keywordRanked = this.rankByScore(keywordScores);
    const fusedScores = this.reciprocalRankFusion([bm25Ranked, keywordRanked]);

    // Metadata-aware reranking
    const reranked = this.metadataRerank(fusedScores, candidates);

    return reranked
      .slice(0, limit)
      .filter((r) => r.score > 0)
      .map((r) => ({
        chunk: candidates[r.index],
        score: r.score,
        method: "hybrid-bm25-keyword-rrf",
      }));
  }

  // BM25 scoring
  private bm25Score(query: string, docs: ChunkV2[]): number[] {
    const queryTerms = this.tokenize(query);
    const N = docs.length;

    // Document frequency for each query term
    const df = new Map<string, number>();
    for (const term of queryTerms) {
      let count = 0;
      for (const doc of docs) {
        if (this.tokenize(doc.content).includes(term)) count++;
      }
      df.set(term, count);
    }

    return docs.map((doc) => {
      const docTokens = this.tokenize(doc.content);
      const docLength = docTokens.length;
      let score = 0;

      for (const term of queryTerms) {
        const termFreq = docTokens.filter((t) => t === term).length;
        const docFreq = df.get(term) || 0;

        // IDF component
        const idf = Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5));

        // TF component with length normalization
        const tfNorm = (termFreq * (this.k1 + 1)) /
          (termFreq + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength)));

        score += idf * tfNorm;
      }

      return score;
    });
  }

  // Simple keyword matching
  private keywordScore(query: string, docs: ChunkV2[]): number[] {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 2);

    return docs.map((doc) => {
      const contentLower = doc.content.toLowerCase();
      let score = 0;

      // Exact phrase match (high boost)
      if (contentLower.includes(queryLower)) score += 5;

      // Individual term matches
      for (const term of queryTerms) {
        const count = (contentLower.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g")) || []).length;
        score += count * 0.5;
      }

      return score;
    });
  }

  // Reciprocal Rank Fusion
  private reciprocalRankFusion(rankedLists: number[][], k = 60): Array<{ index: number; score: number }> {
    const scores = new Map<number, number>();
    const numDocs = rankedLists[0]?.length || 0;

    for (const ranked of rankedLists) {
      for (let rank = 0; rank < ranked.length; rank++) {
        const docIndex = ranked[rank];
        const current = scores.get(docIndex) || 0;
        scores.set(docIndex, current + 1 / (k + rank + 1));
      }
    }

    return Array.from(scores.entries())
      .map(([index, score]) => ({ index, score }))
      .sort((a, b) => b.score - a.score);
  }

  // Sort by score, return indices
  private rankByScore(scores: number[]): number[] {
    return scores
      .map((score, index) => ({ score, index }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.index);
  }

  // Metadata-aware reranking
  private metadataRerank(fused: Array<{ index: number; score: number }>, docs: ChunkV2[]): Array<{ index: number; score: number }> {
    return fused.map((item) => {
      const doc = docs[item.index];
      let boost = 1.0;

      // Authority boost (official sources score higher)
      boost *= 1 + doc.authority * 0.3;

      // Recency boost (newer documents score slightly higher)
      const ageHours = (Date.now() - doc.createdAt) / (1000 * 60 * 60);
      if (ageHours < 24) boost *= 1.1;
      else if (ageHours < 168) boost *= 1.05;

      return { index: item.index, score: item.score * boost };
    }).sort((a, b) => b.score - a.score);
  }

  // Query expansion with tax synonyms
  private expandQuery(query: string): string {
    let expanded = query;
    const lower = query.toLowerCase();

    for (const [term, synonyms] of Object.entries(TAX_SYNONYMS)) {
      if (lower.includes(term)) {
        expanded += " " + synonyms.join(" ");
      }
      for (const syn of synonyms) {
        if (lower.includes(syn)) {
          expanded += " " + term;
        }
      }
    }

    return expanded;
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((t) => t.length > 2);
  }

  private semanticChunk(text: string, maxSize = 500): string[] {
    const chunks: string[] = [];
    const paragraphs = text.split(/\n{2,}|\n(?=#{1,3}\s)|(?=Section\s+\d)|(?=Article\s+\d)/);
    let current = "";

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      if (current.length + trimmed.length > maxSize) {
        if (current) chunks.push(current.trim());
        current = trimmed;
      } else {
        current += "\n\n" + trimmed;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    if (chunks.length === 0 && text.length > 0) {
      for (let i = 0; i < text.length; i += maxSize * 0.8) {
        chunks.push(text.substring(i, i + maxSize));
      }
    }
    return chunks;
  }

  private recalcAvgDocLength(): void {
    if (this.chunks.length === 0) { this.avgDocLength = 100; return; }
    const total = this.chunks.reduce((s, c) => s + this.tokenize(c.content).length, 0);
    this.avgDocLength = total / this.chunks.length;
  }

  private async save(): Promise<void> {
    if (!this.storagePath) return;
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      await fs.writeFile(
        path.join(this.storagePath, "rag-v2-index.json"),
        JSON.stringify({ chunks: this.chunks })
      );
    } catch {}
  }

  // Load pre-built Indian tax corpus
  async loadTaxCorpus(): Promise<number> {
    let total = 0;

    // Core Indian tax knowledge
    const corpus: Array<{ content: string; source: string; domain: string; authority: number }> = [
      {
        source: "income-tax-act-overview",
        domain: "income-tax",
        authority: 0.9,
        content: `Income Tax Act, 1961 -- Key Provisions Summary

Section 2(24): Definition of Income -- includes salary, house property income, profits and gains of business/profession, capital gains, income from other sources.

Section 4: Charge of Income Tax -- income tax shall be charged for any assessment year at the rates applicable.

Section 5: Scope of total income -- Resident: worldwide income. Non-resident: Indian income only. RNOR: Indian income + foreign income from Indian business.

Section 10: Exempt Incomes -- HRA (10(13A)), LTA (10(5)), children education (10(14)), gratuity (10(10)), commuted pension (10(10A)), leave encashment (10(10AA)), PPF interest (10(11)), LTCG on equity up to Rs 1.25 lakh (10(38)).

Section 80C: Deduction up to Rs 1.5 lakh for LIC, PPF, ELSS, tuition fees, home loan principal, FD (5-year).
Section 80D: Medical insurance premium deduction -- Rs 25,000 (self), Rs 25,000 (parents), Rs 50,000 if senior citizen.
Section 80E: Education loan interest deduction (no limit, up to 8 years).
Section 80G: Donations -- 50% or 100% deduction depending on institution.
Section 80TTA: Savings account interest deduction up to Rs 10,000.
Section 80TTB: Senior citizen interest deduction up to Rs 50,000.

New Tax Regime (Section 115BAC): Default from AY 2024-25. Rates: 0-3L: nil, 3-7L: 5%, 7-10L: 10%, 10-12L: 15%, 12-15L: 20%, 15L+: 30%. Standard deduction Rs 75,000.`,
      },
      {
        source: "tds-comprehensive-guide",
        domain: "income-tax",
        authority: 0.95,
        content: `TDS (Tax Deducted at Source) -- Comprehensive Rate Chart

Section 192: Salary -- Average rate of income tax. No threshold.
Section 193: Interest on securities -- 10%. Threshold: Rs 10,000.
Section 194: Dividends -- 10%. Threshold: Rs 5,000.
Section 194A: Interest (non-securities) -- 10%. Threshold: Rs 40,000 (Rs 50,000 for senior citizens).
Section 194B: Lottery/crossword -- 30%. Threshold: Rs 10,000.
Section 194C: Contractor payments -- 1% (individual/HUF), 2% (others). Threshold: Rs 30,000 single / Rs 1,00,000 aggregate.
Section 194D: Insurance commission -- 5%. Threshold: Rs 15,000.
Section 194H: Commission/brokerage -- 5%. Threshold: Rs 15,000.
Section 194I: Rent -- 2% (plant/machinery), 10% (land/building/furniture). Threshold: Rs 2,40,000.
Section 194J: Professional/technical fees -- 10% (professional), 2% (technical). Threshold: Rs 30,000.
Section 194K: Mutual fund units -- 10%. Threshold: Rs 5,000.
Section 194N: Cash withdrawal -- 2% above Rs 1 crore (5% for non-filers).
Section 194O: E-commerce -- 1%. Threshold: Rs 5,00,000.
Section 194Q: Purchase of goods -- 0.1%. Threshold: Rs 50,00,000.
Section 194R: Perquisites/benefits -- 10%. Threshold: Rs 20,000.
Section 194S: Virtual digital assets -- 1%. Threshold: Rs 10,000 (Rs 50,000 for specified persons).

TDS Return Due Dates: Q1 (31 July), Q2 (31 October), Q3 (31 January), Q4 (31 May).
TDS Certificate: Form 16 (salary), Form 16A (non-salary) -- within 15 days of filing return.
Non-deduction penalty: Section 271C -- equal to TDS amount.
Late deposit interest: 1.5% per month from date of deduction to date of deposit.`,
      },
      {
        source: "gst-comprehensive-guide",
        domain: "gst",
        authority: 0.95,
        content: `GST (Goods and Services Tax) -- Comprehensive Guide

Registration: Mandatory when turnover exceeds Rs 40 lakhs (Rs 20 lakhs for NE/special states, Rs 10 lakhs for specified categories). Voluntary registration allowed.

Tax Structure:
- CGST + SGST: Intra-state supply (Central + State)
- IGST: Inter-state supply (Integrated)
- Rates: 0%, 5%, 12%, 18%, 28% + Compensation Cess on luxury/sin goods

Returns:
- GSTR-1: Outward supplies, due 11th of following month (monthly) or 13th of following quarter (QRMP)
- GSTR-3B: Summary return, due 20th of following month (monthly) or 22nd/24th (QRMP)
- GSTR-9: Annual return, due 31st December of following FY
- GSTR-9C: Reconciliation statement (turnover > Rs 5 crore), due 31st December

Input Tax Credit (ITC):
- Available on goods/services used for taxable supplies
- Blocked credits: Section 17(5) -- motor vehicles, food & beverages, personal consumption, membership fees, beauty treatment
- ITC reversal required when payment not made within 180 days
- 2A/2B reconciliation mandatory before claiming ITC

Composition Scheme: Turnover up to Rs 1.5 crore (Rs 75 lakh for services).
Rate: 1% for manufacturers, 5% for restaurants, 6% for other service providers.
No ITC allowed, no inter-state supply, no e-commerce.

Penalties:
- Late return filing: Rs 50/day (CGST Rs 25 + SGST Rs 25), max Rs 10,000
- Late payment: 18% interest per annum
- Fraud/wilful misstatement: 100% of tax amount as penalty`,
      },
      {
        source: "customs-guide",
        domain: "customs",
        authority: 0.9,
        content: `India Customs -- Key Provisions

Customs Act, 1962:
- Section 12: Charging section for customs duty
- Section 14: Valuation -- transaction value is the basis
- Section 17: Assessment of duty
- Section 27: Refund of duty
- Section 28: Recovery of duties not levied/short-levied
- Section 46: Bill of Entry for imports
- Section 50: Shipping Bill for exports

Duty Components:
- BCD (Basic Customs Duty): Varies by HS code (0% to 150%)
- IGST: Applicable on imports (charged on assessable value + BCD + SWS)
- SWS (Social Welfare Surcharge): 10% of BCD
- Anti-dumping duty, Safeguard duty, Countervailing duty (case-specific)

Assessable Value = CIF + landing charges (1% of CIF)
Total Duty = BCD + SWS on BCD + IGST on (AV + BCD + SWS)

Free Trade Agreements: ASEAN, South Korea, Japan, Singapore, UAE, Australia, EFTA.
Duty exemption may apply with Certificate of Origin.

Import Procedures:
1. Obtain IEC (Import Export Code) from DGFT
2. File Bill of Entry through ICEGATE
3. Assessment by customs officer
4. Pay duty through electronic payment
5. Examination of goods (if selected)
6. Out of Charge order
7. Goods released`,
      },
      {
        source: "company-law-guide",
        domain: "company-law",
        authority: 0.85,
        content: `Companies Act, 2013 -- Key Compliance for Practicing CAs

Annual Filings:
- AGM: Within 6 months from close of FY (private: 15 months for first AGM)
- Annual Return (MGT-7/MGT-7A): Within 60 days of AGM
- Financial Statements (AOC-4): Within 30 days of AGM
- DIR-3 KYC: Directors KYC by 30th September every year
- ADT-1: Appointment of auditor within 15 days of AGM

Board Meetings:
- Minimum 4 per year
- Gap between two meetings: not more than 120 days
- One Person Company/Small Company: minimum 2 per half year

CSR (Corporate Social Responsibility):
- Applicable if: Net worth >= Rs 500 crore OR Turnover >= Rs 1000 crore OR Net profit >= Rs 5 crore
- Spend: 2% of average net profit of preceding 3 FYs
- CSR Committee required with at least 3 directors (1 independent)

Related Party Transactions:
- Board approval required for all RPTs
- Shareholders approval for material RPTs (exceeding thresholds in Section 188)
- Disclosure in AOC-2

Penalties for non-compliance:
- Late filing of annual return: Rs 100/day per director
- Non-holding of AGM: Rs 1 lakh on company + Rs 5,000/day on officers
- Non-appointment of auditor: Rs 25,000 to Rs 5 lakh`,
      },
      {
        source: "fema-guide",
        domain: "fema",
        authority: 0.85,
        content: `FEMA (Foreign Exchange Management Act, 1999) -- Key Provisions

Liberalised Remittance Scheme (LRS):
- Limit: USD 2,50,000 per financial year per individual
- Allowed: Education, medical, travel, gifts, donations, investments abroad
- TCS on LRS: 20% (5% for education with loan)
- No LRS for: Margin/lottery/gambling, banned commodities, real estate

FDI (Foreign Direct Investment):
- Automatic Route: Most sectors (100% allowed in most cases)
- Government Route: Defence (>74%), media, multi-brand retail, etc.
- Prohibited: Lottery, gambling, real estate, Nidhi company, trading in TFCs, chit funds, atomic energy

ECB (External Commercial Borrowings):
- All-in cost ceiling: Benchmark rate + 550 bps
- Minimum average maturity: 3 years (up to USD 50M), 5 years (above)
- ECB cannot be used for: Real estate, stock market, on-lending

ODI (Overseas Direct Investment):
- Limit: 400% of net worth of Indian entity
- Round-tripping prohibited
- Annual return in Form ODI Part II

Compliance:
- Annual Return on Foreign Liabilities and Assets (FLA): By 15th July
- FC-GPR: Foreign investment reporting within 30 days
- Form ODI: Overseas investment reporting
- FEMA violations: Penalty up to 3 times the amount (civil), imprisonment up to 5 years (criminal)`,
      },
    ];

    for (const doc of corpus) {
      const count = await this.ingest(doc.content, doc.source, doc.domain, doc.authority);
      total += count;
    }

    return total;
  }

  getStats(): { chunks: number; domains: Record<string, number>; sources: number } {
    const domains: Record<string, number> = {};
    const sources = new Set<string>();
    for (const chunk of this.chunks) {
      domains[chunk.domain] = (domains[chunk.domain] || 0) + 1;
      sources.add(chunk.source);
    }
    return { chunks: this.chunks.length, domains, sources: sources.size };
  }
}

// Agent tools for RAG v2
export function createRagV2Tools(pipeline: RagV2Pipeline): Tool[] {
  const searchTool: Tool = {
    name: "knowledge_search",
    description: "Search the Indian tax knowledge base using hybrid search (BM25 + keyword + query expansion). Returns the most relevant passages about GST, Income Tax, Customs, Company Law, FEMA with relevance scores.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        domain: { type: "string", enum: ["gst", "income-tax", "customs", "company-law", "fema"], description: "Filter by tax domain" },
        maxResults: { type: "number", description: "Max results (default: 5)" },
      },
      required: ["query"],
    },
    riskLevel: "low",
    execute: async (params, _ctx) => {
      const results = pipeline.search(params.query, {
        domain: params.domain,
        maxResults: params.maxResults || 5,
        expandQuery: true,
      });

      if (results.length === 0) {
        return { success: true, output: "No relevant documents found in the knowledge base." };
      }

      const formatted = results.map((r, i) =>
        `[${i + 1}] Score: ${r.score.toFixed(3)} | Source: ${r.chunk.source} | Domain: ${r.chunk.domain}\n${r.chunk.content.substring(0, 400)}`
      ).join("\n\n---\n\n");

      return { success: true, output: `Found ${results.length} results:\n\n${formatted}` };
    },
  };

  const ingestTool: Tool = {
    name: "knowledge_ingest",
    description: "Add a document to the knowledge base for future retrieval.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        domain: { type: "string", description: "Tax domain" },
      },
      required: ["path", "domain"],
    },
    riskLevel: "low",
    execute: async (params, ctx) => {
      try {
        const p = path.resolve(ctx.workingDirectory, params.path);
        const count = await pipeline.ingestFile(p, params.domain);
        const stats = pipeline.getStats();
        return { success: true, output: `Ingested ${count} chunks. Total: ${stats.chunks} chunks across ${stats.sources} sources.` };
      } catch (e: any) {
        return { success: false, output: "", error: `Ingest failed: ${e.message}` };
      }
    },
  };

  return [searchTool, ingestTool];
}
