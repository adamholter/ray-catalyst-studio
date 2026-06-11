import cors from "cors";
import crypto from "node:crypto";
import express from "express";
import {
  MODEL_REGISTRY,
  EDIT_MODEL_REGISTRY,
  TASKS,
  UPSCALER_REGISTRY,
  createRunRequestSchema,
  defaultModelForTask,
  modelsForTask
} from "@ray-catalyst/core";
import { config } from "./config";
import { enqueueRun, executeImageEdit, executeUpscale, executeVectorize } from "./runner";
import { deleteRun, getRun, listRuns, saveRun } from "./store/runStore";
import { convertRunToMockup, editMockupLayout } from "./providers/extractor";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "25mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      providerMode: config.providerMode,
      liveProvidersConfigured: {
        fal: Boolean(config.falKey),
        openRouter: Boolean(config.openRouterKey)
      }
    });
  });

  app.get("/api/capabilities", (_req, res) => {
    res.json({
      tasks: TASKS,
      models: MODEL_REGISTRY,
      editModels: EDIT_MODEL_REGISTRY,
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
      const runs = await listRuns();
      res.json({ runs });
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

  app.delete("/api/runs/:id", async (req, res, next) => {
    try {
      const deleted = await deleteRun(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
      res.json({ deleted: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/runs", async (req, res, next) => {
    try {
      const request = createRunRequestSchema.parse(req.body);
      const run = await enqueueRun(request);
      res.status(202).json({ run });
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

  app.post("/api/runs/:id/vectorize", async (req, res, next) => {
    try {
      const run = await executeVectorize(req.params.id, req.body.imageUrl);
      res.status(run.status === "failed" ? 500 : 200).json({ run });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/runs/:id/edit-image", async (req, res, next) => {
    try {
      const run = await executeImageEdit(
        req.params.id,
        typeof req.body.imageUrl === "string" ? req.body.imageUrl : undefined,
        String(req.body.prompt || ""),
        typeof req.body.modelId === "string" ? req.body.modelId : "gpt-image-2",
        {
          quality: typeof req.body.quality === "string" ? req.body.quality : undefined,
          resolution: typeof req.body.resolution === "string" ? req.body.resolution : undefined
        }
      );
      res.status(run.status === "failed" ? 500 : 200).json({ run });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/runs/:id/convert", async (req, res, next) => {
    try {
      const run = await getRun(req.params.id);
      if (!run) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
      const mockup = await convertRunToMockup(run);
      run.output = {
        ...run.output,
        mockup
      };
      await saveRun(run);
      res.json({ run });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/mockups/import", async (req, res, next) => {
    try {
      const image = req.body?.image;
      const dataUrl = typeof image?.dataUrl === "string" ? image.dataUrl : "";
      if (!dataUrl.startsWith("data:image/")) {
        res.status(400).json({ error: "Upload an image mockup to convert." });
        return;
      }
      const rawWidth = typeof image.width === "number" ? image.width : undefined;
      const rawHeight = typeof image.height === "number" ? image.height : undefined;
      const width = rawWidth && rawWidth >= 128 ? rawWidth : 864;
      const height = rawHeight && rawHeight >= 128 ? rawHeight : 1296;

      const now = new Date().toISOString();
      const run = await saveRun({
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        status: "succeeded",
        request: {
          taskId: "mockup",
          modelId: "gpt-image-2",
          inputs: {
            prompt: typeof req.body?.prompt === "string" ? req.body.prompt : "Uploaded raster mockup",
            aspectRatio: typeof req.body?.aspectRatio === "string" ? req.body.aspectRatio : "2:3",
            source: "upload"
          },
          attachments: []
        },
        model: {
          id: "gpt-image-2",
          label: "Uploaded Mockup",
          provider: "mock",
          endpoint: "local-upload",
          synthId: { status: "none", note: "Uploaded source image.", applyUpscaleByDefault: false },
          defaultPostprocessors: []
        },
        output: {
          images: [
            {
              url: dataUrl,
              width,
              height,
              contentType: typeof image.mimeType === "string" ? image.mimeType : "image/png",
              createdAt: now,
              operation: "generated",
              modelId: "upload",
              prompt: typeof req.body?.prompt === "string" ? req.body.prompt : "Uploaded raster mockup"
            }
          ]
        },
        events: [{ at: now, message: "Uploaded raster mockup" }]
      });

      const mockup = await convertRunToMockup(run);
      run.output = {
        ...run.output,
        mockup
      };
      run.updatedAt = new Date().toISOString();
      run.events.push({ at: run.updatedAt, message: "Converted upload to editable HTML mockup" });
      await saveRun(run);
      res.status(201).json({ run });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/runs/:id/edit-mockup", async (req, res, next) => {
    try {
      const run = await getRun(req.params.id);
      if (!run) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
      if (!run.output?.mockup) {
        res.status(400).json({ error: "No mockup exists on this run to edit" });
        return;
      }
      const { prompt, html, css } = req.body;
      const baseMockup = {
        ...run.output.mockup,
        html: typeof html === "string" ? html : run.output.mockup.html,
        css: typeof css === "string" ? css : run.output.mockup.css
      };
      const updatedMockup = await editMockupLayout(baseMockup, String(prompt || ""));
      run.output = {
        ...run.output,
        mockup: updatedMockup
      };
      await saveRun(run);
      res.json({ run });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/runs/:id/mockup", async (req, res, next) => {
    try {
      const run = await getRun(req.params.id);
      if (!run) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
      if (!run.output?.mockup) {
        res.status(400).json({ error: "No mockup exists on this run to save" });
        return;
      }
      run.output = {
        ...run.output,
        mockup: {
          ...run.output.mockup,
          html: typeof req.body.html === "string" ? req.body.html : run.output.mockup.html,
          css: typeof req.body.css === "string" ? req.body.css : run.output.mockup.css,
          generatedAt: new Date().toISOString()
        }
      };
      await saveRun(run);
      res.json({ run });
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
