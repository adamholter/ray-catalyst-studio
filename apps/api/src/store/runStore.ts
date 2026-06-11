import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GeneratedImage, RunOutput, RunRecord } from "@ray-catalyst/core";
import { config } from "../config";

const storePath = join(process.cwd(), config.dataDir, "runs.json");
const legacyStorePath = join(process.cwd(), ".data", "runs.json");
let saveQueue = Promise.resolve();

async function readRunsFile(path: string): Promise<RunRecord[]> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as RunRecord[];
  } catch {
    return [];
  }
}

function isFalStorageUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "fal.media" ||
        parsed.hostname.endsWith(".fal.media") ||
        parsed.hostname === "fal.ai" ||
        parsed.hostname.endsWith(".fal.ai"))
    );
  } catch {
    return false;
  }
}

function hasOnlyStoredFalUrls(run: RunRecord) {
  const images = run.output?.images || [];
  return images.length > 0 && images.every((image) => isFalStorageUrl(image.url));
}

function shouldPersistRun(run: RunRecord) {
  if (config.providerMode !== "live") return true;
  if (run.output?.mockup) return true;
  if (run.output?.brand) return true;
  if (!run.output?.images?.length) return run.status !== "succeeded";
  return hasOnlyStoredFalUrls(run);
}

function shouldListRun(run: RunRecord) {
  if (config.providerMode !== "live") return true;
  if (run.output?.mockup) return true;
  if (run.output?.brand) return true;
  if (!run.output?.images?.length) return run.status !== "succeeded";
  return hasOnlyStoredFalUrls(run);
}

function isStaleRunningRun(run: RunRecord) {
  if (run.status !== "running" && run.status !== "queued") return false;
  const updated = Date.parse(run.updatedAt || run.createdAt);
  if (!Number.isFinite(updated)) return false;
  return Date.now() - updated > 20 * 60 * 1000;
}

function normalizeRunState(run: RunRecord): RunRecord {
  if (!isStaleRunningRun(run)) {
    return run.status === "succeeded" && run.error ? { ...run, error: undefined } : run;
  }
  return {
    ...run,
    status: "failed",
    updatedAt: new Date().toISOString(),
    error: run.error || "Run was interrupted before it completed. Please generate again.",
    events: [
      ...run.events,
      {
        at: new Date().toISOString(),
        message: "Marked failed after the local server restarted or lost the background job"
      }
    ]
  };
}

function cleanImage(image: GeneratedImage): GeneratedImage {
  return {
    url: image.url,
    ...(typeof image.width === "number" ? { width: image.width } : {}),
    ...(typeof image.height === "number" ? { height: image.height } : {}),
    ...(image.contentType ? { contentType: image.contentType } : {}),
    ...(image.createdAt ? { createdAt: image.createdAt } : {}),
    ...(typeof image.parentIndex === "number" ? { parentIndex: image.parentIndex } : {}),
    ...(image.operation ? { operation: image.operation } : {}),
    ...(image.modelId ? { modelId: image.modelId } : {}),
    ...(image.prompt ? { prompt: image.prompt } : {})
  };
}

function cleanOutput(output: RunOutput | undefined): RunOutput | undefined {
  if (!output) return undefined;
  const next: RunOutput = {};
  if (output.images?.length) next.images = output.images.map(cleanImage);
  if (output.text) next.text = output.text;
  if (output.deck) next.deck = output.deck;
  if (output.mockup) next.mockup = output.mockup;
  if (output.brand) next.brand = output.brand;
  return Object.keys(next).length ? next : undefined;
}

function cleanError(error: unknown) {
  if (!error) return undefined;
  if (typeof error === "string") return error === "[object Object]" ? "The request failed. Try again." : error;
  if (error && typeof error === "object") {
    const item = error as { message?: unknown; error?: unknown; detail?: unknown };
    for (const value of [item.message, item.error, item.detail]) {
      if (typeof value === "string" && value.trim()) return value;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "The request failed. Try again.";
    }
  }
  return String(error);
}

function cleanRun(run: RunRecord): RunRecord {
  return {
    ...run,
    error: run.status === "failed" ? cleanError(run.error) : undefined,
    output: cleanOutput(run.output)
  };
}

async function readRuns(): Promise<RunRecord[]> {
  const primaryRuns = await readRunsFile(storePath);
  if (primaryRuns.length || storePath === legacyStorePath || config.providerMode !== "live") {
    return primaryRuns.map(normalizeRunState).map(cleanRun).filter(shouldListRun);
  }
  return (await readRunsFile(legacyStorePath)).map(normalizeRunState).map(cleanRun).filter(shouldListRun);
}

async function writeRuns(runs: RunRecord[]) {
  await mkdir(dirname(storePath), { recursive: true });
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(runs, null, 2));
  await rename(tempPath, storePath);
}

export async function listRuns(): Promise<RunRecord[]> {
  return readRuns();
}

export async function getRun(id: string): Promise<RunRecord | undefined> {
  return (await readRuns()).find((run) => run.id === id);
}

export async function deleteRun(id: string): Promise<boolean> {
  const primaryRuns = await readRunsFile(storePath);
  const legacyRuns = storePath === legacyStorePath ? [] : await readRunsFile(legacyStorePath);
  const combinedRuns = primaryRuns.length ? primaryRuns : legacyRuns;
  const nextRuns = combinedRuns.filter((run) => run.id !== id);
  if (nextRuns.length === combinedRuns.length) return false;
  await writeRuns(nextRuns.slice(0, 100));
  return true;
}

async function saveRunNow(run: RunRecord): Promise<RunRecord> {
  const runs = await readRunsFile(storePath);
  const existing = runs.findIndex((item) => item.id === run.id);

  if (!shouldPersistRun(run)) {
    if (existing >= 0) runs.splice(existing, 1);
    await writeRuns(runs.slice(0, 100));
    return run;
  }

  const storedRun = cleanRun(run);
  if (existing >= 0) runs[existing] = storedRun;
  else runs.unshift(storedRun);
  await writeRuns(runs.slice(0, 100));
  return run;
}

export async function saveRun(run: RunRecord): Promise<RunRecord> {
  const operation = saveQueue.then(() => saveRunNow(run));
  saveQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}
