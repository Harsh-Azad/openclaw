import { getTariffStats, searchTariff } from "./src/services/tariff-service.js";

async function main() {
  const stats = await getTariffStats();
  console.log("Tariff stats:", JSON.stringify(stats));
  
  const sample = await searchTariff({ hsn: "8471", limit: 3 });
  console.log("Sample search (8471):", sample.length, "results");
  
  if (sample.length > 0) {
    console.log("First result:", JSON.stringify(sample[0]).substring(0, 200));
  }
  
  process.exit(0);
}

main();
