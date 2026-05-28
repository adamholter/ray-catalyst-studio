import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RunRecord } from "@ray-catalyst/core";
import { config } from "../config";

const storePath = join(process.cwd(), config.dataDir, "runs.json");

async function readRuns(): Promise<RunRecord[]> {
  try {
    return JSON.parse(await readFile(storePath, "utf8")) as RunRecord[];
  } catch {
    return [];
  }
}

async function writeRuns(runs: RunRecord[]) {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(runs, null, 2));
}

export async function listRuns(): Promise<RunRecord[]> {
  return readRuns();
}

export async function getRun(id: string): Promise<RunRecord | undefined> {
  return (await readRuns()).find((run) => run.id === id);
}

export async function saveRun(run: RunRecord): Promise<RunRecord> {
  const runs = await readRuns();
  const existing = runs.findIndex((item) => item.id === run.id);
  if (existing >= 0) runs[existing] = run;
  else runs.unshift(run);
  await writeRuns(runs.slice(0, 100));
  return run;
}
