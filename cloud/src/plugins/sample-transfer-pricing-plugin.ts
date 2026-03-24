/**
 * Sample Plugin: Transfer Pricing Module
 *
 * Demonstrates how an enterprise customer (e.g., EY) would build
 * a custom plugin for Jarvis. This plugin adds transfer pricing
 * capabilities to the tax chat.
 */

import type {
  JarvisPlugin,
  JarvisPluginManifest,
  PluginContext,
  ChatRequest,
  ChatResponse,
  ComplianceItem,
} from "./plugin-interface.js";

const manifest: JarvisPluginManifest = {
  id: "transfer-pricing",
  name: "Transfer Pricing Module",
  version: "1.0.0",
  author: "Jarvis Enterprise",
  description:
    "Transfer pricing analysis, documentation, benchmarking, and compliance for multinational enterprises under Indian tax law.",
  license: "commercial",
  domains: ["transfer-pricing", "international-tax"],
  capabilities: ["chat", "compliance-tracking"],
  config: {
    benchmarkingDataSource: {
      type: "select",
      label: "Benchmarking Database",
      required: false,
      options: ["capitaline", "prowess", "ace-equity", "custom"],
      default: "prowess",
    },
  },
};

class TransferPricingPlugin implements JarvisPlugin {
  manifest = manifest;
  private context: PluginContext | null = null;

  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    context.logger.info("Transfer Pricing plugin initialized");
  }

  async shutdown(): Promise<void> {
    this.context?.logger.info("Transfer Pricing plugin shut down");
  }

  async onChat(request: ChatRequest): Promise<ChatResponse | null> {
    const query = request.query.toLowerCase();

    // Only handle transfer pricing and international tax queries
    if (
      !query.includes("transfer pric") &&
      !query.includes("arm's length") &&
      !query.includes("benchmarking") &&
      !query.includes("apa") &&
      !query.includes("beps") &&
      !query.includes("dtaa") &&
      !query.includes("section 92") &&
      !query.includes("section 93") &&
      !query.includes("form 3ceb") &&
      !query.includes("form 3ced") &&
      !query.includes("safe harbour") &&
      !query.includes("thin capitalisation") &&
      !query.includes("country-by-country")
    ) {
      return null;
    }

    const knowledge = getTPKnowledge(query);

    return {
      answer: knowledge.answer,
      references: knowledge.references as ChatResponse["references"],
      confidence: 0.9,
      domain: "transfer-pricing",
      followUp: knowledge.followUp,
    };
  }

  async getComplianceItems(
    month: number,
    year: number,
  ): Promise<ComplianceItem[]> {
    const items: ComplianceItem[] = [];

    if (month === 11) {
      items.push({
        id: "tp-itr-filing",
        name: "ITR Filing (Transfer Pricing Cases)",
        form: "ITR-6",
        domain: "transfer-pricing",
        dueDate: `${year}-11-30`,
        description:
          "Income tax return for assessees with international or specified domestic transactions",
        applicableTo:
          "Companies with international transactions or SDTs exceeding thresholds",
        penalty:
          "Rs. 5,000 u/s 234F + interest u/s 234A/B/C. TP penalty up to 200% of tax on TP adjustment u/s 270A",
        status: "upcoming",
        priority: "high",
      });
    }

    if (month === 10) {
      items.push({
        id: "tp-form-3ceb",
        name: "Form 3CEB Filing",
        form: "Form 3CEB",
        domain: "transfer-pricing",
        dueDate: `${year}-10-31`,
        description:
          "Accountant's report for international/specified domestic transactions",
        applicableTo:
          "Assessees with international transactions or SDTs",
        penalty:
          "Rs. 1,00,000 u/s 271BA for failure to furnish report",
        status: "upcoming",
        priority: "high",
      });
    }

    if (month === 11 || month === 12) {
      items.push({
        id: "tp-documentation",
        name: "TP Documentation",
        form: "Section 92D",
        domain: "transfer-pricing",
        dueDate: `${year}-11-30`,
        description:
          "Maintain TP documentation (Local File, Master File) before due date of ITR",
        applicableTo:
          "Assessees with aggregate international transactions > Rs. 1 Cr",
        penalty:
          "2% of transaction value u/s 271AA for failure to maintain documents",
        status: "upcoming",
        priority: "high",
      });
    }

    if (month === 3) {
      items.push({
        id: "tp-cbcr",
        name: "Country-by-Country Report (CbCR)",
        form: "Form 3CEAC/3CEAD/3CEAE",
        domain: "transfer-pricing",
        dueDate: `${year}-03-31`,
        description:
          "CbCR filing for constituent entities of international groups",
        applicableTo:
          "Indian constituent entities of MNE groups with consolidated revenue > Rs. 5,500 Cr",
        penalty: "Rs. 5,000/day u/s 271GB",
        status: "upcoming",
        priority: "high",
      });
    }

    return items;
  }

  async getHealth() {
    return { status: "ok" as const, details: "Transfer Pricing plugin active" };
  }
}

