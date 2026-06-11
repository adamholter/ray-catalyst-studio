export type TaskId = "mockup" | "logo" | "asset" | "brand";
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

export type FieldOption = {
  label: string;
  value: string;
  providerValue?: string;
  width?: number;
  height?: number;
};

export type FieldSpec = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean | string[];
  options?: FieldOption[];
  help?: string;
  accepts?: string[];
  aspectRatioInput?: "aspect_ratio" | "image_size";
};

export type OutputSpec = {
  kind: "image" | "images" | "svg" | "text" | "editable";
  path: string;
  shape: Record<string, string>;
};

export type TaskSpec = {
  id: TaskId;
  label: string;
  description: string;
  defaultModelId: string;
  optionalInputFields?: FieldSpec[];
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

export type EditModelSpec = {
  id: string;
  label: string;
  provider: ProviderId;
  endpoint: string;
  costTier: "cheap" | "standard" | "expensive";
  speed: "fast" | "medium" | "slow";
  inputFields: FieldSpec[];
  output: OutputSpec;
  ui: {
    shortName: string;
    note: string;
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
  placeholder: "Describe the result you want to see..."
};

function aspectField(
  defaultValue: string,
  aspectRatioInput: "aspect_ratio" | "image_size",
  options: FieldOption[]
): FieldSpec {
  return {
    key: "aspectRatio",
    label: "Aspect ratio",
    kind: "aspectRatio",
    defaultValue,
    aspectRatioInput,
    options
  };
}

const gptAspectField = aspectField("2:3", "image_size", [
  { label: "3:1", value: "3:1", width: 1536, height: 512 },
  { label: "21:9", value: "21:9", width: 1792, height: 768 },
  { label: "2:1", value: "2:1", width: 1536, height: 768 },
  { label: "16:9", value: "16:9", width: 1536, height: 864 },
  { label: "16:10", value: "16:10", width: 1536, height: 960 },
  { label: "3:2", value: "3:2", width: 1536, height: 1024 },
  { label: "4:3", value: "4:3", providerValue: "landscape_4_3" },
  { label: "5:4", value: "5:4", width: 1280, height: 1024 },
  { label: "1:1", value: "1:1", providerValue: "square_hd" },
  { label: "4:5", value: "4:5", width: 1024, height: 1280 },
  { label: "3:4", value: "3:4", providerValue: "portrait_4_3" },
  { label: "2:3", value: "2:3", width: 1024, height: 1536 },
  { label: "10:16", value: "10:16", width: 960, height: 1536 },
  { label: "9:16", value: "9:16", providerValue: "portrait_16_9" },
  { label: "1:2", value: "1:2", width: 768, height: 1536 },
  { label: "1:3", value: "1:3", width: 512, height: 1536 }
]);

const nanoBananaAspectField = aspectField("2:3", "aspect_ratio", [
  { label: "8:1", value: "8:1" },
  { label: "4:1", value: "4:1" },
  { label: "21:9", value: "21:9" },
  { label: "16:9", value: "16:9" },
  { label: "3:2", value: "3:2" },
  { label: "4:3", value: "4:3" },
  { label: "5:4", value: "5:4" },
  { label: "1:1", value: "1:1" },
  { label: "4:5", value: "4:5" },
  { label: "3:4", value: "3:4" },
  { label: "2:3", value: "2:3" },
  { label: "9:16", value: "9:16" },
  { label: "1:4", value: "1:4" },
  { label: "1:8", value: "1:8" }
]);

const seedreamAspectField = aspectField("3:4", "image_size", [
  { label: "16:9", value: "16:9", providerValue: "landscape_16_9" },
  { label: "4:3", value: "4:3", providerValue: "landscape_4_3" },
  { label: "1:1", value: "1:1", providerValue: "square_hd" },
  { label: "3:4", value: "3:4", providerValue: "portrait_4_3" },
  { label: "9:16", value: "9:16", providerValue: "portrait_16_9" }
]);

const grokAspectField = aspectField("2:3", "aspect_ratio", [
  { label: "20:9", value: "20:9" },
  { label: "19.5:9", value: "19.5:9" },
  { label: "2:1", value: "2:1" },
  { label: "16:9", value: "16:9" },
  { label: "3:2", value: "3:2" },
  { label: "4:3", value: "4:3" },
  { label: "1:1", value: "1:1" },
  { label: "3:4", value: "3:4" },
  { label: "2:3", value: "2:3" },
  { label: "9:16", value: "9:16" },
  { label: "1:2", value: "1:2" },
  { label: "9:19.5", value: "9:19.5" },
  { label: "9:20", value: "9:20" }
]);

const presetImageSizeAspectField = aspectField("3:4", "image_size", [
  { label: "16:9", value: "16:9", providerValue: "landscape_16_9" },
  { label: "4:3", value: "4:3", providerValue: "landscape_4_3" },
  { label: "1:1", value: "1:1", providerValue: "square_hd" },
  { label: "3:4", value: "3:4", providerValue: "portrait_4_3" },
  { label: "9:16", value: "9:16", providerValue: "portrait_16_9" }
]);


const countField: FieldSpec = {
  key: "count",
  label: "Count",
  kind: "number",
  defaultValue: 1,
  help: "Keep live tests at 1 unless the user asks for more."
};

const logoPaletteField: FieldSpec = {
  key: "colorPalette",
  label: "Color palette",
  kind: "text",
  placeholder: "Optional hex colors: #111318, #F7F3EA",
  help: "Optional. Use exact hex colors when the palette matters."
};

const clientTypeField: FieldSpec = {
  key: "clientType",
  label: "Client / Website Type",
  kind: "text",
  placeholder: "e.g., B2B SaaS dashboard, mobile fitness app, cafe landing page"
};

const clientPreferencesField: FieldSpec = {
  key: "clientPreferences",
  label: "Client Preferences",
  kind: "textarea",
  placeholder: "e.g., Sleek dark mode, vibrant CTA buttons, elegant serif typography"
};

const logoDescriptionField: FieldSpec = {
  key: "logoDescription",
  label: "Logo Description",
  kind: "textarea",
  placeholder: "e.g., Monogram emblem with overlapping C shapes, modern abstract crest"
};

const brandArchetypeField: FieldSpec = {
  key: "brandArchetype",
  label: "Brand Archetype",
  kind: "select",
  defaultValue: "Everyday",
  options: [
    { label: "Everyday (Friendly, down-to-earth)", value: "Everyday" },
    { label: "Creator (Imaginative, innovative)", value: "Creator" },
    { label: "Explorer (Adventurous, free)", value: "Explorer" },
    { label: "Hero (Courageous, bold)", value: "Hero" },
    { label: "Innocent (Optimistic, pure)", value: "Innocent" },
    { label: "Jester (Playful, fun)", value: "Jester" },
    { label: "Lover (Passionate, elegant)", value: "Lover" },
    { label: "Magician (Visionary, magical)", value: "Magician" },
    { label: "Outlaw (Rebellious, edgy)", value: "Outlaw" },
    { label: "Ruler (Authoritative, luxury)", value: "Ruler" },
    { label: "Sage (Wise, knowledgeable)", value: "Sage" },
    { label: "Caregiver (Nurturing, warm)", value: "Caregiver" }
  ]
};

const variationAmountField: FieldSpec = {
  key: "variationAmount",
  label: "Variation Amount",
  kind: "select",
  defaultValue: "standard",
  options: [
    { label: "Standard layout variation", value: "standard" },
    { label: "Low (Very close to reference)", value: "low" },
    { label: "High (Explore wild new layouts)", value: "high" }
  ]
};

export const TASKS: TaskSpec[] = [
  {
    id: "mockup",
    label: "Interface mockup",
    description: "Generate standalone web, app, and product-interface designs, not browser/device-frame presentation scenes.",
    defaultModelId: "gpt-image-2",
    optionalInputFields: [
      clientTypeField,
      clientPreferencesField,
      logoDescriptionField,
      brandArchetypeField,
      variationAmountField,
      logoPaletteField
    ]
  },
  {
    id: "logo",
    label: "Logo / mark",
    description: "Generate brand marks, lockups, and logo directions.",
    defaultModelId: "grok-imagine",
    optionalInputFields: [logoPaletteField]
  },
  {
    id: "asset",
    label: "Design asset",
    description: "Generate reusable imagery, textures, and campaign assets.",
    defaultModelId: "grok-imagine"
  },

  {
    id: "brand",
    label: "Brand identity",
    description: "Generate complete brand systems with strategy, reference imagery, icons, guidelines, and a showcase page.",
    defaultModelId: "brand-identity-pipeline"
  }
];

export const MODEL_REGISTRY: ModelSpec[] = [
  {
    id: "gpt-image-2",
    label: "GPT-Image-2",
    taskIds: ["mockup", "logo", "asset"],
    provider: "fal",
    endpoint: "openai/gpt-image-2",
    costTier: "expensive",
    speed: "slow",
    inputFields: [
      basePromptField,
      gptAspectField,
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
      shortName: "GPT-Image-2",
      accent: "#355C7D",
      recommendedFor: ["High-quality concept renders when speed/cost are acceptable"]
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
    inputFields: [basePromptField, nanoBananaAspectField, countField],
    providerInputMap: {
      prompt: "prompt"
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
      status: "possible",
      note: "Optional enhancement can be applied from an individual result.",
      applyUpscaleByDefault: false
    },
    defaultPostprocessors: ["aura-sr"],
    ui: {
      shortName: "Nano Banana 2",
      accent: "#476A42",
      recommendedFor: ["Typography-sensitive edits", "High-fidelity Google-family image tasks"]
    }
  },
  {
    id: "seedream-5-lite",
    label: "Seedream 5 Lite",
    taskIds: ["mockup", "logo", "asset"],
    provider: "fal",
    endpoint: "fal-ai/bytedance/seedream/v5/lite/text-to-image",
    costTier: "cheap",
    speed: "fast",
    inputFields: [basePromptField, seedreamAspectField, countField],
    providerInputMap: {
      prompt: "prompt"
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
      note: "No special enhancement policy is declared for this model.",
      applyUpscaleByDefault: false
    },
    defaultPostprocessors: [],
    ui: {
      shortName: "Seedream 5 Lite",
      accent: "#6C5B7B",
      recommendedFor: ["Fast creative experiments", "Artistic stylization"]
    }
  },
  {
    id: "grok-imagine",
    label: "Grok Imagine",
    taskIds: ["mockup", "logo", "asset"],
    provider: "fal",
    endpoint: "xai/grok-imagine-image",
    costTier: "cheap",
    speed: "fast",
    inputFields: [basePromptField, grokAspectField, countField],
    providerInputMap: {
      prompt: "prompt"
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
      note: "No special enhancement policy is declared for this model.",
      applyUpscaleByDefault: false
    },
    defaultPostprocessors: [],
    ui: {
      shortName: "Grok Imagine",
      accent: "#111318",
      recommendedFor: ["Fast mockup ideation", "Low-cost live smoke tests"]
    }
  },
  {
    id: "grok-imagine-quality",
    label: "Grok Imagine Quality",
    taskIds: ["mockup", "logo", "asset"],
    provider: "fal",
    endpoint: "xai/grok-imagine-image/quality/text-to-image",
    costTier: "standard",
    speed: "medium",
    inputFields: [
      basePromptField,
      grokAspectField,
      countField,
      {
        key: "resolution",
        label: "Resolution",
        kind: "select",
        defaultValue: "1k",
        options: [
          { label: "1K", value: "1k" },
          { label: "2K", value: "2k" }
        ],
        help: "Quality mode costs more than regular Grok Imagine."
      }
    ],
    providerInputMap: {
      prompt: "prompt",
      resolution: "resolution"
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
      note: "No special enhancement policy is declared for this model.",
      applyUpscaleByDefault: false
    },
    defaultPostprocessors: [],
    ui: {
      shortName: "Grok Quality",
      accent: "#111318",
      recommendedFor: ["Higher-detail Grok generations", "Better text rendering than regular Grok"]
    }
  },
  {
    id: "recraft-v4",
    label: "Recraft V4.1",
    taskIds: ["mockup", "logo", "asset"],
    provider: "fal",
    endpoint: "fal-ai/recraft/v4.1/text-to-image",
    costTier: "standard",
    speed: "medium",
    inputFields: [
      basePromptField,
      presetImageSizeAspectField,
      countField,
      {
        key: "recraftPro",
        label: "Pro",
        kind: "boolean",
        defaultValue: false,
        help: "Use Recraft Pro for higher-fidelity output."
      },
      {
        key: "recraftVector",
        label: "Vector",
        kind: "boolean",
        defaultValue: false,
        help: "Generate editable SVG output instead of raster image output."
      }
    ],
    providerInputMap: {
      prompt: "prompt"
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
      note: "No special enhancement policy is declared for this model.",
      applyUpscaleByDefault: false
    },
    defaultPostprocessors: [],
    ui: {
      shortName: "Recraft V4.1",
      accent: "#C06C84",
      recommendedFor: ["Vector assets", "Sleek branding/mockups"]
    }
  },
  {
    id: "ideogram-v3",
    label: "Ideogram V3",
    taskIds: ["mockup", "logo", "asset"],
    provider: "fal",
    endpoint: "fal-ai/ideogram/v3",
    costTier: "standard",
    speed: "medium",
    inputFields: [basePromptField, presetImageSizeAspectField, countField],
    providerInputMap: {
      prompt: "prompt"
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
      note: "No special enhancement policy is declared for this model.",
      applyUpscaleByDefault: false
    },
    defaultPostprocessors: [],
    ui: {
      shortName: "Ideogram V3",
      accent: "#F8B195",
      recommendedFor: ["Typography and text rendering", "Clean graphic layouts"]
    }
  },

  {
    id: "brand-identity-pipeline",
    label: "Brand Identity Pipeline",
    taskIds: ["brand"],
    provider: "internal",
    endpoint: "internal/brand-identity-pipeline",
    costTier: "standard",
    speed: "slow",
    inputFields: [
      basePromptField,
      {
        key: "budget",
        label: "Budget",
        kind: "number",
        defaultValue: 1.5,
        help: "Target image-generation budget for the brand pipeline."
      },
      {
        key: "references",
        label: "Reference images",
        kind: "images",
        accepts: ["image/png", "image/jpeg", "image/webp"]
      }
    ],
    providerInputMap: {
      prompt: "prompt",
      budget: "budget",
      references: "references"
    },
    output: {
      kind: "text",
      path: "brand",
      shape: {
        "brand.concept.name": "string",
        "brand.showcaseHtml": "string",
        "brand.skillMarkdown": "string",
        "brand.assets.icons[]": "{name,url}"
      }
    },
    synthId: {
      status: "none",
      note: "Brand pipeline text has no watermark concern. Generated image assets may have model-specific provenance.",
      applyUpscaleByDefault: false
    },
    defaultPostprocessors: [],
    ui: {
      shortName: "Brand Pipeline",
      accent: "#D4625A",
      recommendedFor: ["Complete brand identity systems", "Guidelines and showcase generation"]
    }
  }
];

const editQualityField: FieldSpec = {
  key: "quality",
  label: "Quality",
  kind: "select",
  defaultValue: "low",
  options: [
    { label: "Low", value: "low" },
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" }
  ],
  help: "GPT-Image-2 only. Use low for tests."
};

const editResolutionField: FieldSpec = {
  key: "resolution",
  label: "Resolution",
  kind: "select",
  defaultValue: "1k",
  options: [
    { label: "1K", value: "1k" },
    { label: "2K", value: "2k" }
  ]
};

const editOutput: OutputSpec = {
  kind: "images",
  path: "images[]",
  shape: {
    "images[].url": "string",
    "images[].width": "number?",
    "images[].height": "number?"
  }
};

export const EDIT_MODEL_REGISTRY: EditModelSpec[] = [
  {
    id: "gpt-image-2",
    label: "GPT-Image-2",
    provider: "fal",
    endpoint: "openai/gpt-image-2/edit",
    costTier: "expensive",
    speed: "slow",
    inputFields: [editQualityField],
    output: editOutput,
    ui: {
      shortName: "GPT-Image-2",
      note: "Best quality control; exposes quality setting."
    }
  },
  {
    id: "nano-banana-2",
    label: "Nano Banana 2",
    provider: "fal",
    endpoint: "fal-ai/nano-banana-2/edit",
    costTier: "standard",
    speed: "medium",
    inputFields: [],
    output: editOutput,
    ui: {
      shortName: "Nano Banana 2",
      note: "Strong default for precise image edits."
    }
  },
  {
    id: "grok-imagine-edit",
    label: "Grok Imagine",
    provider: "fal",
    endpoint: "xai/grok-imagine-image/edit",
    costTier: "cheap",
    speed: "fast",
    inputFields: [editResolutionField],
    output: editOutput,
    ui: {
      shortName: "Grok Imagine",
      note: "Fast, lower-cost image editing."
    }
  },
  {
    id: "grok-imagine-quality-edit",
    label: "Grok Imagine Quality",
    provider: "fal",
    endpoint: "xai/grok-imagine-image/quality/edit",
    costTier: "standard",
    speed: "medium",
    inputFields: [editResolutionField],
    output: editOutput,
    ui: {
      shortName: "Grok Quality",
      note: "Higher quality Grok editing."
    }
  },
  {
    id: "seedream-5-lite-edit",
    label: "Seedream 5 Lite",
    provider: "fal",
    endpoint: "fal-ai/bytedance/seedream/v5/lite/edit",
    costTier: "cheap",
    speed: "fast",
    inputFields: [],
    output: editOutput,
    ui: {
      shortName: "Seedream 5",
      note: "Fast multi-image-capable editor."
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
    defaultForSynthId: false,
    note: "High-composition-preservation image enhancement."
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

export function getEditModel(modelId: string): EditModelSpec {
  const model = EDIT_MODEL_REGISTRY.find((item) => item.id === modelId);
  if (!model) throw new Error(`Unknown edit model: ${modelId}`);
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
