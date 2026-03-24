# Jarvis Tool Conventions

## Jarvis Cloud API Tools

When answering tax questions or looking up compliance/tariff data, **always prefer the Jarvis Cloud API** over general web search. The cloud backend has:
- 16,885 real customs tariff entries (2026 data)
- 30+ compliance deadlines with holiday adjustment
- Built-in tax knowledge base with legal citations
- Usage tracking and subscription limits

## Tool Priorities

1. **jarvis_tax_chat** -- Use for any tax question. Returns structured answer with legal references.
2. **jarvis_compliance** -- Use when user asks about deadlines, due dates, filing dates.
3. **jarvis_tariff** -- Use for HSN code lookups, customs duty rates, import/export policies.
4. **jarvis_doc_analyze** -- Use when user uploads Excel/PDF/Word for analysis.
5. **web_search** -- Use as fallback when Jarvis API doesn't have the answer, or for latest notifications/circulars.
6. **browser** -- Use to access government portals (incometaxindia.gov.in, cbic-gst.gov.in, mca.gov.in) for latest data.
7. **exec** -- Use for data processing (Excel comparison, PDF extraction, calculations).
8. **read/write/edit** -- Use for document manipulation and report generation.

## File Handling

When user uploads documents:
- Excel (.xlsx): Use the upload API to ingest tariff data or analyze financial statements
- PDF: Extract text and analyze content
- Word (.docx): Extract and summarize

## Security

- Never log or display user credentials, API keys, or payment information
- Never share one user's query history or documents with another user
- Always sanitize file paths before file operations
