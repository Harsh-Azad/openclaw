---
name: doc-analyzer
description: "Analyze, compare, and extract insights from tax documents -- Excel, Word, PDF files including financial statements, tax returns, customs tariff data, GST returns, and compliance reports. Use when: user uploads or references a document for analysis. NOT for: creating new documents from scratch."
metadata: { "jarvis": { "emoji": "📊", "category": "core", "requires": { "bins": ["node"] } } }
---

# Document Analyzer Skill

Analyze, compare, and extract insights from tax and compliance documents.

## When to Use

✅ **USE this skill when:**

- "Compare these two Excel files"
- "Analyze this balance sheet"
- "Extract data from this GST return"
- "What changed between these two customs tariff files?"
- "Summarize this financial statement"
- "Check this tax computation for errors"
- "Parse this Form 16 / Form 26AS"
- "Compare quarterly GST returns"

## When NOT to Use

❌ **DON'T use this skill when:**

- Creating new documents → use appropriate templates
- Simple text questions → use tax-chat skill
- Rate lookups only → use customs-tariff skill

## Supported Formats

| Format | Analysis Types |
|--------|---------------|
| **Excel (.xlsx, .xls)** | Compare sheets, extract data, pivot analysis, rate validation |
| **PDF** | Extract text, parse structured forms (ITR, GSTR, Form 16) |
| **Word (.docx)** | Extract content, compare drafts, review agreements |
| **CSV** | Data analysis, import/export reconciliation |

## Analysis Capabilities

### Financial Statement Analysis
```bash
node jarvis-doc-analyzer.js analyze \
  --file "balance-sheet-2025.xlsx" \
  --type "financial-statement" \
  --checks "ratio-analysis,trend,anomaly"
```

### Document Comparison
```bash
node jarvis-doc-analyzer.js compare \
  --file1 "tariff-v1.xlsx" \
  --file2 "tariff-v2.xlsx" \
  --sheet "CT2026" \
  --ignore "formatting,cosmetic"
```

### GST Return Analysis
```bash
node jarvis-doc-analyzer.js analyze \
  --file "GSTR-3B-March-2026.xlsx" \
  --type "gst-return" \
  --validate "itc-match,rate-check,hsn-reconcile"
```

### Tax Computation Review
```bash
node jarvis-doc-analyzer.js analyze \
  --file "tax-computation-2025.xlsx" \
  --type "tax-computation" \
  --checks "section-wise,deduction-limits,rate-accuracy"
```

## Comparison Features

When comparing two files:
1. **Structure comparison** -- sheets, columns, row counts
2. **Header analysis** -- column mapping differences
3. **Cell-by-cell diff** -- actual value changes
4. **Smart matching** -- match by key columns (HSN, PAN, GSTIN) not just row position
5. **Cosmetic filter** -- ignore formatting-only changes (decimals, units, casing)
6. **Summary stats** -- match percentage, change categories

## Output Format

Always provide:
1. **Executive summary** -- 2-3 line overview of findings
2. **Key metrics** -- row counts, match percentages
3. **Critical differences** -- changes that affect tax liability or compliance
4. **Detailed breakdown** -- categorized list of all changes
5. **Recommendations** -- action items based on analysis

## Notes

- Large files (>50MB) may require chunked processing
- Always preserve original files; never modify user documents
- Flag any potential data quality issues found during analysis
- For sensitive financial data, all processing happens locally
