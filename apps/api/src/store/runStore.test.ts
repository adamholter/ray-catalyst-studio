import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { RunRecord } from "@ray-catalyst/core";
import { config } from "../config";

test("file storage preserves old runs, rejects corruption, and serializes mutations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "catalyst-store-test-"));
  config.storeDriver = "file";
  config.providerMode = "mock";
  config.assetStorageDriver = "none";
  config.dataDir = directory;
  config.maxStoredRuns = 1;
  const { saveRun, listRuns, deleteRun } = await import("./runStore");
  const file = join(directory, "runs.json");
  const run = (id: string) => ({
    id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    status: "succeeded", events: [], request: { taskId: "logo", inputs: {}, attachments: [] }
  } as unknown as RunRecord);

  await saveRun(run("first"));
  await saveRun(run("second"));
  assert.equal((await listRuns()).length, 2, "the configured list limit must not delete saved results");
  await Promise.all([saveRun(run("third")), deleteRun("first"), saveRun(run("fourth"))]);
  assert.deepEqual((await listRuns()).map((item) => item.id).sort(), ["fourth", "second", "third"]);

  for (const corrupted of ["{broken", "{}"]) {
    await writeFile(file, corrupted);
    await assert.rejects(saveRun(run("fifth")), /Existing data has not been replaced/);
    await assert.rejects(listRuns(), /Existing data has not been replaced/);
    assert.equal(await readFile(file, "utf8"), corrupted);
  }
  await writeFile(file, "[]");
  await saveRun(run("recovered"));
  assert.equal((await listRuns())[0].id, "recovered", "a failed write must not poison the queue");
});
