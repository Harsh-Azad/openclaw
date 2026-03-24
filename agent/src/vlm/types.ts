/**
 * VLM Document Pipeline Types
 *
 * Based on:
 * - "Vision Language Models: A Survey of 26K Papers" (arXiv 2510.09586)
 * - "What Matters When Building VLMs?" (NeurIPS 2024)
 *
 * Documents processed by CAs/tax professionals:
 * - Invoices (GST invoices, purchase bills)
 * - Financial statements (P&L, Balance Sheet)
 * - Tax returns (ITR forms, GSTR forms)
 * - Notices and orders (from Income Tax dept, GST dept)
 * - Bank statements
 * - Contracts and agreements
 */

export type DocumentType =
  | "invoice"
  | "financial-statement"
  | "tax-return"
  | "notice"
  | "bank-statement"
  | "contract"
  | "customs-doc"
  | "unknown";

export interface DocumentMetadata {
  filename: string;
  mimeType: string;
  size: number;
  pages?: number;
  extractedAt: number;
  method: "vlm" | "text-extraction" | "csv-parse" | "json-parse";
}

export interface ExtractedField {
  name: string;
  value: string;
  confidence: number;
  location?: { page: number; bbox?: [number, number, number, number] };
}

export interface ExtractedTable {
  name: string;
  headers: string[];
  rows: string[][];
  confidence: number;
}

export interface DocumentExtractionResult {
  documentType: DocumentType;
  metadata: DocumentMetadata;
  rawText: string;
  fields: ExtractedField[];
  tables: ExtractedTable[];
  summary: string;
  taxRelevance: {
    domain: string;
    entities: string[];
    amounts: Array<{ label: string; amount: number; currency: string }>;
    dates: Array<{ label: string; date: string }>;
    references: string[];
  };
}

export interface VLMProvider {
  name: string;
  extractDocument(filePath: string, mimeType: string): Promise<DocumentExtractionResult>;
  healthCheck(): Promise<boolean>;
}
