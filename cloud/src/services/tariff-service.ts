/**
 * Customs Tariff Service
 *
 * Loads tariff data from Excel files into the database and provides
 * search/lookup capabilities. Powers the customs-tariff skill.
 */

import { db } from "../db/connection.js";
import { cache, cacheKey } from "./cache.js";

export interface TariffEntry {
  section: string;
  chapter: string;
  tariffItem: string;
  dash: string;
  description: string;
  unit: string;
  basicRate: string;
  effectiveRate: string;
  igst: string;
  sws: string;
  nccd: string;
  totalRate: string;
  importPolicy: string;
  exportPolicy: string;
  year: number;
}

export async function loadTariffFromData(
  rows: any[][],
  headers: string[],
  year: number,
): Promise<number> {
  const colMap: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = String(h).toLowerCase().trim();
    if (key.includes("section")) colMap.section = i;
    else if (key.includes("chapter")) colMap.chapter = i;
    else if (key.includes("tariff")) colMap.tariffItem = i;
    else if (key.includes("dash")) colMap.dash = i;
    else if (key.includes("description")) colMap.description = i;
    else if (key === "unit") colMap.unit = i;
    else if (key.includes("basic rate") && !key.includes("remark"))
      colMap.basicRate = i;
    else if (key.includes("effective") && !key.includes("remark"))
      colMap.effectiveRate = i;
    else if (key === "igst" || (key.includes("igst") && !key.includes("remark")))
      colMap.igst = i;
    else if (key.includes("sws") && !key.includes("remark")) colMap.sws = i;
    else if (key.includes("nccd") && !key.includes("remark")) colMap.nccd = i;
    else if (key.includes("total")) colMap.totalRate = i;
    else if (key.includes("import")) colMap.importPolicy = i;
    else if (key.includes("export")) colMap.exportPolicy = i;
  });

  let loaded = 0;

  for (const row of rows) {
    const tariffItem = String(row[colMap.tariffItem] || "").trim();
    if (!tariffItem) continue;

    await db.query(
      `INSERT INTO tariff_data (section, chapter, tariff_item, dash, description, unit, basic_rate, effective_rate, igst, sws, nccd, total_rate, import_policy, export_policy, year)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        String(row[colMap.section] || "").trim(),
        String(row[colMap.chapter] || "").trim(),
        tariffItem,
        String(row[colMap.dash] || "").trim(),
        String(row[colMap.description] || "").trim(),
        String(row[colMap.unit] || "").trim(),
        String(row[colMap.basicRate] || "").trim(),
        String(row[colMap.effectiveRate] || "").trim(),
        String(row[colMap.igst] || "").trim(),
        String(row[colMap.sws] || "").trim(),
        String(row[colMap.nccd] || "").trim(),
        String(row[colMap.totalRate] || "").trim(),
        String(row[colMap.importPolicy] || "").trim(),
        String(row[colMap.exportPolicy] || "").trim(),
        year,
      ],
    );
    loaded++;
  }

  return loaded;
}

export async function searchTariff(params: {
  hsn?: string;
  search?: string;
  chapter?: string;
  year?: number;
  limit?: number;
}) {
  const key = cacheKey("tariff", params);
  const cached = cache.get<any[]>(key);
  if (cached) return cached;

  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (params.hsn) {
    conditions.push(`tariff_item LIKE $${idx++}`);
    values.push(`${params.hsn}%`);
  }
  if (params.search) {
    conditions.push(`LOWER(description) LIKE LOWER($${idx++})`);
    values.push(`%${params.search}%`);
  }
  if (params.chapter) {
    conditions.push(`chapter LIKE $${idx++}`);
    values.push(`%${params.chapter}%`);
  }
  if (params.year) {
    conditions.push(`year = $${idx++}`);
    values.push(params.year);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = params.limit || 50;

  const result = await db.query(
    `SELECT * FROM tariff_data ${where} ORDER BY tariff_item LIMIT $${idx}`,
    [...values, limit],
  );

  cache.set(key, result.rows, 600); // Cache for 10 minutes
  return result.rows;
}

export async function getTariffStats() {
  const result = await db.query(
    `SELECT year, COUNT(*) as total_entries,
            COUNT(DISTINCT chapter) as chapters
     FROM tariff_data GROUP BY year`,
    [],
  );
  return result.rows;
}
