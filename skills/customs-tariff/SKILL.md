---
name: customs-tariff
description: "Look up Indian Customs Tariff rates, HSN codes, IGST rates, BCD rates, and import/export policies from structured tariff data. Use when: user asks about customs duty on specific goods, HSN classification, tariff rates, or import/export policies. NOT for: general tax questions unrelated to customs."
metadata: { "jarvis": { "emoji": "🚢", "category": "core", "requires": { "bins": ["node"] } } }
---

# Customs Tariff Lookup Skill

Instant lookup of Indian Customs Tariff rates, HSN codes, and import/export policies from structured data.

## When to Use

✅ **USE this skill when:**

- "What is the customs duty on laptops?"
- "HSN code for mobile phones"
- "BCD rate for Chapter 85 goods"
- "IGST rate on import of software"
- "Import policy for gold"
- "Effective duty rate for HSN 8471"
- "Compare tariff rates for two HSN codes"
- "What changed in customs tariff 2026?"
- "Anti-dumping duty on Chinese steel"

## When NOT to Use

❌ **DON'T use this skill when:**

- GST rates for domestic supply → use tax-chat
- Income tax questions → use tax-chat
- General compliance deadlines → use compliance-calendar

## Data Structure

The customs tariff database contains:

| Column | Description |
|--------|-------------|
| Sections | Tariff section (I-XXI) |
| Chapters | Chapter description (1-99) |
| Tariff Item | HSN code (2/4/6/8 digit) |
| Description of goods | Goods description |
| Unit | Unit of measurement (kg, u, m, etc.) |
| Basic Rate (BCD) | Basic Customs Duty rate |
| Effective Rate | Effective BCD after notifications |
| AIDC | Agriculture Infrastructure Development Cess |
| Health Cess | Health Cess rate |
| SWS | Social Welfare Surcharge (10% of BCD) |
| IGST | Integrated GST rate on import |
| NCCD | National Calamity Contingent Duty |
| Total Rate | Total effective duty |
| Import Policy | Free / Restricted / Prohibited |
| Export Policy | Free / Restricted / Prohibited |

## Lookup Commands

### By HSN Code
```bash
node jarvis-tariff-lookup.js --hsn "8471" --year 2026
```

### By Description
```bash
node jarvis-tariff-lookup.js --search "laptop computer" --year 2026
```

### By Chapter
```bash
node jarvis-tariff-lookup.js --chapter 85 --year 2026
```

### Compare Rates
```bash
node jarvis-tariff-lookup.js --compare --hsn1 "84713010" --hsn2 "84714100"
```

### Rate History
```bash
node jarvis-tariff-lookup.js --hsn "8471" --history
```

## Chapter 99 - Services

Chapter 99 contains SAC (Services Accounting Code) entries for services under GST/Customs:
- 9963: Accommodation and food services
- 9964: Passenger transport services
- 9965: Goods transport services
- 9966: Rental services of transport vehicles
- 9971: Financial and related services
- 9972: Real estate services
- 9973: Leasing or rental services
- 9981: Research and development services
- 9982: Legal and accounting services
- 9983: Professional, technical, and business services
- 9984: Telecommunications services
- 9985: Support services
- 9986: Government services
- 9988: Manufacturing services
- 9991: Public administration services
- 9992: Education services
- 9993: Health and social services
- 9994: Sewage and waste management
- 9995: Community and social services
- 9996: Recreational, cultural, and sporting services
- 9997: Other services

## Response Format

Always provide:
1. **HSN/SAC Code** and description
2. **BCD Rate** (Basic + Effective after notifications)
3. **IGST Rate** on import
4. **Total Duty** (BCD + SWS + IGST + Cess + NCCD)
5. **Import/Export Policy** (Free/Restricted/Prohibited)
6. **Applicable Notifications** if any exemptions apply
7. **Effective Date** of current rates

## Example Response

**Query:** "Customs duty on importing a laptop"

| Component | Rate |
|-----------|------|
| HSN Code | 8471 30 10 |
| Description | Laptop computers |
| Basic Customs Duty | 15% |
| SWS (10% of BCD) | 1.5% |
| IGST | 18% |
| Total Effective Duty | ~37.13% |
| Import Policy | Free |

**Notification:** Basic rate reduced from 20% to 15% vide Notification No. XX/2026-Customs dated DD.MM.2026

## Notes

- Tariff rates change via Budget and mid-year notifications
- Always check for applicable exemption notifications
- Anti-dumping/safeguard duties are additional
- SWS is calculated on aggregate customs duties (not on IGST)
- For services (Chapter 99), IGST format may be percentage or decimal
