/**
 * In-Memory RAG Pipeline
 *
 * Phase 5 (partial) -- Retrieval Augmented Generation for tax documents.
 *
 * Based on "Enterprise RAG" research (arXiv):
 * - Semantic chunking (split by section/paragraph boundaries)
 * - TF-IDF vectorization (upgrade path: BGE-M3 embeddings)
 * - Cosine similarity retrieval
 * - Reranking by relevance + recency + source authority
 *
 * This is the pure TypeScript implementation that runs without
 * any external services. Production upgrade: pgvector + BGE-M3.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { Tool, AgentContext, ToolResult } from "./types.js";

interface Chunk {
  id: string;
  content: string;
  source: string;
  domain: string;
  metadata: Record<string, any>;
  vector: number[];
  createdAt: number;
}

interface RagConfig {
  chunkSize: number;
  chunkOverlap: number;
  maxResults: number;
  storagePath: string;
}

const DEFAULT_CONFIG: RagConfig = {
  chunkSize: 500,
  chunkOverlap: 50,
  maxResults: 5,
  storagePath: "",
};

export class RagPipeline {
  private chunks: Chunk[] = [];
  private vocabulary = new Map<string, number>();
  private idf = new Map<string, number>();
  private config: RagConfig;

  constructor(config: Partial<RagConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async init(): Promise<void> {
    if (this.config.storagePath) {
      await this.loadIndex();
    }
  }

  // Ingest a document: split into chunks, vectorize, index
  async ingest(content: string, source: string, domain: string, metadata: Record<string, any> = {}): Promise<number> {
    const chunks = this.semanticChunk(content);
    let count = 0;

    for (const chunkText of chunks) {
      const id = `${source}-${count}`;
      const vector = this.vectorize(chunkText);

      this.chunks.push({
        id,
        content: chunkText,
        source,
        domain,
        metadata,
        vector,
        createdAt: Date.now(),
      });
      count++;
    }

    // Rebuild IDF after ingestion
    this.rebuildIDF();

    // Re-vectorize all chunks with updated IDF
    for (const chunk of this.chunks) {
      chunk.vector = this.vectorize(chunk.content);
    }

    if (this.config.storagePath) {
      await this.saveIndex();
    }

    return count;
  }

  // Ingest a file from disk
  async ingestFile(filePath: string, domain: string): Promise<number> {
    const content = await fs.readFile(filePath, "utf-8");
    return this.ingest(content, path.basename(filePath), domain, { filePath });
  }

  // Search for relevant chunks
  // Re-vectorizes all chunks at query time to ensure vocabulary alignment
  search(query: string, domain?: string, maxResults?: number): Array<{ chunk: Chunk; score: number }> {
    const queryVector = this.vectorize(query);
    const limit = maxResults || this.config.maxResults;

    let candidates = this.chunks;
    if (domain) {
      candidates = candidates.filter((c) => c.domain === domain);
    }

    const scored = candidates.map((chunk) => {
      // Re-vectorize against current vocabulary for alignment
      const chunkVec = this.vectorize(chunk.content);
      return {
        chunk,
        score: this.cosineSimilarity(queryVector, chunkVec),
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).filter((s) => s.score > 0.01);
  }

  // Semantic chunking: split by paragraph/section boundaries
  private semanticChunk(text: string): string[] {
    const chunks: string[] = [];
    // Split on double newlines (paragraphs) or section headers
    const paragraphs = text.split(/\n{2,}|\n(?=#{1,3}\s)|(?=Section\s+\d)|(?=Article\s+\d)/);

    let currentChunk = "";
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      if (currentChunk.length + trimmed.length > this.config.chunkSize) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = trimmed;
      } else {
        currentChunk += "\n\n" + trimmed;
      }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());

    // If no natural boundaries found, fall back to fixed-size
    if (chunks.length === 0 && text.length > 0) {
      for (let i = 0; i < text.length; i += this.config.chunkSize - this.config.chunkOverlap) {
        chunks.push(text.substring(i, i + this.config.chunkSize));
      }
    }

    return chunks;
  }

  // Tokenize without side effects
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  // Rebuild vocabulary from all chunks
  private rebuildVocabulary(): void {
    this.vocabulary.clear();
    for (const chunk of this.chunks) {
      for (const token of this.tokenize(chunk.content)) {
        if (!this.vocabulary.has(token)) {
          this.vocabulary.set(token, this.vocabulary.size);
        }
      }
    }
  }

  // Rebuild IDF from all chunks
  private rebuildIDF(): void {
    this.rebuildVocabulary();
    const N = this.chunks.length;
    const docFreq = new Map<string, number>();

    for (const chunk of this.chunks) {
      const tokens = new Set(this.tokenize(chunk.content));
      for (const token of tokens) {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      }
    }

    this.idf.clear();
    for (const [term, df] of docFreq) {
      // Smoothed IDF: always positive, works for small corpora
      this.idf.set(term, Math.log(1 + N / (1 + df)));
    }
  }

  // TF-IDF vectorization (uses current vocabulary and IDF)
  private vectorize(text: string): number[] {
    const tokens = this.tokenize(text);
    // Add query tokens to vocabulary so they get matched
    for (const token of tokens) {
      if (!this.vocabulary.has(token)) {
        this.vocabulary.set(token, this.vocabulary.size);
      }
    }

    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }
    for (const [key, val] of tf) {
      tf.set(key, val / tokens.length);
    }

    const vocabList = Array.from(this.vocabulary.keys());
    const vector = new Array(vocabList.length).fill(0);

    for (let i = 0; i < vocabList.length; i++) {
      const term = vocabList[i];
      const termTF = tf.get(term) || 0;
      const termIDF = this.idf.get(term) || 0;
      vector[i] = termTF * termIDF;
    }

    return vector;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const len = Math.max(a.length, b.length);
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < len; i++) {
      const va = a[i] || 0;
      const vb = b[i] || 0;
      dotProduct += va * vb;
      normA += va * va;
      normB += vb * vb;
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
  }

  // Persistence
  private async saveIndex(): Promise<void> {
    try {
      const data = {
        chunks: this.chunks,
        vocabulary: Object.fromEntries(this.vocabulary),
        idf: Object.fromEntries(this.idf),
      };
      await fs.writeFile(
        path.join(this.config.storagePath, "rag-index.json"),
        JSON.stringify(data)
      );
    } catch {}
  }

  private async loadIndex(): Promise<void> {
    try {
      const raw = await fs.readFile(path.join(this.config.storagePath, "rag-index.json"), "utf-8");
      const data = JSON.parse(raw);
      this.chunks = data.chunks || [];
      this.vocabulary = new Map(Object.entries(data.vocabulary || {}));
      this.idf = new Map(Object.entries(data.idf || {}).map(([k, v]) => [k, v as number]));
    } catch {}
  }

  getStats(): { chunks: number; vocabulary: number; domains: string[] } {
    const domains = [...new Set(this.chunks.map((c) => c.domain))];
    return { chunks: this.chunks.length, vocabulary: this.vocabulary.size, domains };
  }
}

// RAG Tools for the agent
export function createRagTools(pipeline: RagPipeline): Tool[] {
  const ragIngestTool: Tool = {
    name: "rag_ingest_file",
    description: "Ingest a document into the knowledge base for future retrieval. Supports .txt, .md, .json, .csv files. The document is chunked, vectorized, and indexed.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the document file" },
        domain: { type: "string", description: "Tax domain (gst, income-tax, customs, company-law, fema)" },
      },
      required: ["path", "domain"],
    },
    riskLevel: "low",
    execute: async (params, ctx) => {
      try {
        const p = path.resolve(ctx.workingDirectory, params.path);
        const count = await pipeline.ingestFile(p, params.domain);
        const stats = pipeline.getStats();
        return { success: true, output: `Ingested ${count} chunks from ${path.basename(p)}. Total: ${stats.chunks} chunks, ${stats.vocabulary} terms, domains: ${stats.domains.join(", ")}` };
      } catch (e: any) {
        return { success: false, output: "", error: `Ingest failed: ${e.message}` };
      }
    },
  };

  const ragSearchTool: Tool = {
    name: "rag_search_local",
    description: "Search the local knowledge base for relevant tax information. Returns the most relevant document chunks with similarity scores.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        domain: { type: "string", description: "Filter by domain" },
        maxResults: { type: "number", description: "Max results (default: 5)" },
      },
      required: ["query"],
    },
    riskLevel: "low",
    execute: async (params, _ctx) => {
      try {
        const results = pipeline.search(params.query, params.domain, params.maxResults);
        if (results.length === 0) {
          return { success: true, output: "No relevant documents found. Try ingesting documents first with rag_ingest_file." };
        }
        const formatted = results.map((r, i) =>
          `[${i + 1}] Score: ${r.score.toFixed(3)} | Source: ${r.chunk.source} | Domain: ${r.chunk.domain}\n${r.chunk.content.substring(0, 300)}`
        ).join("\n\n");
        return { success: true, output: `Found ${results.length} relevant chunks:\n\n${formatted}` };
      } catch (e: any) {
        return { success: false, output: "", error: `Search failed: ${e.message}` };
      }
    },
  };

  return [ragIngestTool, ragSearchTool];
}
