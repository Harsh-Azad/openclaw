/**
 * VLM (Vision-Language Model) Provider
 *
 * Uses a local or remote VLM to extract structured data from document images.
 * Production target: Qwen2.5-VL-72B via vLLM.
 *
 * Based on "Re-Align: Aligning VLMs via Retrieval-Augmented Feedback" (EMNLP 2025)
 * and "What Matters When Building VLMs?" (NeurIPS 2024):
 * - Structured extraction prompt with JSON output
 * - Tax-domain-specific field list
 * - Confidence scoring
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  DocumentExtractionResult, DocumentMetadata, VLMProvider,
} from "./types.js";

export class VLMDocumentProvider implements VLMProvider {
  name: string;
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(config: { baseUrl: string; apiKey?: string; model?: string }) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey || "";
    this.model = config.model || "Qwen2.5-VL-72B-Instruct";
    this.name = `vlm:${this.model}`;
  }

  async extractDocument(filePath: string, mimeType: string): Promise<DocumentExtractionResult> {
    const stat = await fs.stat(filePath);
    const fileBuffer = await fs.readFile(filePath);
    const base64 = fileBuffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const extractionPrompt = `You are an expert Indian tax document analyzer. Extract ALL structured information from this document.

Return a JSON object with these exact fields:
{
  "documentType": "invoice|financial-statement|tax-return|notice|bank-statement|contract|customs-doc|unknown",
  "rawText": "full text content visible in the document",
  "fields": [
    {"name": "field_name", "value": "extracted_value", "confidence": 0.0-1.0}
  ],
  "tables": [
    {"name": "table_name", "headers": ["col1", "col2"], "rows": [["val1", "val2"]], "confidence": 0.0-1.0}
  ],
  "summary": "one-paragraph summary of the document",
  "taxRelevance": {
    "domain": "gst|income-tax|customs|company-law|fema|general",
    "entities": ["GSTIN/PAN numbers found"],
    "amounts": [{"label": "description", "amount": 0, "currency": "INR"}],
    "dates": [{"label": "description", "date": "DD/MM/YYYY"}],
    "references": ["Section 194J", "HSN 8471", etc]
  }
}

Extract ALL GSTINs, PANs, invoice numbers, amounts, dates, HSN/SAC codes, section references.
For amounts, identify what each amount represents (tax, total, subtotal, penalty, etc).
Only output valid JSON, nothing else.`;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              { type: "text", text: extractionPrompt },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      throw new Error(`VLM API error ${response.status}: ${await response.text().catch(() => "")}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const extracted = JSON.parse(jsonStr);

    const metadata: DocumentMetadata = {
      filename: path.basename(filePath),
      mimeType,
      size: stat.size,
      extractedAt: Date.now(),
      method: "vlm",
    };

    return {
      documentType: extracted.documentType || "unknown",
      metadata,
      rawText: extracted.rawText || "",
      fields: extracted.fields || [],
      tables: extracted.tables || [],
      summary: extracted.summary || "",
      taxRelevance: extracted.taxRelevance || { domain: "general", entities: [], amounts: [], dates: [], references: [] },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
