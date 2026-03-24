/**
 * Direct LLM Tax Chat Fallback
 *
 * When the external Tax AI API is not configured, this module
 * provides tax chat functionality using a direct LLM call
 * (OpenAI/Anthropic) with a specialized Indian tax system prompt.
 *
 * Supports: OPENAI_API_KEY or ANTHROPIC_API_KEY
 */

const TAX_SYSTEM_PROMPT = `You are Jarvis, an expert AI tax assistant specializing in Indian tax law. You provide accurate, well-cited answers to tax professionals (CAs, Lawyers, CS, CMAs).

DOMAINS YOU COVER:
1. GST (CGST Act, SGST Act, IGST Act, GST Rules, Notifications, Circulars)
2. Income Tax (Income Tax Act 1961, Income Tax Rules 1962, CBDT Circulars/Notifications)
3. Customs (Customs Act 1962, Customs Tariff Act 1975, FTP)
4. Company Law (Companies Act 2013, Companies Rules, MCA Circulars)
5. FEMA (FEMA 1999, RBI Master Directions, ECB Guidelines)

RESPONSE FORMAT (always follow):
1. **Direct Answer**: Clear, concise answer to the question
2. **Legal Reference**: Cite specific Section/Rule/Notification/Circular with number and date
3. **Effective Date**: When the provision came into effect or was last amended
4. **Conditions**: Any conditions, exceptions, or thresholds that apply
5. **Penalty**: Consequences for non-compliance (if applicable)
6. **Related Provisions**: Other sections the user should be aware of

RULES:
- Always cite the EXACT section/rule number (e.g., "Section 194-I of Income Tax Act, 1961")
- If a provision was recently amended, mention both old and new positions
- If the law is unclear or disputed, say so explicitly and mention competing interpretations
- Never make up section numbers or case law citations
- For rate queries, always mention the applicable notification number
- If you're not sure, say "I recommend verifying this with the latest notification/circular"
- Use Indian legal terminology (Assessment Year, Previous Year, Assessee, etc.)
- Amounts in Indian Rupees (Rs.)`;

interface LLMResponse {
  answer: string;
  references: Array<{ type: string; title: string; citation: string }>;
  confidence: number;
  domain: string;
}

export async function queryLLMTaxChat(
  query: string,
  domain: string,
  context: Array<{ role: string; content: string }>,
): Promise<LLMResponse> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (openaiKey) {
    return queryOpenAI(query, domain, context, openaiKey);
  } else if (anthropicKey) {
    return queryAnthropic(query, domain, context, anthropicKey);
  } else {
    // Built-in knowledge base for demo mode
    return queryBuiltIn(query, domain);
  }
}

async function queryOpenAI(
  query: string,
  domain: string,
  context: Array<{ role: string; content: string }>,
  apiKey: string,
): Promise<LLMResponse> {
  const messages = [
    { role: "system", content: TAX_SYSTEM_PROMPT },
    ...context,
    {
      role: "user",
      content: `[Domain: ${domain}]\n\n${query}`,
    },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages,
      temperature: 0.2,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${err}`);
  }

  const data = (await response.json()) as any;
  const answer = data.choices?.[0]?.message?.content || "No response from AI";

  return {
    answer,
    references: extractReferences(answer),
    confidence: 0.85,
    domain,
  };
}

async function queryAnthropic(
  query: string,
  domain: string,
  context: Array<{ role: string; content: string }>,
  apiKey: string,
): Promise<LLMResponse> {
  const messages = context.map((c) => ({
    role: c.role === "system" ? ("user" as const) : (c.role as "user" | "assistant"),
    content: c.content,
  }));
  messages.push({ role: "user", content: `[Domain: ${domain}]\n\n${query}` });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      system: TAX_SYSTEM_PROMPT,
      messages,
      max_tokens: 2000,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${err}`);
  }

  const data = (await response.json()) as any;
  const answer =
    data.content?.[0]?.text || "No response from AI";

  return {
    answer,
    references: extractReferences(answer),
    confidence: 0.88,
    domain,
  };
}

