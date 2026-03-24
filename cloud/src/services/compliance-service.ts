/**
 * Compliance Calendar Service
 *
 * Generates dynamic compliance deadlines with:
 * - Weekend/holiday adjustment (if due date falls on holiday, next working day)
 * - Government extension tracking
 * - Priority calculation based on proximity to deadline
 * - Multi-domain coverage (GST, IT, TDS, Company Law, FEMA)
 */

import { cache, cacheKey } from "./cache.js";

export interface ComplianceDeadline {
  id: string;
  category: string;
  name: string;
  form: string;
  day: number;
  description: string;
  applicableTo: string;
  penalty: string;
  frequency: "monthly" | "quarterly" | "annual" | "one-time";
  months?: number[]; // applicable months (1-12), empty = every month
}

// Indian national holidays (2026) - major ones
const HOLIDAYS_2026: string[] = [
  "2026-01-26", // Republic Day
  "2026-03-10", // Holi
  "2026-03-31", // Id-ul-Fitr (approx)
  "2026-04-02", // Good Friday
  "2026-04-14", // Dr Ambedkar Jayanti
  "2026-05-01", // May Day
  "2026-06-07", // Id-ul-Zuha (approx)
  "2026-07-06", // Muharram (approx)
  "2026-08-15", // Independence Day
  "2026-09-05", // Milad-un-Nabi (approx)
  "2026-10-02", // Gandhi Jayanti
  "2026-10-20", // Dussehra
  "2026-11-09", // Diwali
  "2026-11-10", // Diwali (Govardhan Puja)
  "2026-12-25", // Christmas
];

// Known government extensions (update as new notifications come)
const KNOWN_EXTENSIONS: Record<string, { newDate: string; notification: string }> = {
  // Example: "gst-gstr9-2026-12-31": { newDate: "2027-01-31", notification: "Notification XX/2026" }
};

