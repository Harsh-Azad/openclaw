import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/connection.js";
import { TierLimits } from "../middleware/subscription.js";
import { queryLLMTaxChat } from "../services/llm-tax-fallback.js";
import { searchTariff, getTariffStats } from "../services/tariff-service.js";
import { getComplianceDeadlines as getEnhancedDeadlines } from "../services/compliance-service.js";

const router = Router();

const taxChatSchema = z.object({
  query: z.string().min(1).max(2000),
  domain: z
    .enum(["gst", "income-tax", "customs", "company-law", "fema", "general"])
    .optional()
    .default("general"),
  context: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
  sessionId: z.string().optional(),
});

const docAnalyzeSchema = z.object({
  action: z.enum(["analyze", "compare", "extract", "validate"]),
  fileType: z.enum(["excel", "pdf", "word", "csv"]),
  analysisType: z.string().optional(),
  options: z.record(z.any()).optional(),
});

async function checkUsageLimit(
  userId: string,
  type: "query" | "document",
  limits: TierLimits,
): Promise<boolean> {
  const today = new Date().toISOString().split("T")[0];
  const result = await db.query(
    `SELECT COUNT(*) as count FROM usage_logs
     WHERE user_id = $1 AND type = $2 AND DATE(created_at) = $3`,
    [userId, type, today],
  );

  const used = Number(result.rows[0].count);
  const limit =
    type === "query" ? limits.queriesPerDay : limits.documentsPerDay;

  return limit === -1 || used < limit;
}

