/**
 * Document Processing Pipeline
 *
 * Orchestrates document ingestion:
 * 1. Detect file type
 * 2. Route to appropriate extractor (VLM for images/PDFs, text for CSV/JSON/TXT)
 * 3. Extract structured data
 * 4. Validate and enrich with tax domain knowledge
 * 5. Store in RAG for future retrieval
 *
 * This is the core of the "Cowork-level" document understanding capability.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { DocumentExtractionResult, VLMProvider } from "./types.js";
import { TextExtractor } from "./text-extractor.js";
import { VLMDocumentProvider } from "./vlm-provider.js";
import { Tool, AgentContext, ToolResult } from "../types.js";

interface PipelineConfig {
  vlmBaseUrl?: string;
  vlmApiKey?: string;
  vlmModel?: string;
  storagePath: string;
}

export class DocumentPipeline {
  private textExtractor: TextExtractor;
  private vlmProvider: VLMDocumentProvider | null = null;
  private storagePath: string;
  private processedDocs: DocumentExtractionResult[] = [];

  constructor(config: PipelineConfig) {
    this.textExtractor = new TextExtractor();
    this.storagePath = config.storagePath;

    if (config.vlmBaseUrl) {
      this.vlmProvider = new VLMDocumentProvider({
        baseUrl: config.vlmBaseUrl,
        apiKey: config.vlmApiKey,
        model: config.vlmModel,
      });
    }
  }

  async processDocument(filePath: string): Promise<DocumentExtractionResult> {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = this.getMimeType(ext);

    let result: DocumentExtractionResult;

    if (this.isImageOrPDF(ext) && this.vlmProvider) {
      // VLM path: send image/PDF to vision model
      try {
        result = await this.vlmProvider.extractDocument(filePath, mimeType);
      } catch (e: any) {
        // Fallback to text extraction if VLM fails
        result = await this.textExtractor.extractDocument(filePath, mimeType);
        result.metadata.method = "text-extraction";
      }
    } else {
      // Text path: CSV, JSON, TXT, MD
      result = await this.textExtractor.extractDocument(filePath, mimeType);
    }

    this.processedDocs.push(result);

    // Persist extraction result
    await this.saveResult(result);

    return result;
  }

  async processDirectory(dirPath: string, extensions?: string[]): Promise<DocumentExtractionResult[]> {
    const results: DocumentExtractionResult[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions && !extensions.includes(ext)) continue;

      try {
        const result = await this.processDocument(path.join(dirPath, entry.name));
        results.push(result);
      } catch {}
    }

    return results;
  }

  getProcessedDocs(): DocumentExtractionResult[] {
    return this.processedDocs;
  }

  hasVLM(): boolean {
    return this.vlmProvider !== null;
  }

  private isImageOrPDF(ext: string): boolean {
    return [".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp"].includes(ext);
  }

  private getMimeType(ext: string): string {
    const map: Record<string, string> = {
      ".pdf": "application/pdf",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".tiff": "image/tiff",
      ".bmp": "image/bmp",
      ".webp": "image/webp",
      ".csv": "text/csv",
      ".tsv": "text/tab-separated-values",
      ".json": "application/json",
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".xml": "text/xml",
      ".html": "text/html",
    };
    return map[ext] || "application/octet-stream";
  }

  private async saveResult(result: DocumentExtractionResult): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      const filename = `${result.metadata.filename}-${result.metadata.extractedAt}.json`;
      await fs.writeFile(
        path.join(this.storagePath, filename),
        JSON.stringify(result, null, 2)
      );
    } catch {}
  }
}

// Agent tools for document pipeline
export function createDocumentPipelineTools(pipeline: DocumentPipeline): Tool[] {
  const scanDocTool: Tool = {
    name: "scan_document",
    description: "Scan and extract structured data from a tax document (invoice, financial statement, tax return, notice, bank statement). Extracts GSTIN, PAN, amounts, dates, HSN codes, section references. Supports CSV, JSON, TXT files. PDF/image support requires VLM.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the document file" },
      },
      required: ["path"],
    },
    riskLevel: "low",
    execute: async (params, ctx) => {
      try {
        const p = path.resolve(ctx.workingDirectory, params.path);
        const result = await pipeline.processDocument(p);

        let output = `DOCUMENT SCAN RESULT\n`;
        output += `Type: ${result.documentType} | Domain: ${result.taxRelevance.domain}\n`;
        output += `Method: ${result.metadata.method} | Size: ${result.metadata.size} bytes\n\n`;
        output += `SUMMARY: ${result.summary}\n\n`;

        if (result.fields.length > 0) {
          output += `FIELDS (${result.fields.length}):\n`;
          for (const f of result.fields) {
            output += `  ${f.name}: ${f.value} (confidence: ${(f.confidence * 100).toFixed(0)}%)\n`;
          }
          output += "\n";
        }

        if (result.tables.length > 0) {
          output += `TABLES (${result.tables.length}):\n`;
          for (const t of result.tables) {
            output += `  ${t.name}: ${t.headers.join(", ")} (${t.rows.length} rows)\n`;
          }
          output += "\n";
        }

        if (result.taxRelevance.amounts.length > 0) {
          output += `AMOUNTS:\n`;
          for (const a of result.taxRelevance.amounts) {
            output += `  ${a.label}: ${a.currency} ${a.amount.toLocaleString("en-IN")}\n`;
          }
          output += "\n";
        }

        if (result.taxRelevance.references.length > 0) {
          output += `LEGAL REFERENCES: ${result.taxRelevance.references.join(", ")}\n`;
        }

        return { success: true, output };
      } catch (e: any) {
        return { success: false, output: "", error: `Document scan failed: ${e.message}` };
      }
    },
  };

  const scanDirectoryTool: Tool = {
    name: "scan_directory",
    description: "Scan all documents in a directory and extract structured data from each. Returns a summary of all documents found.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path" },
        extensions: { type: "string", description: "Comma-separated extensions to process (e.g. '.csv,.json,.txt')" },
      },
      required: ["path"],
    },
    riskLevel: "low",
    execute: async (params, ctx) => {
      try {
        const dir = path.resolve(ctx.workingDirectory, params.path);
        const exts = params.extensions ? params.extensions.split(",").map((e: string) => e.trim()) : undefined;
        const results = await pipeline.processDirectory(dir, exts);

        let output = `DIRECTORY SCAN: ${dir}\n`;
        output += `Documents processed: ${results.length}\n\n`;

        for (const r of results) {
          output += `- ${r.metadata.filename} [${r.documentType}] ${r.taxRelevance.domain}`;
          if (r.taxRelevance.amounts.length > 0) {
            const total = r.taxRelevance.amounts.reduce((s, a) => s + a.amount, 0);
            output += ` | Rs. ${total.toLocaleString("en-IN")}`;
          }
          output += "\n";
        }

        return { success: true, output };
      } catch (e: any) {
        return { success: false, output: "", error: `Directory scan failed: ${e.message}` };
      }
    },
  };

  return [scanDocTool, scanDirectoryTool];
}
