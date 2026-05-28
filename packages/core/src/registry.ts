export type TaskId = "mockup" | "logo" | "asset" | "deck";
export type ProviderId = "fal" | "internal" | "mock";
export type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "boolean"
  | "image"
  | "images"
  | "aspectRatio";

export type SynthIdPolicy = {
  status: "none" | "possible" | "expected";
  note: string;
  applyUpscaleByDefault: boolean;
};

export type FieldSpec = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean | string[];
  options?: Array<{ label: string; value: string }>;
  help?: string;
  accepts?: string[];
};

export type OutputSpec = {
  kind: "image" | "images" | "svg" | "deck" | "text";
  path: string;
  shape: Record<string, string>;
};

export type TaskSpec = {
  id: TaskId;
  label: string;
  description: string;
  defaultModelId: string;
};

export type ModelSpec = {
  id: string;
  label: string;
  taskIds: TaskId[];
  provider: ProviderId;
  endpoint: string;
  costTier: "free-mock" | "cheap" | "standard" | "expensive";
  speed: "fast" | "medium" | "slow";
  inputFields: FieldSpec[];
  providerInputMap: Record<string, string>;
  output: OutputSpec;
  synthId: SynthIdPolicy;
  defaultPostprocessors: string[];
  ui: {
    shortName: string;
    accent: string;
    recommendedFor: string[];
  };
};

export type UpscalerSpec = {
  id: string;
  label: string;
  provider: ProviderId;
  endpoint: string;
  inputFields: FieldSpec[];
  output: OutputSpec;
  preservesComposition: "high" | "medium" | "low";
  defaultForSynthId: boolean;
  note: string;
};

const basePromptField: FieldSpec = {
  key: "prompt",
  label: "Prompt",
  kind: "textarea",
  required: true,
  placeholder: "Describe the result Ray wants to see..."
};

const aspectField: FieldSpec = {
  key: "aspectRatio",
  label: "Aspect ratio",
  kind: "aspectRatio",
  defaultValue: "2:3",
  options: [
    { label: "Portrait", value: "2:3" },
    { label: "Square", value: "1:1" },
    { label: "Landscape", value: "16:9" },
    { label: "Slide", value: "16:10" }
  ]
};

const countField: FieldSpec = {
  key: "count",
  label: "Count",
  kind: "number",
  defaultValue: 1,
  help: "Keep live tests at 1 unless the user asks for more."
};

export const TASKS: TaskSpec[] = [
  {
    id: "mockup",
    label: "Interface mockup",
    description: "Generate web, app, and product-interface mockup imagery.",
    defaultModelId: "grok-imagine"
  },
  {
    id: "logo",
    label: "Logo / mark",
    description: "Generate brand marks, lockups, and logo directions.",
    defaultModelId: "grok-imagine"
  },
  {
    id: "asset",
    label: "Design asset",
    description: "Generate reusable imagery, textures, and campaign assets.",
    defaultModelId: "grok-imagine"
  },
  {
    id: "deck",
    label: "Slide deck",
    description: "Create deck assets and slide-plan artifacts from references.",
    defaultModelId: "mock-deck-planner"
  }
];