async function logUsage(
  userId: string,
  type: "query" | "document",
  metadata: Record<string, any>,
) {
  await db.query(
    `INSERT INTO usage_logs (id, user_id, type, metadata, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
    [userId, type, JSON.stringify(metadata)],
  );
}

router.post("/chat", async (req: Request, res: Response) => {
  try {
    const data = taxChatSchema.parse(req.body);
    const limits = (req as any).tierLimits as TierLimits;

    const withinLimit = await checkUsageLimit(
      req.user!.userId,
      "query",
      limits,
    );
    if (!withinLimit) {
      res.status(429).json({
        error: "Daily query limit reached",
        message: "Upgrade your plan for more queries",
      });
      return;
    }

    // Forward to external Tax AI API
    const taxApiUrl = process.env.TAX_API_URL;
    const taxApiKey = process.env.TAX_API_KEY;

    let response: any;

    if (taxApiUrl && taxApiKey) {
      // Use external Tax AI API
      const apiResponse = await fetch(`${taxApiUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${taxApiKey}`,
        },
        body: JSON.stringify({
          query: data.query,
          domain: data.domain,
          context: data.context || [],
        }),
      });

      if (!apiResponse.ok) {
        throw new Error(`Tax API returned ${apiResponse.status}`);
      }

      response = await apiResponse.json();
    } else {
      // Fallback: Direct LLM with Indian tax system prompt
      response = await queryLLMTaxChat(
        data.query,
        data.domain,
        data.context || [],
      );
    }

    await logUsage(req.user!.userId, "query", {
      domain: data.domain,
      queryLength: data.query.length,
    });

    res.json({
      ...response,
      usage: { type: "query", remaining: "check /api/v1/subscription/usage" },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: err.errors });
      return;
    }
    console.error("[Tax API] Chat error:", err);
    res.status(500).json({ error: "Tax chat query failed" });
  }
});

router.post("/analyze-document", async (req: Request, res: Response) => {
  try {
    const data = docAnalyzeSchema.parse(req.body);
    const limits = (req as any).tierLimits as TierLimits;

    if (!limits.features.includes("doc-analyzer")) {
      res.status(403).json({
        error: "Document analysis not available on your plan",
        message: "Upgrade to Professional or Enterprise for document analysis",
      });
      return;
    }

    const withinLimit = await checkUsageLimit(
      req.user!.userId,
      "document",
      limits,
    );
    if (!withinLimit) {
      res.status(429).json({
        error: "Daily document analysis limit reached",
        message: "Upgrade your plan for more document analyses",
      });
      return;
    }

    await logUsage(req.user!.userId, "document", {
      action: data.action,
      fileType: data.fileType,
    });

    res.json({
      message: "Document analysis queued",
      action: data.action,
      status: "processing",
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: err.errors });
      return;
    }
    console.error("[Tax API] Document analysis error:", err);
    res.status(500).json({ error: "Document analysis failed" });
  }
});

router.get("/compliance-calendar", async (req: Request, res: Response) => {
  try {
    const { month, year, category } = req.query;

    const limits = (req as any).tierLimits as TierLimits;
    const withinLimit = await checkUsageLimit(
      req.user!.userId,
      "query",
      limits,
    );
    if (!withinLimit) {
      res.status(429).json({ error: "Daily query limit reached" });
      return;
    }

    await logUsage(req.user!.userId, "query", {
      type: "compliance-calendar",
      month,
      year,
      category,
    });

    // Return structured compliance data with holiday adjustment & extension detection
    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year) || new Date().getFullYear();
    const deadlines = getEnhancedDeadlines(m, y, category as string);

    res.json({
      month: m,
      year: y,
      deadlines,
      count: deadlines.length,
    });
  } catch (err) {
    console.error("[Tax API] Compliance calendar error:", err);
    res.status(500).json({ error: "Compliance calendar fetch failed" });
  }
});

router.get("/tariff-lookup", async (req: Request, res: Response) => {
  try {
    const { hsn, search, chapter } = req.query;

    if (!hsn && !search && !chapter) {
      res
        .status(400)
        .json({ error: "Provide hsn, search, or chapter parameter" });
      return;
    }

    const limits = (req as any).tierLimits as TierLimits;

    if (!limits.features.includes("customs-tariff")) {
      res.status(403).json({
        error: "Customs tariff lookup not available on your plan",
        message: "Upgrade to Professional or Enterprise",
      });
      return;
    }

    await logUsage(req.user!.userId, "query", {
      type: "tariff-lookup",
      hsn,
      search,
      chapter,
    });

    const results = await searchTariff({
      hsn: hsn as string,
      search: search as string,
      chapter: chapter as string,
    });

    res.json({
      query: { hsn, search, chapter },
      results,
      count: results.length,
    });
  } catch (err) {
    console.error("[Tax API] Tariff lookup error:", err);
    res.status(500).json({ error: "Tariff lookup failed" });
  }
});

// Tariff stats endpoint
router.get("/tariff-stats", async (req: Request, res: Response) => {
  try {
    const stats = await getTariffStats();
    const stat = stats[0] || { year: 2026, total_entries: 0, chapters: 0 };
    res.json({
      totalEntries: stat.total_entries,
      chapters: stat.chapters,
      year: stat.year,
    });
  } catch (err) {
    console.error("[Tax API] Tariff stats error:", err);
    res.status(500).json({ error: "Tariff stats fetch failed" });
  }
});

function getComplianceDeadlines(
  month: number,
  year: number,
  category?: string,
) {
  const allDeadlines = [
    // GST
    {
      category: "gst",
      name: "GSTR-1",
      form: "GSTR-1",
      day: 11,
      description: "Outward supplies return",
      applicableTo: "Turnover > 5 Cr",
      penalty: "Rs. 50/day (Rs. 20/day for nil return), max Rs. 10,000",
    },
    {
      category: "gst",
      name: "GSTR-3B",
      form: "GSTR-3B",
      day: 20,
      description: "Summary return with tax payment",
      applicableTo: "All registered taxpayers",
      penalty: "Rs. 50/day + 18% interest on tax due",
    },
    {
      category: "gst",
      name: "GSTR-8 (E-commerce)",
      form: "GSTR-8",
      day: 10,
      description: "TCS return by e-commerce operators",
      applicableTo: "E-commerce operators",
      penalty: "Rs. 50/day",
    },
    // TDS
    {
      category: "tds",
      name: "TDS Deposit",
      form: "Challan 281",
      day: 7,
      description: "Monthly TDS/TCS deposit",
      applicableTo: "All deductors",
      penalty: "1.5% per month interest + penalty u/s 271C",
    },
    // Income Tax
    ...(month === 6
      ? [
          {
            category: "income-tax",
            name: "Advance Tax Q1",
            form: "Challan 280",
            day: 15,
            description: "First installment (15% of tax)",
            applicableTo: "Tax liability > Rs. 10,000",
            penalty: "Interest u/s 234C",
          },
        ]
      : []),
    ...(month === 9
      ? [
          {
            category: "income-tax",
            name: "Advance Tax Q2",
            form: "Challan 280",
            day: 15,
            description: "Second installment (cumulative 45%)",
            applicableTo: "Tax liability > Rs. 10,000",
            penalty: "Interest u/s 234C",
          },
          {
            category: "income-tax",
            name: "Tax Audit Report",
            form: "Form 3CA/3CB + 3CD",
            day: 30,
            description: "Tax audit report filing",
            applicableTo: "Section 44AB cases",
            penalty: "Rs. 1,50,000 u/s 271B",
          },
        ]
      : []),
    ...(month === 7
      ? [
          {
            category: "income-tax",
            name: "ITR (Non-audit)",
            form: "ITR-1 to ITR-4",
            day: 31,
            description: "Income tax return for non-audit cases",
            applicableTo: "Individuals, HUF (no audit)",
            penalty: "Rs. 5,000 u/s 234F (Rs. 1,000 if income < 5L)",
          },
        ]
      : []),
    ...(month === 10
      ? [
          {
            category: "income-tax",
            name: "ITR (Audit cases)",
            form: "ITR-5 to ITR-7",
            day: 31,
            description: "Income tax return for audit cases",
            applicableTo: "Companies, firms requiring audit",
            penalty: "Rs. 5,000 u/s 234F",
          },
        ]
      : []),
    ...(month === 12
      ? [
          {
            category: "income-tax",
            name: "Advance Tax Q3",
            form: "Challan 280",
            day: 15,
            description: "Third installment (cumulative 75%)",
            applicableTo: "Tax liability > Rs. 10,000",
            penalty: "Interest u/s 234C",
          },
        ]
      : []),
    ...(month === 3
      ? [
          {
            category: "income-tax",
            name: "Advance Tax Q4",
            form: "Challan 280",
            day: 15,
            description: "Final installment (100%)",
            applicableTo: "Tax liability > Rs. 10,000",
            penalty: "Interest u/s 234B & 234C",
          },
        ]
      : []),
    // Company Law
    ...(month === 9
      ? [
          {
            category: "company-law",
            name: "Annual General Meeting",
            form: "AGM",
            day: 30,
            description: "AGM within 6 months of FY end",
            applicableTo: "All companies",
            penalty: "Rs. 1,00,000 on company + Rs. 5,000/day on officers",
          },
          {
            category: "company-law",
            name: "DIR-3 KYC",
            form: "DIR-3 KYC",
            day: 30,
            description: "Director KYC annual update",
            applicableTo: "All directors with DIN",
            penalty: "Rs. 5,000 deactivation fee",
          },
        ]
      : []),
  ];

  let deadlines = allDeadlines.map((d) => ({
    ...d,
    dueDate: `${year}-${String(month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`,
  }));

  if (category) {
    deadlines = deadlines.filter((d) => d.category === category);
  }

  return deadlines;
}

export { router as taxApiRouter };
