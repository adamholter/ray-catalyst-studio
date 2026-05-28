import cors from "cors";
import express from "express";
import {
  MODEL_REGISTRY,
  TASKS,
  UPSCALER_REGISTRY,
  createRunRequestSchema,
  defaultModelForTask,
  modelsForTask
} from "@ray-catalyst/core";
import { config } from "./config";
import { executeRun, executeUpscale } from "./runner";
import { getRun, listRuns } from "./store/runStore";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "25mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      providerMode: config.providerMode,
      liveProvidersConfigured: {
        fal: Boolean(config.falKey)
      }
    });
  });

  app.get("/api/capabilities", (_req, res) => {
    res.json({
      tasks: TASKS,
      models: MODEL_REGISTRY,
      upscalers: UPSCALER_REGISTRY,
      defaults: Object.fromEntries(
        TASKS.map((task) => [
          task.id,
          {
            modelId: defaultModelForTask(task.id).id,
            modelIds: modelsForTask(task.id).map((model) => model.id)
          }
        ])
      )
    });
  });

  app.get("/api/runs", async (_req, res, next) => {
    try {
      res.json({ runs: await listRuns() });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/runs/:id", async (req, res, next) => {
    try {
      const run = await getRun(req.params.id);
      if (!run) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
      res.json({ run });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/runs", async (req, res, next) => {
    try {
      const request = createRunRequestSchema.parse(req.body);
      const run = await executeRun(request);
      res.status(run.status === "failed" ? 500 : 201).json({ run });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/runs/:id/upscale", async (req, res, next) => {
    try {
      const run = await executeUpscale(req.params.id, req.body.upscalerId, req.body.imageUrl);
      res.status(run.status === "failed" ? 500 : 200).json({ run });
    } catch (error) {
      next(error);
    }
  });


  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  });

  return app;
}

if (process.env.NODE_ENV !== "test" || process.env.CATALYST_API_PORT) {
  createApp().listen(config.port, () => {
    console.log(`Catalyst API listening on http://127.0.0.1:${config.port} (${config.providerMode})`);
  });
}
