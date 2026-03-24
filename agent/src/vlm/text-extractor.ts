/**
 * Text-Based Document Extractor (No VLM Required)
 *
 * Extracts structured data from documents using text parsing.
 * This is the fallback when no VLM is available.
 *
 * Supports: CSV, JSON, TXT, MD
 * For PDF/DOCX/XLSX: will require external tools or VLM upgrade.
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  DocumentType, DocumentMetadata, ExtractedField, ExtractedTable,
  DocumentExtractionResult, VLMProvider,
} from "./types.js";

// Indian tax patterns
const GSTIN_REGEX = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d][Z][A-Z\d]\b/g;
const PAN_REGEX = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const AMOUNT_REGEX = /(?:Rs\.?|INR|₹)\s*(\d[\d,]*\.?\d*)/gi;
const DATE_REGEX = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/g;
const SECTION_REGEX = /(?:Section|Sec\.?|u\/s)\s*(\d+[A-Z]*(?:\(\d+\))?)/gi;
const HSN_REGEX = /\bHSN\s*:?\s*(\d{4,8})\b/gi;
const SAC_REGEX = /\bSAC\s*:?\s*(\d{4,6})\b/gi;

export class TextExtractor implements VLMProvider {
  name = "text-extractor";

  async extractDocument(filePath: string, mimeType: string): Promise<DocumentExtractionResult> {
    const stat = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();

    let rawText: string;
    let tables: ExtractedTable[] = [];

    if (ext === ".csv" || ext === ".tsv") {
      const result = await this.parseCSV(filePath, ext === ".tsv" ? "\t" : ",");
      rawText = result.text;
      tables = result.tables;
    } else if (ext === ".json") {
      rawText = await this.parseJSON(filePath);
    } else {
      rawText = await fs.readFile(filePath, "utf-8");
    }

    const fields = this.extractFields(rawText);
    const docType = this.classifyDocument(rawText, fields);
    const taxRelevance = this.extractTaxRelevance(rawText);

    const metadata: DocumentMetadata = {
      filename: path.basename(filePath),
      mimeType,
      size: stat.size,
      extractedAt: Date.now(),
      method: "text-extraction",
    };

    return {
      documentType: docType,
      metadata,
      rawText: rawText.substring(0, 10000),
      fields,
      tables,
      summary: this.generateSummary(docType, fields, taxRelevance),
      taxRelevance,
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  private async parseCSV(filePath: string, delimiter: string): Promise<{ text: string; tables: ExtractedTable[] }> {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return { text: content, tables: [] };

    const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));
    const rows = lines.slice(1).map((line) =>
      line.split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ""))
    );

    return {
      text: content,
      tables: [{
        name: "main",
        headers,
        rows,
        confidence: 0.95,
      }],
    };
  }

  private async parseJSON(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, "utf-8");
    try {
      const data = JSON.parse(content);
      return JSON.stringify(data, null, 2);
    } catch {
      return content;
    }
  }

  private extractFields(text: string): ExtractedField[] {
    const fields: ExtractedField[] = [];

    // GSTIN
    const gstinMatches = text.match(GSTIN_REGEX);
    if (gstinMatches) {
      for (const gstin of [...new Set(gstinMatches)]) {
        fields.push({ name: "GSTIN", value: gstin, confidence: 0.95 });
      }
    }

    // PAN
    const panMatches = text.match(PAN_REGEX);
    if (panMatches) {
      for (const pan of [...new Set(panMatches)]) {
        if (!gstinMatches?.some((g) => g.includes(pan))) {
          fields.push({ name: "PAN", value: pan, confidence: 0.9 });
        }
      }
    }

    // Invoice number patterns
    const invMatch = text.match(/(?:Invoice|Bill|Receipt)\s*(?:No\.?|Number|#)\s*:?\s*([A-Z0-9\-\/]+)/i);
    if (invMatch) {
      fields.push({ name: "Invoice Number", value: invMatch[1], confidence: 0.85 });
    }

    // Assessment Year
    const ayMatch = text.match(/(?:Assessment|AY|A\.Y\.)\s*(?:Year)?\s*:?\s*(\d{4}\s*-\s*\d{2,4})/i);
    if (ayMatch) {
      fields.push({ name: "Assessment Year", value: ayMatch[1].trim(), confidence: 0.9 });
    }

    // Financial Year
    const fyMatch = text.match(/(?:Financial|FY|F\.Y\.)\s*(?:Year)?\s*:?\s*(\d{4}\s*-\s*\d{2,4})/i);
    if (fyMatch) {
      fields.push({ name: "Financial Year", value: fyMatch[1].trim(), confidence: 0.9 });
    }

    return fields;
  }

  private classifyDocument(text: string, fields: ExtractedField[]): DocumentType {
    const lower = text.toLowerCase();
    const hasGSTIN = fields.some((f) => f.name === "GSTIN");

    if (lower.includes("tax invoice") || lower.includes("invoice no") || lower.includes("bill of supply")) {
      return "invoice";
    }
    if (lower.includes("balance sheet") || lower.includes("profit and loss") || lower.includes("financial statement")) {
      return "financial-statement";
    }
    if (lower.includes("itr") || lower.includes("income tax return") || lower.includes("gstr-1") || lower.includes("gstr-3b")) {
      return "tax-return";
    }
    if (lower.includes("notice") || lower.includes("order") || lower.includes("demand") || lower.includes("assessment order")) {
      return "notice";
    }
    if (lower.includes("bank statement") || lower.includes("account statement") || lower.includes("transaction history")) {
      return "bank-statement";
    }
    if (lower.includes("bill of entry") || lower.includes("shipping bill") || lower.includes("customs")) {
      return "customs-doc";
    }
    if (lower.includes("agreement") || lower.includes("contract") || lower.includes("memorandum")) {
      return "contract";
    }
    if (hasGSTIN) return "invoice";
    return "unknown";
  }

  private extractTaxRelevance(text: string): DocumentExtractionResult["taxRelevance"] {
    const amounts: Array<{ label: string; amount: number; currency: string }> = [];
    let match: RegExpExecArray | null;

    const amountRegex = new RegExp(AMOUNT_REGEX.source, "gi");
    while ((match = amountRegex.exec(text)) !== null) {
      const numStr = match[1].replace(/,/g, "");
      const amount = parseFloat(numStr);
      if (!isNaN(amount) && amount > 0) {
        // Try to find label (word before "Rs.")
        const before = text.substring(Math.max(0, match.index - 40), match.index).trim();
        const labelMatch = before.match(/(\w[\w\s]{2,20})$/);
        amounts.push({
          label: labelMatch ? labelMatch[1].trim() : "Amount",
          amount,
          currency: "INR",
        });
      }
    }

    const dates: Array<{ label: string; date: string }> = [];
    const dateRegex = new RegExp(DATE_REGEX.source, "g");
    while ((match = dateRegex.exec(text)) !== null) {
      const before = text.substring(Math.max(0, match.index - 30), match.index).trim();
      const labelMatch = before.match(/(\w[\w\s]{2,15})$/);
      dates.push({ label: labelMatch ? labelMatch[1].trim() : "Date", date: match[1] });
    }

    const references: string[] = [];
    const sectionRegex = new RegExp(SECTION_REGEX.source, "gi");
    while ((match = sectionRegex.exec(text)) !== null) {
      references.push(`Section ${match[1]}`);
    }

    const hsnRegex = new RegExp(HSN_REGEX.source, "gi");
    while ((match = hsnRegex.exec(text)) !== null) {
      references.push(`HSN ${match[1]}`);
    }

    const sacRegex = new RegExp(SAC_REGEX.source, "gi");
    while ((match = sacRegex.exec(text)) !== null) {
      references.push(`SAC ${match[1]}`);
    }

    const entities: string[] = [];
    const gstinMatches = text.match(GSTIN_REGEX);
    if (gstinMatches) entities.push(...[...new Set(gstinMatches)]);
    const panMatches = text.match(PAN_REGEX);
    if (panMatches) entities.push(...[...new Set(panMatches)]);

    // Determine domain
    let domain = "general";
    const lower = text.toLowerCase();
    if (lower.includes("gst") || lower.includes("cgst") || lower.includes("sgst") || lower.includes("igst")) domain = "gst";
    else if (lower.includes("income tax") || lower.includes("tds") || lower.includes("section 194")) domain = "income-tax";
    else if (lower.includes("customs") || lower.includes("bill of entry") || lower.includes("bcd")) domain = "customs";
    else if (lower.includes("company") || lower.includes("roc") || lower.includes("mca")) domain = "company-law";
    else if (lower.includes("fema") || lower.includes("rbi") || lower.includes("foreign exchange")) domain = "fema";

    return { domain, entities: [...new Set(entities)], amounts, dates, references: [...new Set(references)] };
  }

  private generateSummary(
    docType: DocumentType,
    fields: ExtractedField[],
    taxRelevance: DocumentExtractionResult["taxRelevance"]
  ): string {
    const parts: string[] = [];
    parts.push(`Document type: ${docType}`);
    parts.push(`Tax domain: ${taxRelevance.domain}`);

    if (fields.length > 0) {
      parts.push(`Key fields: ${fields.map((f) => `${f.name}=${f.value}`).join(", ")}`);
    }
    if (taxRelevance.amounts.length > 0) {
      const total = taxRelevance.amounts.reduce((s, a) => s + a.amount, 0);
      parts.push(`Amounts found: ${taxRelevance.amounts.length} (total: Rs. ${total.toLocaleString("en-IN")})`);
    }
    if (taxRelevance.references.length > 0) {
      parts.push(`Legal references: ${taxRelevance.references.join(", ")}`);
    }
    if (taxRelevance.entities.length > 0) {
      parts.push(`Tax IDs: ${taxRelevance.entities.join(", ")}`);
    }

    return parts.join(". ");
  }
}
