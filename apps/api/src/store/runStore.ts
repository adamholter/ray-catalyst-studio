import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import pg from "pg";
import type { GeneratedImage, RunOutput, RunRecord } from "@ray-catalyst/core";
import { config } from "../config";
import { persistRunAssets } from "./assetStorage";

const { Pool } = pg;

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
    ...(image.prompt ? { prompt: image.prompt } : {}),
    ...(image.storage ? { storage: image.storage } : {})
  };
}

function cleanOutput(output: RunOutput | undefined): RunOutput | undefined {
  if (!output) return undefined;
  const next: RunOutput = {};
  if (output.images?.length) next.images = output.images.map(cleanImage);
  if (output.text) next.text = output.text;
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
    output: cleanOutput(run.output),
    modelInvocations: run.modelInvocations?.map((invocation) => ({ ...invocation }))
  };
}

function maxRuns() {
  return Number.isFinite(config.maxStoredRuns) && config.maxStoredRuns > 0 ? config.maxStoredRuns : 250;
}

class FileRunStore {
  async listRuns(): Promise<RunRecord[]> {
    const primaryRuns = await readRunsFile(storePath);
    if (primaryRuns.length || storePath === legacyStorePath || config.providerMode !== "live") {
      return primaryRuns.map(normalizeRunState).map(cleanRun);
    }
    return (await readRunsFile(legacyStorePath)).map(normalizeRunState).map(cleanRun);
  }

  async getRun(id: string): Promise<RunRecord | undefined> {
    return (await this.listRuns()).find((run) => run.id === id);
  }

  async deleteRun(id: string): Promise<boolean> {
    const primaryRuns = await readRunsFile(storePath);
    const legacyRuns = storePath === legacyStorePath ? [] : await readRunsFile(legacyStorePath);
    const combinedRuns = primaryRuns.length ? primaryRuns : legacyRuns;
    const nextRuns = combinedRuns.filter((run) => run.id !== id);
    if (nextRuns.length === combinedRuns.length) return false;
    await this.writeRuns(nextRuns.slice(0, maxRuns()));
    return true;
  }

  async saveRun(run: RunRecord): Promise<RunRecord> {
    const durableRun = await persistRunAssets(run);
    const runs = await readRunsFile(storePath);
    const existing = runs.findIndex((item) => item.id === durableRun.id);
    const storedRun = cleanRun(durableRun);
    if (existing >= 0) runs[existing] = storedRun;
    else runs.unshift(storedRun);
    await this.writeRuns(runs.slice(0, maxRuns()));
    return durableRun;
  }

  private async writeRuns(runs: RunRecord[]) {
    await mkdir(dirname(storePath), { recursive: true });
    const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, JSON.stringify(runs, null, 2));
    await rename(tempPath, storePath);
  }
}

class PostgresRunStore {
  private pool: pg.Pool | null = null;
  private schemaReady: Promise<void> | null = null;

  private getPool() {
    if (!config.databaseUrl) {
      throw new Error("CATALYST_STORE_DRIVER=postgres requires DATABASE_URL");
    }
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: config.databaseUrl,
        max: 5
      });
    }
    return this.pool;
  }

  private async ensureSchema() {
    if (!this.schemaReady) {
      this.schemaReady = this.getPool().query(`
        create table if not exists catalyst_runs (
          id text primary key,
          task_id text not null,
          status text not null,
          created_at timestamptz not null,
          updated_at timestamptz not null,
          run jsonb not null
        );
        create index if not exists catalyst_runs_updated_at_idx on catalyst_runs (updated_at desc);
        create index if not exists catalyst_runs_task_id_idx on catalyst_runs (task_id);
        create index if not exists catalyst_runs_status_idx on catalyst_runs (status);
      `).then(() => undefined);
    }
    return this.schemaReady;
  }

  async listRuns(): Promise<RunRecord[]> {
    await this.ensureSchema();
    const result = await this.getPool().query("select run from catalyst_runs order by updated_at desc limit $1", [maxRuns()]);
    return result.rows.map((row) => cleanRun(normalizeRunState(row.run as RunRecord)));
  }

  async getRun(id: string): Promise<RunRecord | undefined> {
    await this.ensureSchema();
    const result = await this.getPool().query("select run from catalyst_runs where id = $1", [id]);
    const row = result.rows[0];
    return row ? cleanRun(normalizeRunState(row.run as RunRecord)) : undefined;
  }

  async deleteRun(id: string): Promise<boolean> {
    await this.ensureSchema();
    const result = await this.getPool().query("delete from catalyst_runs where id = $1", [id]);
    return Boolean(result.rowCount);
  }

  async saveRun(run: RunRecord): Promise<RunRecord> {
    await this.ensureSchema();
    const durableRun = await persistRunAssets(run);
    const storedRun = cleanRun(durableRun);
    await this.getPool().query(
      `
      insert into catalyst_runs (id, task_id, status, created_at, updated_at, run)
      values ($1, $2, $3, $4, $5, $6)
      on conflict (id) do update set
        task_id = excluded.task_id,
        status = excluded.status,
        updated_at = excluded.updated_at,
        run = excluded.run
      `,
      [
        storedRun.id,
        storedRun.request.taskId,
        storedRun.status,
        storedRun.createdAt,
        storedRun.updatedAt,
        JSON.stringify(storedRun)
      ]
    );
    return durableRun;
  }
}

const store = config.storeDriver === "postgres" ? new PostgresRunStore() : new FileRunStore();

export async function listRuns(): Promise<RunRecord[]> {
  return store.listRuns();
}

export async function getRun(id: string): Promise<RunRecord | undefined> {
  return store.getRun(id);
}

export async function deleteRun(id: string): Promise<boolean> {
  return store.deleteRun(id);
}

export async function saveRun(run: RunRecord): Promise<RunRecord> {
  const operation = saveQueue.then(() => store.saveRun(run));
  saveQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}