const MASTER_DEADLINES: ComplianceDeadline[] = [
  // GST Monthly
  { id: "gst-gstr1", category: "gst", name: "GSTR-1", form: "GSTR-1", day: 11, description: "Outward supplies return", applicableTo: "Turnover > 5 Cr", penalty: "Rs. 50/day (Rs. 20 for nil), max Rs. 10,000", frequency: "monthly" },
  { id: "gst-gstr3b", category: "gst", name: "GSTR-3B", form: "GSTR-3B", day: 20, description: "Summary return with tax payment", applicableTo: "All registered taxpayers", penalty: "Rs. 50/day + 18% interest on tax due", frequency: "monthly" },
  { id: "gst-gstr8", category: "gst", name: "GSTR-8 (E-commerce)", form: "GSTR-8", day: 10, description: "TCS return by e-commerce operators", applicableTo: "E-commerce operators", penalty: "Rs. 50/day", frequency: "monthly" },
  // GST Quarterly
  { id: "gst-gstr1-qrmp", category: "gst", name: "GSTR-1 (QRMP)", form: "GSTR-1", day: 13, description: "Quarterly outward supplies return", applicableTo: "Turnover ≤ 5 Cr (QRMP)", penalty: "Rs. 50/day", frequency: "quarterly", months: [1, 4, 7, 10] },
  { id: "gst-cmp08", category: "gst", name: "CMP-08", form: "CMP-08", day: 18, description: "Quarterly return for composition dealers", applicableTo: "Composition scheme dealers", penalty: "Rs. 50/day", frequency: "quarterly", months: [1, 4, 7, 10] },
  // GST Annual
  { id: "gst-gstr9", category: "gst", name: "GSTR-9 (Annual Return)", form: "GSTR-9", day: 31, description: "Annual GST return", applicableTo: "All registered taxpayers", penalty: "Rs. 200/day (CGST+SGST), max 0.5% of turnover", frequency: "annual", months: [12] },
  // TDS Monthly
  { id: "tds-deposit", category: "tds", name: "TDS/TCS Deposit", form: "Challan 281", day: 7, description: "Monthly TDS/TCS deposit (30th April for March)", applicableTo: "All deductors", penalty: "1.5% per month interest + penalty u/s 271C", frequency: "monthly" },
  // TDS Quarterly
  { id: "tds-return", category: "tds", name: "TDS Return (24Q/26Q/27Q)", form: "24Q/26Q/27Q", day: 31, description: "Quarterly TDS return", applicableTo: "All deductors", penalty: "Rs. 200/day u/s 234E, max = TDS amount", frequency: "quarterly", months: [1, 7, 10] },
  { id: "tds-return-q4", category: "tds", name: "TDS Return Q4", form: "24Q/26Q/27Q", day: 31, description: "Q4 TDS return (extended to 31st May)", applicableTo: "All deductors", penalty: "Rs. 200/day u/s 234E", frequency: "annual", months: [5] },
  // Income Tax
  { id: "it-advance-q1", category: "income-tax", name: "Advance Tax Q1 (15%)", form: "Challan 280", day: 15, description: "First installment of advance tax", applicableTo: "Tax liability > Rs. 10,000", penalty: "Interest u/s 234C", frequency: "annual", months: [6] },
  { id: "it-advance-q2", category: "income-tax", name: "Advance Tax Q2 (45%)", form: "Challan 280", day: 15, description: "Second installment (cumulative 45%)", applicableTo: "Tax liability > Rs. 10,000", penalty: "Interest u/s 234C", frequency: "annual", months: [9] },
  { id: "it-advance-q3", category: "income-tax", name: "Advance Tax Q3 (75%)", form: "Challan 280", day: 15, description: "Third installment (cumulative 75%)", applicableTo: "Tax liability > Rs. 10,000", penalty: "Interest u/s 234C", frequency: "annual", months: [12] },
  { id: "it-advance-q4", category: "income-tax", name: "Advance Tax Q4 (100%)", form: "Challan 280", day: 15, description: "Final installment", applicableTo: "Tax liability > Rs. 10,000", penalty: "Interest u/s 234B & 234C", frequency: "annual", months: [3] },
  { id: "it-itr-noaudit", category: "income-tax", name: "ITR Filing (Non-audit)", form: "ITR-1 to ITR-4", day: 31, description: "Income tax return for non-audit cases", applicableTo: "Individuals, HUF (no audit requirement)", penalty: "Rs. 5,000 u/s 234F (Rs. 1,000 if income < 5L)", frequency: "annual", months: [7] },
  { id: "it-tax-audit", category: "income-tax", name: "Tax Audit Report", form: "Form 3CA/3CB + 3CD", day: 30, description: "Tax audit report filing", applicableTo: "Section 44AB cases (turnover > 1 Cr business / 50L profession)", penalty: "Rs. 1,50,000 u/s 271B", frequency: "annual", months: [9] },
  { id: "it-itr-audit", category: "income-tax", name: "ITR Filing (Audit cases)", form: "ITR-5 to ITR-7", day: 31, description: "Income tax return for audit cases", applicableTo: "Companies, firms requiring audit", penalty: "Rs. 5,000 u/s 234F", frequency: "annual", months: [10] },
  { id: "it-itr-tp", category: "income-tax", name: "ITR Filing (TP cases)", form: "ITR-6", day: 30, description: "ITR for transfer pricing cases", applicableTo: "International/specified domestic transactions", penalty: "Rs. 5,000 u/s 234F + TP penalty", frequency: "annual", months: [11] },
  { id: "it-belated", category: "income-tax", name: "Belated/Revised Return", form: "ITR", day: 31, description: "Last date for belated or revised return", applicableTo: "All assessees", penalty: "Rs. 5,000 u/s 234F + interest", frequency: "annual", months: [12] },
  // TDS Annual
  { id: "tds-form16", category: "tds", name: "Form 16 Issuance", form: "Form 16", day: 15, description: "Issue Form 16 to employees", applicableTo: "All employers deducting TDS on salary", penalty: "Rs. 100/day u/s 272A(2)(g)", frequency: "annual", months: [6] },
  // Company Law
  { id: "cl-agm", category: "company-law", name: "Annual General Meeting", form: "AGM", day: 30, description: "AGM within 6 months of FY end", applicableTo: "All companies", penalty: "Rs. 1,00,000 on company + Rs. 5,000/day on officers", frequency: "annual", months: [9] },
  { id: "cl-dir3kyc", category: "company-law", name: "DIR-3 KYC", form: "DIR-3 KYC", day: 30, description: "Director KYC annual update", applicableTo: "All directors with DIN", penalty: "Rs. 5,000 deactivation fee", frequency: "annual", months: [9] },
  { id: "cl-aoc4", category: "company-law", name: "AOC-4 Filing", form: "AOC-4", day: 30, description: "Financial statements filing (within 30 days of AGM)", applicableTo: "All companies", penalty: "Rs. 100/day, max Rs. 10L", frequency: "annual", months: [10] },
  { id: "cl-mgt7", category: "company-law", name: "MGT-7/MGT-7A", form: "MGT-7", day: 30, description: "Annual return (within 60 days of AGM)", applicableTo: "All companies", penalty: "Rs. 100/day, max Rs. 5L", frequency: "annual", months: [11] },
  { id: "cl-dpt3", category: "company-law", name: "DPT-3 (Deposits)", form: "DPT-3", day: 30, description: "Return of deposits/outstanding receipts of money", applicableTo: "Companies accepting deposits", penalty: "As per Companies Act", frequency: "annual", months: [6] },
  { id: "cl-msme1", category: "company-law", name: "MSME-1 Filing", form: "MSME-1", day: 30, description: "Half-yearly MSME outstanding payments return", applicableTo: "Companies with MSME dues > 45 days", penalty: "As per MSME Act", frequency: "quarterly", months: [4, 10] },
  // FEMA
  { id: "fema-fla", category: "fema", name: "FLA Return", form: "FLA Return", day: 15, description: "Foreign Liabilities & Assets annual return", applicableTo: "Entities with foreign investment/assets", penalty: "Penalty under FEMA for non-compliance", frequency: "annual", months: [7] },
  { id: "fema-ecb2", category: "fema", name: "ECB-2 Return", form: "ECB-2", day: 7, description: "Monthly ECB reporting", applicableTo: "Entities with ECB borrowings", penalty: "FEMA penalty", frequency: "monthly" },
];

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isHoliday(dateStr: string): boolean {
  return HOLIDAYS_2026.includes(dateStr);
}