interface KBEntry {
  keywords: string[];
  domain: string;
  answer: string;
  references: Array<{ type: string; title: string; citation: string }>;
}

const KNOWLEDGE_BASE: KBEntry[] = [
  {
    keywords: ["tds", "professional", "194j", "fees"],
    domain: "income-tax",
    answer: `**TDS on Professional Fees -- Section 194J**

TDS Rate: 10% on professional/technical fees (2% for technical services to certain payees).

**Key Details:**
- Threshold: TDS applies when aggregate payment exceeds Rs. 30,000 in a financial year
- Applicable on: Legal, medical, engineering, architectural, accounting, technical consultancy, or interior decoration fees
- Due date for deposit: 7th of the following month (30th April for March deductions)
- Payer must have TAN (Tax Deduction Account Number)

**Recent Amendment (Finance Act 2024):**
- Rate for fees for technical services (not being professional services): 2%
- Rate for professional services: 10%
- No TDS if recipient is an individual/HUF with turnover < Rs. 1 Cr (business) / Rs. 50 Lakh (profession) in preceding FY

**Penalty for non-deduction:**
- Interest u/s 201(1A): 1% per month (failure to deduct) or 1.5% per month (deducted but not deposited)
- Penalty u/s 271C: Equal to the amount of TDS not deducted

Note: For a comprehensive analysis of your specific situation, connect an LLM API key (OpenAI/Anthropic) for enhanced AI-powered responses.`,
    references: [
      { type: "section", title: "Section 194J of Income Tax Act, 1961", citation: "Section 194J" },
      { type: "section", title: "Section 201(1A) - Interest on late deposit", citation: "Section 201(1A)" },
      { type: "section", title: "Section 271C - Penalty", citation: "Section 271C" },
    ],
  },
  {
    keywords: ["gst", "rate", "restaurant", "food", "hotel"],
    domain: "gst",
    answer: `**GST on Restaurant Services**

**Standard Rates:**
- Restaurants (non-AC, not serving liquor): 5% (without ITC)
- AC restaurants / restaurants in hotels with room tariff < Rs. 7,500: 5% (without ITC)
- Restaurants in hotels with room tariff >= Rs. 7,500: 18% (with ITC)
- Outdoor catering: 5% (without ITC)
- Cloud kitchens/food delivery: 5% (without ITC)

**SAC Code:** 9963 (Accommodation and food service)

**Key Points:**
- Most restaurants charge 5% GST without input tax credit (ITC)
- Hotels with declared tariff >= Rs. 7,500 per night charge 18% with ITC
- Food delivery aggregators (Swiggy, Zomato) collect and deposit GST at 5% since 01-01-2022
- Takeaway food from restaurants: 5% GST (treated as service, not goods sale)

**Notification:** Notification No. 11/2017 - Central Tax (Rate) dated 28.06.2017 (as amended)

Note: Connect an LLM API key for deeper analysis of specific scenarios.`,
    references: [
      { type: "notification", title: "Notification No. 11/2017 - Central Tax (Rate)", citation: "Notification No. 11/2017-CT(R) dated 28.06.2017" },
      { type: "section", title: "Section 9 of CGST Act, 2017", citation: "Section 9 CGST Act" },
    ],
  },
  {
    keywords: ["gst", "registration", "threshold", "limit"],
    domain: "gst",
    answer: `**GST Registration Thresholds**

**Mandatory Registration:**
- Aggregate turnover > Rs. 40 Lakh (goods) -- Rs. 20 Lakh for special category states
- Aggregate turnover > Rs. 20 Lakh (services) -- Rs. 10 Lakh for special category states
- Interstate supply of goods (regardless of turnover)
- E-commerce operators and suppliers through e-commerce
- Input Service Distributor (ISD)
- TDS/TCS deductors
- Casual taxable persons
- Non-resident taxable persons

**Composition Scheme:**
- Available for turnover up to Rs. 1.5 Cr (Rs. 75 Lakh for special category states)
- Tax rate: 1% for manufacturers/traders, 5% for restaurants
- Cannot make interstate supplies or supply through e-commerce
- Must file CMP-08 quarterly

**Timeline:** Must apply within 30 days of becoming liable

**Penalty for not registering:** Tax amount + interest + penalty up to Rs. 10,000 (or 100% of tax due, whichever is higher) under Section 122.

Note: Connect an LLM API key for detailed analysis.`,
    references: [
      { type: "section", title: "Section 22 of CGST Act, 2017 - Registration", citation: "Section 22 CGST Act" },
      { type: "section", title: "Section 24 - Compulsory Registration", citation: "Section 24 CGST Act" },
      { type: "notification", title: "Notification No. 10/2019 - Rs. 40L threshold", citation: "Notification No. 10/2019-CT dated 07.03.2019" },
    ],
  },
  {
    keywords: ["advance", "tax", "installment", "234c", "234b"],
    domain: "income-tax",
    answer: `**Advance Tax -- Sections 208-211, Income Tax Act 1961**

**Who must pay:** Any person whose estimated tax liability for the year is Rs. 10,000 or more (after TDS).

**Due Dates & Percentages:**
| Installment | Due Date | Cumulative % |
|-------------|----------|-------------|
| Q1 | 15th June | 15% |
| Q2 | 15th September | 45% |
| Q3 | 15th December | 75% |
| Q4 | 15th March | 100% |

**Exemption:** Senior citizens (60+) with no business/profession income are exempt from advance tax.

**Interest for default:**
- Section 234B: If advance tax paid < 90% of assessed tax -- 1% per month on shortfall (from April to date of assessment)
- Section 234C: Deferment of installments -- 1% per month for 3 months (per quarter shortfall)

**Section 44AD/44ADA (Presumptive):** Entire advance tax in single installment by 15th March.

Note: Connect an LLM API key for personalized tax planning advice.`,
    references: [
      { type: "section", title: "Section 208-211 - Advance Tax", citation: "Sections 208-211" },
      { type: "section", title: "Section 234B - Interest for default", citation: "Section 234B" },
      { type: "section", title: "Section 234C - Interest for deferment", citation: "Section 234C" },
    ],
  },
  {
    keywords: ["customs", "duty", "import", "bcd", "basic"],
    domain: "customs",
    answer: `**Customs Duty Structure in India**

**Components of Import Duty:**
1. **Basic Customs Duty (BCD):** Varies by product (0% to 150%), based on Customs Tariff Act 1975
2. **Social Welfare Surcharge (SWS):** 10% on BCD (certain items exempt)
3. **IGST:** Charged on assessable value + BCD + SWS (rate as per GST schedule)
4. **Compensation Cess:** On certain luxury/demerit goods
5. **NCCD (National Calamity Contingent Duty):** On specified goods
6. **Anti-dumping / Safeguard Duty:** On specific goods from specific countries

**Assessable Value (for ad valorem duties):**
- Transaction value + freight + insurance + landing charges (1% of CIF)
- If transaction value rejected: Sequential methods under CVR 2007

**Jarvis has 16,885 tariff entries loaded.** Use the Customs Tariff tab to search by HSN code or description.

Note: Connect an LLM API key for detailed duty calculation on specific products.`,
    references: [
      { type: "section", title: "Section 12 of Customs Act, 1962 - Dutiable goods", citation: "Section 12 Customs Act" },
      { type: "section", title: "Customs Tariff Act, 1975 - First Schedule", citation: "Customs Tariff Act 1975" },
      { type: "rule", title: "Customs Valuation Rules, 2007", citation: "CVR 2007" },
    ],
  },
  {
    keywords: ["company", "agm", "annual", "general", "meeting", "roc"],
    domain: "company-law",
    answer: `**Annual General Meeting (AGM) -- Section 96, Companies Act 2013**

**Timeline:**
- Must be held within 6 months from the end of the financial year (i.e., by 30th September for March FY)
- Gap between two AGMs: Not more than 15 months
- First AGM: Within 9 months from close of first FY

**Requirements:**
- Notice: 21 clear days before the meeting
- Quorum: 1/3 of total members or 5 members (whichever is less) for public companies
- Business: Consideration of financial statements, directors' report, auditor's report, appointment of auditor, declaration of dividend

**ROC Filings after AGM:**
- AOC-4 (Financial Statements): Within 30 days of AGM
- MGT-7 (Annual Return): Within 60 days of AGM

**Penalty for not holding AGM:**
- Company: Up to Rs. 1,00,000
- Every officer in default: Rs. 5,000 per day during the default

Note: Connect an LLM API key for detailed analysis.`,
    references: [
      { type: "section", title: "Section 96 - Annual General Meeting", citation: "Section 96 Companies Act 2013" },
      { type: "section", title: "Section 137 - Filing of Financial Statements", citation: "Section 137" },
      { type: "section", title: "Section 92 - Annual Return", citation: "Section 92" },
    ],
  },
  {
    keywords: ["fema", "foreign", "exchange", "rbi", "ecb", "fdi"],
    domain: "fema",
    answer: `**FEMA Overview -- Foreign Exchange Management Act, 1999**

**Key Areas:**
1. **FDI (Foreign Direct Investment):** Governed by Consolidated FDI Policy + FEMA Notification No. 20
   - Automatic Route: Most sectors (no RBI approval needed)
   - Government Route: Defence, media, telecom, etc. require approval
   - Prohibited: Lottery, gambling, chit fund, Nidhi company, real estate, tobacco

2. **ECB (External Commercial Borrowings):**
   - Eligible borrowers: Listed on Track I (up to $50M, 3-year avg maturity) and Track II (above $50M)
   - All-in-cost ceiling: SOFR + 550 bps
   - Monthly reporting: ECB-2 return to RBI by 7th of following month

3. **ODI (Overseas Direct Investment):**
   - Automatic route for investment up to net worth of the Indian party
   - Financial commitment ceiling per year

4. **LRS (Liberalised Remittance Scheme):**
   - Limit: $250,000 per FY for resident individuals
   - Covers education, travel, gifts, investments abroad

**Key Filing: FLA Return** -- Annual return by 15th July for entities with foreign investment.

Note: Connect an LLM API key for detailed FEMA advisory.`,
    references: [
      { type: "section", title: "FEMA 1999 - Section 6 (Capital Account Transactions)", citation: "Section 6 FEMA" },
      { type: "notification", title: "FEMA Notification No. 20 - FDI", citation: "FEMA 20/2000-RB" },
      { type: "circular", title: "RBI Master Direction on ECB", citation: "RBI/2018-19/60" },
    ],
  },
  {
    keywords: ["tds", "rent", "194i", "landlord", "property"],
    domain: "income-tax",
    answer: `**TDS on Rent -- Section 194-I**

**TDS Rates:**
- Rent on **plant & machinery**: 2%
- Rent on **land, building, furniture, fittings**: 10%

**Key Details:**
- **Threshold**: TDS applies when aggregate rent exceeds **Rs. 2,40,000** per financial year (increased from Rs. 1,80,000 w.e.f. 01-04-2019)
- **Due date for deposit**: 7th of the following month
- **TDS certificate**: Form 16A within 15 days of filing TDS return
- **TAN required**: Payer must have Tax Deduction Account Number

**Section 194-IB (Individual/HUF paying rent > Rs. 50,000/month):**
- Rate: 5% (reduced from 10% for individuals/HUF not covered under 194-I)
- No TAN required -- deduct using PAN only
- Deposit using Form 26QC within 30 days from month-end

**Exemptions:**
- No TDS if payee is Government or approved institution
- No TDS on warehouse rent for agricultural produce storage
- Individual/HUF not subject to tax audit need not deduct under 194-I (use 194-IB instead)

**Penalty for non-deduction:**
- Interest u/s 201(1A): 1% per month (not deducted) or 1.5% per month (deducted but not deposited)
- Disallowance u/s 40(a)(ia): 30% of rent not allowed as expense`,
    references: [
      { type: "section", title: "Section 194-I of Income Tax Act, 1961", citation: "Section 194-I" },
      { type: "section", title: "Section 194-IB (Individual/HUF rent TDS)", citation: "Section 194-IB" },
      { type: "section", title: "Section 40(a)(ia) - Disallowance", citation: "Section 40(a)(ia)" },
    ],
  },
  {
    keywords: ["tds", "salary", "192", "employer"],
    domain: "income-tax",
    answer: `**TDS on Salary -- Section 192**

**TDS Rate:** At the **average rate of income tax** computed on estimated total income of the employee for the financial year.

**Key Details:**
- **No threshold**: TDS applies from the first rupee if total income exceeds basic exemption limit
- **Employer's responsibility**: Employer must estimate total income including other income declared by employee
- **Form 12BB**: Employee declares investments/deductions to employer for TDS computation
- **Frequency**: TDS deposited monthly by 7th of following month

**New vs Old Tax Regime (AY 2026-27):**
- **New Regime (default)**: 0-4L: nil, 4-8L: 5%, 8-12L: 10%, 12-16L: 15%, 16-20L: 20%, 20-24L: 25%, 24L+: 30%. Standard deduction: Rs. 75,000
- **Old Regime**: Basic limit Rs. 2.5L (3L for senior), 2.5-5L: 5%, 5-10L: 20%, 10L+: 30%. Deductions u/s 80C, 80D, etc. available

**Forms:**
- **Form 16**: TDS certificate issued by employer by 15th June
- **Form 24Q**: Quarterly TDS return (employer files)
- **Form 12BA**: Statement of perquisites

**Surcharge**: 10% (50L-1Cr), 15% (1-2Cr), 25% (2-5Cr), 37% (5Cr+). Marginal relief available.
**Cess**: 4% Health & Education Cess on total tax + surcharge.`,
    references: [
      { type: "section", title: "Section 192 of Income Tax Act, 1961", citation: "Section 192" },
      { type: "section", title: "Section 115BAC - New Tax Regime", citation: "Section 115BAC" },
      { type: "section", title: "Rule 26B - TDS on Salary", citation: "Rule 26B" },
    ],
  },
  {
    keywords: ["tds", "contractor", "194c", "payment", "contract"],
    domain: "income-tax",
    answer: `**TDS on Contractor Payments -- Section 194C**

**TDS Rates:**
- **Individual / HUF**: 1%
- **Any other person (Company, Firm, etc.)**: 2%

**Threshold:**
- Single payment exceeding **Rs. 30,000**, OR
- Aggregate payments during the FY exceeding **Rs. 1,00,000**

**Applicable on:**
- Any payment to a resident contractor/sub-contractor for carrying out any work (including supply of labour)
- Advertising contracts, broadcasting, carriage of goods/passengers, catering, manufacturing/processing, construction

**Exceptions -- TDS NOT applicable on:**
- Payment to contractor engaged in plying, hiring, or leasing goods carriages (if PAN furnished + owns <=10 goods carriages)
- Personal payments not in course of business/profession

**Key Points:**
- If contractor quotes under Sec 206AB (non-filer), rate doubles to 5%
- Transport operator owning <=10 goods carriages: **NIL** TDS (if PAN furnished + declaration given)
- TDS return: **Form 26Q** (quarterly)
- TDS certificate: **Form 16A** within 15 days of filing return`,
    references: [
      { type: "section", title: "Section 194C of Income Tax Act, 1961", citation: "Section 194C" },
      { type: "section", title: "Section 206AB - Higher TDS for non-filers", citation: "Section 206AB" },
    ],
  },
  {
    keywords: ["gst", "return", "gstr", "filing", "due date", "gstr1", "gstr3b"],
    domain: "gst",
    answer: `**GST Return Filing -- Due Dates and Forms**

**Monthly Returns:**
| Return | Purpose | Due Date |
|--------|---------|----------|
| GSTR-1 | Outward supplies | 11th of following month |
| GSTR-3B | Summary + tax payment | 20th of following month |
| GSTR-7 | TDS return | 10th of following month |
| GSTR-8 | TCS by e-commerce | 10th of following month |

**Quarterly Returns (QRMP Scheme -- turnover up to Rs. 5 Cr):**
| Return | Due Date |
|--------|----------|
| GSTR-1 (IFF) | 13th of following month (optional for M1 & M2) |
| GSTR-1 | 13th of month following quarter |
| GSTR-3B | 22nd/24th of month following quarter |

**Annual Returns:**
| Return | Purpose | Due Date |
|--------|---------|----------|
| GSTR-9 | Annual return | 31st December |
| GSTR-9C | Reconciliation (turnover > Rs. 5 Cr) | 31st December |

**Penalties for Late Filing:**
- **GSTR-1/3B**: Rs. 50/day (Rs. 20/day for nil), max Rs. 10,000
- **GSTR-9**: Rs. 200/day (Rs. 100 CGST + Rs. 100 SGST), max 0.25% of turnover
- **Interest on late payment**: 18% per annum from due date

**Recent Changes:** IMS (Invoice Management System) mandatory from 01-01-2025 for claiming ITC.`,
    references: [
      { type: "section", title: "Section 39 of CGST Act, 2017 - Furnishing of Returns", citation: "Section 39 CGST Act" },
      { type: "notification", title: "Notification No. 02/2022 - QRMP Scheme", citation: "Notification No. 02/2022-CT" },
      { type: "section", title: "Section 47 - Late Fee", citation: "Section 47 CGST Act" },
    ],
  },
  {
    keywords: ["capital", "gains", "ltcg", "stcg", "property", "shares", "equity", "mutual fund"],
    domain: "income-tax",
    answer: `**Capital Gains Tax -- Comprehensive Guide**

**Classification (post Finance Act 2024 amendments):**

**Short Term Capital Gains (STCG):**
| Asset | Holding Period | Tax Rate |
|-------|---------------|----------|
| Listed equity/equity MF | < 12 months | 20% (u/s 111A) |
| Unlisted shares | < 24 months | Slab rate |
| Immovable property | < 24 months | Slab rate |
| Other assets | < 36 months | Slab rate |

**Long Term Capital Gains (LTCG):**
| Asset | Tax Rate | Exemption |
|-------|----------|-----------|
| Listed equity/equity MF | 12.5% (u/s 112A) | Rs. 1.25 lakh per year |
| Other assets | 12.5% (without indexation) | -- |

**Key Exemptions:**
- **Section 54**: LTCG on residential property reinvested in new house (within 2 years purchase / 3 years construction)
- **Section 54EC**: LTCG invested in NHAI/REC bonds (max Rs. 50 lakh, 5-year lock-in)
- **Section 54F**: LTCG on any asset reinvested in residential house

**Important Changes (Budget 2024):**
- Indexation benefit removed for all assets (flat 12.5% rate)
- STCG on equity increased from 15% to 20%
- LTCG exemption on equity increased from Rs. 1 lakh to Rs. 1.25 lakh
- Buyback taxed in hands of shareholders (not company)`,
    references: [
      { type: "section", title: "Section 111A - STCG on listed equity", citation: "Section 111A" },
      { type: "section", title: "Section 112A - LTCG on listed equity", citation: "Section 112A" },
      { type: "section", title: "Section 54 - Exemption on sale of house", citation: "Section 54" },
    ],
  },
  {
    keywords: ["80c", "deduction", "investment", "tax saving", "ppf", "elss", "lic"],
    domain: "income-tax",
    answer: `**Section 80C Deductions -- Tax Saving Investments**

**Maximum Deduction: Rs. 1,50,000** (combined limit for 80C + 80CCC + 80CCD(1))

**Eligible Investments:**
| Investment | Lock-in | Returns |
|------------|---------|---------|
| PPF (Public Provident Fund) | 15 years | ~7.1% (tax-free) |
| ELSS (Equity Linked Savings) | 3 years | Market-linked |
| Tax Saver FD | 5 years | ~7% (taxable) |
| NSC (National Savings Certificate) | 5 years | ~7.7% |
| LIC Premium | Policy term | Varies |
| NPS (Sec 80CCD(1)) | Retirement | Market-linked |
| Sukanya Samriddhi | 21 years | ~8.2% (tax-free) |
| EPF (Employee contribution) | Retirement | ~8.25% |

**Also eligible under 80C:**
- Home loan principal repayment
- Tuition fees (2 children max)
- Stamp duty & registration charges

**Additional deductions beyond Rs. 1.5 lakh:**
- **80CCD(1B)**: Additional Rs. 50,000 for NPS
- **80D**: Medical insurance -- Rs. 25,000 (self) + Rs. 25,000 (parents), Rs. 50,000 if senior citizen
- **80E**: Education loan interest (no limit, 8 years)
- **80G**: Donations (50% or 100%)
- **80TTA/80TTB**: Savings interest Rs. 10,000 / Rs. 50,000 (senior)

**NOTE: Available only under Old Tax Regime. New regime (115BAC) does not allow most deductions.**`,
    references: [
      { type: "section", title: "Section 80C of Income Tax Act, 1961", citation: "Section 80C" },
      { type: "section", title: "Section 80CCD(1B) - Additional NPS deduction", citation: "Section 80CCD(1B)" },
      { type: "section", title: "Section 80D - Medical Insurance", citation: "Section 80D" },
    ],
  },
];

