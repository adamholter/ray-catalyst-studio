import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunRecord } from "@ray-catalyst/core";
import { config } from "../apps/api/src/config";
import { saveRun } from "../apps/api/src/store/runStore";

const sourcePath = process.argv[2] || process.env.CATALYST_IMPORT_RUNS_FILE || join(process.cwd(), config.dataDir, "runs.json");

async function main() {
  const raw = await readFile(sourcePath, "utf8");
  const runs = JSON.parse(raw) as RunRecord[];
  if (!Array.isArray(runs)) throw new Error(`Expected ${sourcePath} to contain a RunRecord array`);

  let imported = 0;
  for (const run of runs) {
    await saveRun(run);
    imported += 1;
  }

  console.log(`Imported ${imported} runs from ${sourcePath} using ${config.storeDriver} storage`);
  if (config.assetStorageDriver === "r2") {
    console.log("R2 asset persistence was enabled, so eligible image URLs were copied during import.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
