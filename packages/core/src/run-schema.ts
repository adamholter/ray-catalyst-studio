import { z } from "zod";
import { MODEL_REGISTRY, TASKS, UPSCALER_REGISTRY, type ModelSpec } from "./registry";

const taskIds = TASKS.map((task) => task.id) as [string, ...string[]];
const modelIds = MODEL_REGISTRY.map((model) => model.id) as [string, ...string[]];
const upscalerIds = UPSCALER_REGISTRY.map((upscaler) => upscaler.id) as [string, ...string[]];

export const attachmentSchema = z.object({
  name: z.string(),
  mimeType: z.string(),
  dataUrl: z.string()
});

export type Attachment = z.infer<typeof attachmentSchema>;

export const createRunRequestSchema = z.object({
  taskId: z.enum(taskIds),
  modelId: z.enum(modelIds),
  inputs: z.record(z.string(), z.unknown()),
  postprocess: z
    .object({
      upscalerId: z.enum(upscalerIds).nullable().optional(),
      applyUpscale: z.boolean().optional()
    })
    .optional(),
  attachments: z.array(attachmentSchema).default([])
});

export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;

export type GeneratedImage = {
  url: string;
  width?: number;
  height?: number;
  contentType?: string;
  createdAt?: string;
  parentIndex?: number;
  operation?: "generated" | "edited" | "enhanced" | "vectorized";
  modelId?: string;
  prompt?: string;
};

export type ExtractedAsset = {
  id: string;
  name: string;
  url: string;
  type: "image" | "logo" | "icon" | "button" | "background";
  dimensions?: string;
  status?: "source-crop" | "planned" | "generated" | "failed";
  extractionPrompt?: string;
  cleanup?: {
    removeText?: boolean;
    removeOverlays?: boolean;
    notes?: string[];
  };
  backgroundRemoval?: {
    needed?: boolean;
    applied?: boolean;
    reason?: string;
    modelId?: string;
  };
  source?: {
    imageUrl: string;
    markedImageUrl?: string;
    sourceWidth: number;
    sourceHeight: number;
    crop: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
};

export type EditableMockup = {
  id: string;
  sourceImageUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  html: string;
  css: string;
  assets: ExtractedAsset[];
  generatedAt: string;
  layoutModel?: string;
  comparison?: {
    status: "not-run" | "ready-for-review" | "reviewed";
    notes: string[];
  };
};

export type BrandConcept = {
  name: string;
  tagline: string;
  personality: string[];
  audience: string;
  colors: Record<string, string>;
  fonts: {
    display: string;
    body: string;
    googleFontsUrl?: string;
  };
  icons: Array<{
    name: string;
    description: string;
    use?: string;
  }>;
  prompts: {
    referenceSheet: string;
    heroBackground: string;
    lightPattern: string;
    darkPattern: string;
  };
  imageStrategy?: string;
  imageModels: {
    referenceSheet: string;
    refResolution: string;
    assets: string;
  };
};

export type BrandIdentityOutput = {
  concept: BrandConcept;
  skillMarkdown: string;
  showcaseHtml: string;
  assets: {
    referenceSheet?: string;
    heroBackground?: string;
    lightPattern?: string;
    darkPattern?: string;
    icons: Array<{ name: string; url: string; source?: "detected" | "generated" | "fallback" }>;
  };
  budget: number;
  generatedAt: string;
};

export type RunOutput = {
  images?: GeneratedImage[];
  text?: string;
  deck?: {
    title: string;
    slides: Array<{ title: string; notes: string; assetPrompt: string }>;
  };
  mockup?: EditableMockup;
  brand?: BrandIdentityOutput;
  raw?: unknown;
};

export type RunRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "queued" | "running" | "succeeded" | "failed";
  request: CreateRunRequest;
  model: Pick<ModelSpec, "id" | "label" | "provider" | "endpoint" | "synthId" | "defaultPostprocessors">;
  output?: RunOutput;
  error?: string;
  events: Array<{ at: string; message: string }>;
};

export function validateRequiredInputs(model: ModelSpec, inputs: Record<string, unknown>): string[] {
  return model.inputFields
    .filter((field) => field.required)
    .filter((field) => {
      const value = inputs[field.key];
      return value === undefined || value === null || value === "";
    })
    .map((field) => `${field.label} is required`);
}