export const MODEL_REGISTRY: ModelSpec[] = [
  {
    id: "grok-imagine",
    label: "Grok Imagine",
    taskIds: ["mockup", "logo", "asset"],
    provider: "fal",
    endpoint: "xai/grok-imagine-image",
    costTier: "cheap",
    speed: "fast",
    inputFields: [basePromptField, aspectField, countField],
    providerInputMap: {
      prompt: "prompt",
      aspectRatio: "aspect_ratio"
    },
    output: {
      kind: "images",
      path: "images[]",
      shape: {
        "images[].url": "string",
        "images[].width": "number?",
        "images[].height": "number?"
      }
    },
    synthId: {
      status: "none",
      note: "No SynthID policy is declared for this model in the registry.",
      applyUpscaleByDefault: false
    },
    defaultPostprocessors: [],
    ui: {
      shortName: "Grok",
      accent: "#111318",
      recommendedFor: ["Fast mockup ideation", "Low-cost live smoke tests"]
    }
  },
  {
    id: "nano-banana-2",
    label: "Nano Banana 2",
    taskIds: ["mockup", "logo", "asset"],
    provider: "fal",
    endpoint: "fal-ai/nano-banana-2",
    costTier: "standard",
    speed: "medium",
    inputFields: [basePromptField, aspectField, countField],
    providerInputMap: {
      prompt: "prompt",
      aspectRatio: "aspect_ratio"
    },
    output: {
      kind: "images",
      path: "images[]",
      shape: {
        "images[].url": "string",
        "images[].width": "number?",
        "images[].height": "number?"
      }
    },
    synthId: {
      status: "expected",
      note: "Google AI-generated imagery can carry SynthID; keep this model on the watermark-safe postprocess path.",
      applyUpscaleByDefault: true
    },
    defaultPostprocessors: ["aura-sr"],
    ui: {
      shortName: "Nano",
      accent: "#476A42",
      recommendedFor: ["Typography-sensitive edits", "High-fidelity Google-family image tasks"]
    }
  },
  {
    id: "gpt-image-2",
    label: "GPT Image 2 via FAL",
    taskIds: ["mockup", "logo", "asset"],
    provider: "fal",
    endpoint: "openai/gpt-image-2",
    costTier: "expensive",
    speed: "slow",
    inputFields: [
      basePromptField,
      aspectField,
      countField,
      {
        key: "quality",
        label: "Quality",
        kind: "select",
        defaultValue: "low",
        options: [
          { label: "Low", value: "low" },
          { label: "Medium", value: "medium" },
          { label: "High", value: "high" }
        ],
        help: "Use low for tests."
      }
    ],
    providerInputMap: {
      prompt: "prompt",
      aspectRatio: "aspect_ratio",
      quality: "quality"
    },
    output: {
      kind: "images",
      path: "images[]",
      shape: {
        "images[].url": "string",
        "images[].b64_json": "string?"
      }
    },
    synthId: {
      status: "possible",
      note: "Treat provider-level provenance/watermarking as possible unless verified per endpoint.",
      applyUpscaleByDefault: false
    },
    defaultPostprocessors: [],
    ui: {
      shortName: "GPT Img",
      accent: "#355C7D",
      recommendedFor: ["High-quality concept renders when speed/cost are acceptable"]
    }
  },
  {
    id: "mock-deck-planner",
    label: "Deck Planner (mock)",
    taskIds: ["deck"],
    provider: "mock",
    endpoint: "mock/deck-planner",
    costTier: "free-mock",
    speed: "fast",
    inputFields: [
      basePromptField,
      {
        key: "references",
        label: "Reference images",
        kind: "images",
        accepts: ["image/png", "image/jpeg", "image/webp"]
      },
      {
        key: "slideCount",
        label: "Slide count",
        kind: "number",
        defaultValue: 8
      }
    ],
    providerInputMap: {
      prompt: "prompt",
      references: "references",
      slideCount: "slide_count"
    },
    output: {
      kind: "deck",
      path: "deck",
      shape: {
        "deck.title": "string",
        "deck.slides[]": "{title, notes, assetPrompt}"
      }
    },
    synthId: {
      status: "none",
      note: "Planning text has no image watermark concern.",
      applyUpscaleByDefault: false
    },
    defaultPostprocessors: [],
    ui: {
      shortName: "Deck",
      accent: "#7C5A2D",
      recommendedFor: ["Future slide-generation workflow scaffolding"]
    }
  }
];

export const UPSCALER_REGISTRY: UpscalerSpec[] = [
  {
    id: "aura-sr",
    label: "AuraSR",
    provider: "fal",
    endpoint: "fal-ai/aura-sr",
    inputFields: [
      {
        key: "image_url",
        label: "Image URL",
        kind: "image",
        required: true
      },
      {
        key: "upscale_factor",
        label: "Upscale factor",
        kind: "number",
        defaultValue: 4
      },
      {
        key: "checkpoint",
        label: "Checkpoint",
        kind: "select",
        defaultValue: "v2",
        options: [
          { label: "v1", value: "v1" },
          { label: "v2", value: "v2" }
        ]
      }
    ],
    output: {
      kind: "image",
      path: "image",
      shape: {
        "image.url": "string",
        "image.width": "number",
        "image.height": "number"
      }
    },
    preservesComposition: "high",
    defaultForSynthId: true,
    note: "Default watermark-safe postprocessor because it is an upscaler rather than a prompt reinterpretation model."
  }
];

export function getTask(taskId: TaskId): TaskSpec {
  const task = TASKS.find((item) => item.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  return task;
}

export function getModel(modelId: string): ModelSpec {
  const model = MODEL_REGISTRY.find((item) => item.id === modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  return model;
}

export function getUpscaler(upscalerId: string): UpscalerSpec {
  const upscaler = UPSCALER_REGISTRY.find((item) => item.id === upscalerId);
  if (!upscaler) throw new Error(`Unknown upscaler: ${upscalerId}`);
  return upscaler;
}

export function modelsForTask(taskId: TaskId): ModelSpec[] {
  return MODEL_REGISTRY.filter((model) => model.taskIds.includes(taskId));
}

export function defaultModelForTask(taskId: TaskId): ModelSpec {
  return getModel(getTask(taskId).defaultModelId);
}

export function shouldApplyDefaultUpscaler(model: ModelSpec): boolean {
  return model.synthId.applyUpscaleByDefault && model.defaultPostprocessors.length > 0;
}
