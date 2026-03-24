---
name: compliance-calendar
description: "Track Indian tax compliance deadlines -- GST returns, Income Tax filings, TDS/TCS deposits, Company Law filings, FEMA reports, and audit timelines. Use when: user asks about due dates, filing deadlines, or wants a compliance checklist. NOT for: actually filing returns or making payments."
metadata: { "jarvis": { "emoji": "📅", "category": "core" } }
---

# Compliance Calendar Skill

Track all Indian tax and regulatory compliance deadlines in one place.

## When to Use

✅ **USE this skill when:**

- "What are the GST filing deadlines this month?"
- "When is the due date for advance tax?"
- "Show me all compliances due in March 2026"
- "TDS return filing deadline for Q3"
- "Annual compliance checklist for a private limited company"
- "ROC filing deadlines"
- "FEMA reporting deadlines"
- "Audit report submission date"

## When NOT to Use

❌ **DON'T use this skill when:**

- User wants to understand a tax concept → use tax-chat
- User wants to file a return → guide to the portal
- User asks about rates → use tax-chat or customs-tariff

## Compliance Categories

### GST Compliances

| Return | Frequency | Due Date | Applicable To |
|--------|-----------|----------|---------------|
| GSTR-1 | Monthly | 11th of next month | Turnover > 5 Cr |
| GSTR-1 (QRMP) | Quarterly | 13th of month following quarter | Turnover ≤ 5 Cr |
| GSTR-3B | Monthly | 20th of next month | Turnover > 5 Cr |
| GSTR-3B (QRMP) | Quarterly | 22nd/24th of month following quarter | Turnover ≤ 5 Cr |
| GSTR-9 | Annual | 31st December | All registered |
| GSTR-9C | Annual | 31st December | Turnover > 5 Cr |
| IFF (Invoice Furnishing) | Monthly (M1, M2) | 13th of next month | QRMP scheme |
| CMP-08 | Quarterly | 18th of month following quarter | Composition dealers |
| GSTR-8 | Monthly | 10th of next month | E-commerce operators |

### Income Tax Compliances

| Compliance | Due Date | Applicable To |
|------------|----------|---------------|
| Advance Tax - Q1 | 15th June | All assessees |
| Advance Tax - Q2 | 15th September | All assessees |
| Advance Tax - Q3 | 15th December | All assessees |
| Advance Tax - Q4 | 15th March | All assessees |
| ITR (non-audit) | 31st July | Individuals, HUF |
| ITR (audit cases) | 31st October | Companies, firms requiring audit |
| ITR (TP cases) | 30th November | Transfer pricing applicable |
| Tax Audit Report | 30th September | Section 44AB cases |
| Belated/Revised Return | 31st December | All assessees |

### TDS/TCS Compliances

| Compliance | Frequency | Due Date |
|------------|-----------|----------|
| TDS Deposit | Monthly | 7th of next month (30th April for March) |
| TDS Return (24Q/26Q/27Q/27EQ) | Quarterly | 31st of month following quarter (31st May for Q4) |
| Form 16 | Annual | 15th June |
| Form 16A | Quarterly | 15 days from TDS return due date |

### Company Law (MCA) Compliances

| Form | Due Date | Purpose |
|------|----------|---------|
| AOC-4 | Within 30 days of AGM | Financial statements |
| MGT-7/MGT-7A | Within 60 days of AGM | Annual return |
| ADT-1 | Within 15 days of AGM | Auditor appointment |
| DIR-3 KYC | 30th September | Director KYC |
| DPT-3 | 30th June | Return of deposits |
| MSME-1 | Half-yearly (30th April / 31st October) | Outstanding payments to MSMEs |
| AGM | Within 6 months of FY end (30th September) | Annual General Meeting |
| Board Meeting | Minimum 4 per year, gap ≤ 120 days | Quarterly board meetings |

### FEMA Compliances

| Form | Due Date | Purpose |
|------|----------|---------|
| FC-GPR | Within 30 days of allotment | FDI reporting |
| FC-TRS | Within 60 days of transfer | Share transfer reporting |
| FLA Return | 15th July | Foreign Liabilities & Assets |
| ECB-2 | Monthly (7th of next month) | ECB reporting |
| ODI Reporting | As applicable | Overseas Direct Investment |

## Commands

### Monthly Overview
```
Show me all compliances due in [month] [year]
```

### Category Filter
```
What GST returns are due this quarter?
What TDS deadlines are coming up?
Company law annual compliances checklist
```

### Entity-specific
```
Compliance calendar for a private limited company with turnover above 5 crore
Deadlines for an individual with business income
```

### Reminder Setup
```
Set reminder for GSTR-3B filing 3 days before deadline
Alert me for all advance tax deadlines
```

## Response Format

Always provide:
1. **Compliance name** and form number
2. **Due date** (exact date for current period)
3. **Applicable to** -- who needs to comply
4. **Penalty for non-compliance** -- late fees, interest, prosecution risk
5. **Key requirements** -- documents needed, prerequisites
6. **Status** -- upcoming / overdue / completed (if tracking)

## Notes

- Dates may change due to government extensions; always check latest notifications
- Flag if a deadline has been extended by CBDT/CBIC/MCA notification
- Consider weekends/holidays -- if due date falls on holiday, next working day applies
- For audit cases, highlight dependent deadlines (audit report before ITR)