function queryBuiltIn(query: string, domain: string): LLMResponse {
  const q = query.toLowerCase();
  
  let bestMatch: KBEntry | null = null;
  let bestScore = 0;
  
  for (const entry of KNOWLEDGE_BASE) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (q.includes(kw)) score++;
    }
    if (domain !== "general" && entry.domain === domain) score += 0.5;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }
  
  if (bestMatch && bestScore >= 1) {
    return {
      answer: bestMatch.answer,
      references: bestMatch.references,
      confidence: Math.min(0.7, bestScore * 0.2),
      domain: bestMatch.domain,
    };
  }
  
  return {
    answer: `Thank you for your query about "${query}".

I am running in **demo mode** with a built-in knowledge base covering common Indian tax topics. For comprehensive AI-powered answers with full legal citations, configure one of these:

1. Set **OPENAI_API_KEY** environment variable (recommended: GPT-4o)
2. Set **ANTHROPIC_API_KEY** environment variable (recommended: Claude Sonnet)
3. Set **TAX_API_URL** + **TAX_API_KEY** for your custom tax AI backend

**Available demo topics:** TDS rates, GST rates, advance tax, customs duty structure, AGM requirements, FEMA overview, GST registration thresholds.

Try asking: "What is the TDS rate on professional fees?" or "What is the GST rate on restaurant services?"`,
    references: [],
    confidence: 0,
    domain,
  };
}

function extractReferences(
  text: string,
): Array<{ type: string; title: string; citation: string }> {
  const refs: Array<{ type: string; title: string; citation: string }> = [];
  const patterns = [
    { type: "section", regex: /Section\s+[\d\w\-\/]+(?:\s+of\s+[^.]+)?/gi },
    { type: "rule", regex: /Rule\s+[\d\w\-\/]+(?:\s+of\s+[^.]+)?/gi },
    {
      type: "notification",
      regex: /Notification\s+No\.\s*[\d\/\-]+(?:\s*dated\s+[^.]+)?/gi,
    },
    {
      type: "circular",
      regex: /Circular\s+No\.\s*[\d\/\-]+(?:\s*dated\s+[^.]+)?/gi,
    },
  ];

  for (const { type, regex } of patterns) {
    const matches = text.match(regex);
    if (matches) {
      for (const match of matches) {
        if (!refs.find((r) => r.citation === match)) {
          refs.push({ type, title: match, citation: match });
        }
      }
    }
  }

  return refs;
}
