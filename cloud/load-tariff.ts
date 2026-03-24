import { loadTariffFromData, getTariffStats } from "./src/services/tariff-service.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

async function main() {
  const filePath = process.argv[2] || "C:\\Users\\AV976FB\\Downloads\\Customs Tariff Tool_Final (with services)_V4_21.3.26.xlsx";
  console.log(`Loading tariff data from: ${filePath}`);

  const wb = XLSX.readFile(filePath);
  console.log("Sheets found:", wb.SheetNames.join(", "));

  const sheetName = wb.SheetNames.find(
    (s) => s.toLowerCase().includes("ct") || s.toLowerCase().includes("tariff"),
  ) || wb.SheetNames[0];

  console.log(`Using sheet: ${sheetName}`);

  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
  const headers = (data[0] || []).map(String);
  const rows = data.slice(1);

  console.log(`Headers: ${headers.slice(0, 10).join(", ")}...`);
  console.log(`Total rows: ${rows.length}`);

  const loaded = await loadTariffFromData(rows, headers, 2026);
  console.log(`Loaded ${loaded} tariff entries`);

  const stats = await getTariffStats();
  console.log("Stats:", JSON.stringify(stats));

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
