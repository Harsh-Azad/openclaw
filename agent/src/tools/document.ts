/**
 * Document Analysis Tools
 *
 * Gives the agent ability to parse and analyze structured documents:
 * - CSV files (common for tax data exports, bank statements)
 * - JSON files (API responses, configuration)
 * - Excel-like parsing via CSV conversion
 *
 * Based on Claude Cowork's "native document skills" --
 * the ability to understand xlsx/docx/pdf without external APIs.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { Tool, AgentContext, ToolResult } from "../types.js";

function ok(output: string): ToolResult { return { success: true, output }; }
function fail(error: string): ToolResult { return { success: false, output: "", error }; }

export const parseCSVTool: Tool = {
  name: "parse_csv",
  description: "Parse a CSV file and return structured data. Can filter rows, select columns, compute aggregates (sum, avg, count, min, max). Use for bank statements, ledger exports, tax data.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to CSV file" },
      delimiter: { type: "string", description: "Delimiter character (default: comma)" },
      columns: { type: "string", description: "Comma-separated column names to include" },
      filter: { type: "string", description: "Filter expression (e.g. 'Amount>10000')" },
      aggregate: { type: "string", description: "Aggregation: sum(Column), avg(Column), count, min(Column), max(Column)" },
      limit: { type: "number", description: "Max rows to return (default: 50)" },
    },
    required: ["path"],
  },
  riskLevel: "low",
  execute: async (params, ctx) => {
    try {
      const p = path.resolve(ctx.workingDirectory, params.path);
      const raw = await fs.readFile(p, "utf-8");
      const delim = params.delimiter || ",";
      const lines = raw.split("\n").filter((l: string) => l.trim());
      if (lines.length === 0) return ok("Empty CSV file");

      const headers = lines[0].split(delim).map((h: string) => h.trim().replace(/^"|"$/g, ""));
      const rows = lines.slice(1).map((line: string) => {
        const values = line.split(delim).map((v: string) => v.trim().replace(/^"|"$/g, ""));
        const row: Record<string, string> = {};
        headers.forEach((h: string, i: number) => { row[h] = values[i] || ""; });
        return row;
      });

      let filtered = rows;

      // Apply filter
      if (params.filter) {
        const match = params.filter.match(/^(\w+)\s*(>|<|>=|<=|==|!=|contains)\s*(.+)$/);
        if (match) {
          const [, col, op, val] = match;
          filtered = rows.filter((r: Record<string, string>) => {
            const cellVal = r[col] || "";
            const numCell = parseFloat(cellVal);
            const numVal = parseFloat(val);
            switch (op) {
              case ">": return numCell > numVal;
              case "<": return numCell < numVal;
              case ">=": return numCell >= numVal;
              case "<=": return numCell <= numVal;
              case "==": return cellVal === val;
              case "!=": return cellVal !== val;
              case "contains": return cellVal.toLowerCase().includes(val.toLowerCase());
              default: return true;
            }
          });
        }
      }

      // Aggregation
      if (params.aggregate) {
        const aggMatch = params.aggregate.match(/^(sum|avg|count|min|max)\((\w+)\)$/);
        if (aggMatch) {
          const [, fn, col] = aggMatch;
          const values = filtered.map((r: Record<string, string>) => parseFloat(r[col] || "0")).filter((v: number) => !isNaN(v));
          let result: number;
          switch (fn) {
            case "sum": result = values.reduce((a: number, b: number) => a + b, 0); break;
            case "avg": result = values.reduce((a: number, b: number) => a + b, 0) / values.length; break;
            case "count": result = filtered.length; break;
            case "min": result = Math.min(...values); break;
            case "max": result = Math.max(...values); break;
            default: result = 0;
          }
          return ok(`${params.aggregate} = ${result}\n(computed over ${values.length} rows from ${rows.length} total)`);
        }
        if (params.aggregate === "count") {
          return ok(`count = ${filtered.length} rows (from ${rows.length} total)`);
        }
      }

      // Select columns
      const selectedCols = params.columns
        ? params.columns.split(",").map((c: string) => c.trim())
        : headers;

      const limit = params.limit || 50;
      const output = filtered.slice(0, limit);

      let result = `${rows.length} total rows, ${filtered.length} after filter, showing ${output.length}\n`;
      result += `Columns: ${headers.join(", ")}\n\n`;

      for (const row of output) {
        const vals = selectedCols.map((c: string) => `${c}: ${row[c] || ""}`);
        result += vals.join(" | ") + "\n";
      }

      return ok(result);
    } catch (e: any) {
      return fail(`CSV parse error: ${e.message}`);
    }
  },
};

export const parseJSONTool: Tool = {
  name: "parse_json",
  description: "Parse a JSON file and extract data. Can navigate nested structures with dot notation paths (e.g. 'data.items[0].name').",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to JSON file" },
      query: { type: "string", description: "Dot-notation path to extract (e.g. 'results.data')" },
    },
    required: ["path"],
  },
  riskLevel: "low",
  execute: async (params, ctx) => {
    try {
      const p = path.resolve(ctx.workingDirectory, params.path);
      const raw = await fs.readFile(p, "utf-8");
      let data = JSON.parse(raw);

      if (params.query) {
        const parts = params.query.replace(/\[(\d+)\]/g, ".$1").split(".");
        for (const part of parts) {
          if (data === undefined || data === null) break;
          data = data[part];
        }
      }

      const output = JSON.stringify(data, null, 2);
      if (output.length > 5000) {
        return ok(output.substring(0, 5000) + "\n... [truncated, use query parameter to drill down]");
      }
      return ok(output);
    } catch (e: any) {
      return fail(`JSON parse error: ${e.message}`);
    }
  },
};

export const analyzeDataTool: Tool = {
  name: "analyze_data",
  description: "Analyze a data file (CSV/JSON) and produce a summary: row count, column types, value distributions, missing data, numeric statistics. Like a quick 'data profile' for any structured file.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to CSV or JSON file" },
    },
    required: ["path"],
  },
  riskLevel: "low",
  execute: async (params, ctx) => {
    try {
      const p = path.resolve(ctx.workingDirectory, params.path);
      const raw = await fs.readFile(p, "utf-8");
      const ext = path.extname(p).toLowerCase();

      let headers: string[];
      let rows: Record<string, string>[];

      if (ext === ".json") {
        const data = JSON.parse(raw);
        const arr = Array.isArray(data) ? data : data.data || data.results || data.items || [data];
        if (!Array.isArray(arr) || arr.length === 0) return ok("JSON file has no array data to analyze");
        headers = Object.keys(arr[0]);
        rows = arr.map((item: any) => {
          const row: Record<string, string> = {};
          for (const h of headers) row[h] = String(item[h] ?? "");
          return row;
        });
      } else {
        const delim = ext === ".tsv" ? "\t" : ",";
        const lines = raw.split("\n").filter((l: string) => l.trim());
        if (lines.length < 2) return ok("File has no data rows");
        headers = lines[0].split(delim).map((h: string) => h.trim().replace(/^"|"$/g, ""));
        rows = lines.slice(1).map((line: string) => {
          const values = line.split(delim).map((v: string) => v.trim().replace(/^"|"$/g, ""));
          const row: Record<string, string> = {};
          headers.forEach((h: string, i: number) => { row[h] = values[i] || ""; });
          return row;
        });
      }

      let report = `DATA PROFILE: ${path.basename(p)}\n`;
      report += `Rows: ${rows.length} | Columns: ${headers.length}\n\n`;

      for (const col of headers) {
        const values = rows.map((r) => r[col]);
        const nonEmpty = values.filter((v) => v && v.trim());
        const missing = values.length - nonEmpty.length;
        const nums = nonEmpty.map((v) => parseFloat(v)).filter((n) => !isNaN(n));

        report += `[${col}]\n`;
        report += `  Non-empty: ${nonEmpty.length}/${values.length}`;
        if (missing > 0) report += ` (${missing} missing)`;
        report += "\n";

        if (nums.length > nonEmpty.length * 0.5) {
          // Numeric column
          const sum = nums.reduce((a, b) => a + b, 0);
          report += `  Type: numeric | Min: ${Math.min(...nums)} | Max: ${Math.max(...nums)} | Avg: ${(sum / nums.length).toFixed(2)}\n`;
        } else {
          // Categorical
          const unique = new Set(nonEmpty);
          report += `  Type: text | Unique: ${unique.size}`;
          if (unique.size <= 10) {
            report += ` | Values: ${[...unique].slice(0, 10).join(", ")}`;
          }
          report += "\n";
        }
      }

      return ok(report);
    } catch (e: any) {
      return fail(`Analysis error: ${e.message}`);
    }
  },
};

export const DOCUMENT_TOOLS = [parseCSVTool, parseJSONTool, analyzeDataTool];