function adjustForHoliday(year: number, month: number, day: number): Date {
  let date = new Date(year, month - 1, day);
  const dateStr = () =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  while (isWeekend(date) || isHoliday(dateStr())) {
    date.setDate(date.getDate() + 1);
  }

  return date;
}

function getDeadlineStatus(
  dueDate: Date,
): "upcoming" | "overdue" | "completed" {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate(),
  );

  if (due < today) return "overdue";
  return "upcoming";
}

function getPriority(dueDate: Date): "high" | "medium" | "low" {
  const now = new Date();
  const daysUntil = Math.ceil(
    (dueDate.getTime() - now.getTime()) / 86400000,
  );
  if (daysUntil <= 3) return "high";
  if (daysUntil <= 7) return "medium";
  return "low";
}

export function getComplianceDeadlines(
  month: number,
  year: number,
  category?: string,
) {
  const key = cacheKey("compliance", { month, year, category: category || "all" });
  const cached = cache.get<any[]>(key);
  if (cached) return cached;

  const deadlines: any[] = [];

  for (const d of MASTER_DEADLINES) {
    // Check if this deadline applies to this month
    if (d.months && d.months.length > 0 && !d.months.includes(month)) {
      continue;
    }

    if (category && d.category !== category) {
      continue;
    }

    const adjustedDate = adjustForHoliday(year, month, d.day);
    const formattedDate = `${adjustedDate.getFullYear()}-${String(adjustedDate.getMonth() + 1).padStart(2, "0")}-${String(adjustedDate.getDate()).padStart(2, "0")}`;

    // Check for government extensions
    const extensionKey = `${d.id}-${formattedDate}`;
    const extension = KNOWN_EXTENSIONS[extensionKey];

    const deadline: any = {
      ...d,
      dueDate: extension ? extension.newDate : formattedDate,
      originalDueDate: formattedDate,
      extended: !!extension,
      extensionNotification: extension?.notification || null,
      status: getDeadlineStatus(
        extension ? new Date(extension.newDate) : adjustedDate,
      ),
      priority: getPriority(
        extension ? new Date(extension.newDate) : adjustedDate,
      ),
    };

    deadlines.push(deadline);
  }

  const sorted = deadlines.sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  );

  cache.set(key, sorted, 3600); // Cache for 1 hour
  return sorted;
}
