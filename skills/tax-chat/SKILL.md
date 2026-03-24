---
name: tax-chat
description: "AI-powered tax consultation assistant for Indian tax laws (GST, Income Tax, Customs, Company Law, FEMA). Use when: user asks any tax-related question, needs guidance on compliance, wants to understand tax provisions, or needs help with tax planning. NOT for: filing returns directly, making payments, or legal representation."
metadata: { "jarvis": { "emoji": "💼", "category": "core", "requires": { "env": ["JARVIS_TAX_API_KEY"] } } }
---

# Tax Chat Skill

AI-powered Indian tax consultation assistant. Connects to the Jarvis Tax API backend for accurate, up-to-date answers grounded in Indian tax law.

## When to Use

✅ **USE this skill when:**

- "What is the GST rate for software services?"
- "How to file GSTR-3B?"
- "What are the TDS rates for professional fees?"
- "Explain Section 80C deductions"
- "What is the penalty for late filing of ITR?"
- "Transfer pricing documentation requirements"
- "FEMA compliance for outward remittances"
- "Company law requirements for annual filing"
- "Customs duty on import of electronic goods"
- Any question about Indian tax laws, rules, circulars, or notifications

## When NOT to Use

❌ **DON'T use this skill when:**

- User wants to actually file a return → guide them to the portal
- User needs a signed legal opinion → recommend a practicing CA/Lawyer
- User asks about non-Indian tax jurisdictions (unless comparing with Indian provisions)
- Mathematical calculations only → use doc-analyzer or customs-tariff skill

## Covered Domains

### Direct Tax (Income Tax Act, 1961)
- Income Tax rates, slabs, surcharge, cess
- Deductions (Chapter VI-A: 80C, 80D, 80G, etc.)
- TDS/TCS provisions and rates
- Advance tax, self-assessment tax
- Capital gains (short-term, long-term)
- Business income, presumptive taxation
- Return filing (ITR-1 to ITR-7)
- Assessment, reassessment, appeals
- Penalties and prosecution
- International taxation (DTAA, Transfer Pricing, BEPS)

### Indirect Tax (GST)
- GST rates (CGST, SGST, IGST, UTGST)
- Registration, composition scheme
- Input Tax Credit (ITC)
- Returns (GSTR-1, GSTR-3B, GSTR-9, etc.)
- E-way bills, e-invoicing
- Place of supply rules
- Reverse charge mechanism
- GST on services (SAC codes)
- GST on goods (HSN codes)

### Customs
- Customs Tariff Act, 1975
- Basic Customs Duty, IGST, Compensation Cess
- Anti-dumping duty, safeguard duty
- Import/Export policies
- FTP (Foreign Trade Policy)
- Bonded warehouse, SEZ provisions
- Customs valuation rules

### Company Law (Companies Act, 2013)
- Incorporation and registration
- Annual compliance (AGM, Board meetings, filings)
- Director responsibilities
- Share capital, dividends
- Audit requirements
- NCLAT, NCLT proceedings

### FEMA
- Foreign exchange regulations
- FDI policy and compliance
- ECB guidelines
- LRS (Liberalised Remittance Scheme)
- FEMA compounding

## API Integration

The skill connects to the Jarvis Tax API:

```bash
# Query the tax API
curl -X POST "${JARVIS_CLOUD_URL}/api/v1/tax-chat" \
  -H "Authorization: Bearer ${JARVIS_TAX_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the GST rate for IT services?", "domain": "gst", "context": []}'
```

## Response Format

Always provide:
1. **Direct answer** to the question
2. **Legal reference** (Section, Rule, Notification, Circular number)
3. **Effective date** of the provision
4. **Caveats** or conditions if applicable
5. **Related provisions** the user should be aware of

## Example Interactions

**User:** "What is the TDS rate on rent paid to an individual?"

**Response format:**
- Section 194-I of Income Tax Act, 1961
- Rate: 10% for rent of land/building/furniture (if payee is resident)
- Threshold: No TDS if aggregate rent in FY does not exceed Rs. 2,40,000
- Effective from: AY 2024-25 onwards (updated threshold)
- PAN not furnished: 20% rate applies (Section 206AA)
- Related: Section 194-IB for individuals/HUF not subject to audit

## Notes

- Always cite the specific section/rule/notification
- Mention if a provision has been recently amended
- Flag if the answer involves interpretation vs. clear law
- Recommend professional consultation for complex matters