function getTPKnowledge(query: string): {
  answer: string;
  references: Array<{ type: string; title: string; citation: string }>;
  followUp: string[];
} {
  if (query.includes("arm's length") || query.includes("section 92")) {
    return {
      answer: `**Arm's Length Price (ALP)** is determined under Section 92C of the Income Tax Act, 1961.

The following methods are prescribed:
1. **CUP Method** (Comparable Uncontrolled Price) - Section 92C(1)(a)
2. **RPM** (Resale Price Method) - Section 92C(1)(b)
3. **CPM** (Cost Plus Method) - Section 92C(1)(c)
4. **PSM** (Profit Split Method) - Section 92C(1)(d)
5. **TNMM** (Transactional Net Margin Method) - Section 92C(1)(e)
6. **Other method** as prescribed - Section 92C(1)(f) (Rule 10AB)

The "most appropriate method" (MAM) must be selected based on the nature of the transaction, availability of data, and degree of comparability (Rule 10C).

**Tolerance range**: +/- 1% for wholesale trading, 3% for others (proviso to Section 92C(2)).

**TP adjustment**: If the price is not at arm's length, the TPO may make an adjustment, and penalty up to 200% of tax on such adjustment may apply u/s 270A.`,
      references: [
        { type: "section", title: "Arm's Length Price", citation: "Section 92C of Income Tax Act, 1961" },
        { type: "rule", title: "Most Appropriate Method", citation: "Rule 10C of Income Tax Rules, 1962" },
        { type: "section", title: "Penalty on TP adjustment", citation: "Section 270A of Income Tax Act, 1961" },
      ],
      followUp: [
        "Which TP method is most appropriate for my transaction?",
        "What is the documentation requirement under Section 92D?",
        "How to apply for an Advance Pricing Agreement (APA)?",
      ],
    };
  }

  if (query.includes("form 3ceb")) {
    return {
      answer: `**Form 3CEB** is the report from a Chartered Accountant under Section 92E of the Income Tax Act, 1961.

**Due date**: On or before the due date of filing the return of income (30th November for TP cases).

**Who must file**: Every person who has entered into an international transaction or specified domestic transaction.

**Contents**: Details of international transactions, method used for determining ALP, associated enterprises, nature and value of each transaction.

**Penalty for non-filing**: Rs. 1,00,000 under Section 271BA.

**Important**: Form 3CEB must be filed electronically and signed digitally by the CA.`,
      references: [
        { type: "section", title: "Accountant's Report", citation: "Section 92E of Income Tax Act, 1961" },
        { type: "section", title: "Penalty for non-filing", citation: "Section 271BA of Income Tax Act, 1961" },
      ],
      followUp: [
        "What is the threshold for specified domestic transactions?",
        "Can Form 3CEB be revised?",
      ],
    };
  }

  return {
    answer:
      "I can help with transfer pricing queries. Please ask about ALP methods, documentation requirements, Form 3CEB, APA, BEPS, safe harbour rules, thin capitalisation, or country-by-country reporting.",
    references: [],
    followUp: [
      "How is arm's length price determined?",
      "What are the TP documentation requirements?",
      "What is the safe harbour rule for IT/ITeS companies?",
    ],
  };
}

export function createTransferPricingPlugin(): JarvisPlugin {
  return new TransferPricingPlugin();
}
