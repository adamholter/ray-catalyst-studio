import crypto from "node:crypto";
import { Agent, OpenAIProvider, Runner } from "@openai/agents";
import type { EditableMockup, ExtractedAsset, RunRecord } from "@ray-catalyst/core";
import OpenAI from "openai";
import sharp from "sharp";
import { z } from "zod";
import { config } from "../config";
import { callFalDirect, callFalQueue, uploadFalFile } from "./fal";
import { callOpenRouter, hasLlmCredentials } from "./openrouter";

type Crop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LayoutAsset = {
  id: string;
  name: string;
  type: ExtractedAsset["type"];
  crop: Crop;
  extractionPrompt: string;
  cleanup: NonNullable<ExtractedAsset["cleanup"]>;
  backgroundRemoval?: NonNullable<ExtractedAsset["backgroundRemoval"]>;
  cleanUrl?: string;
  markedSourceUrl?: string;
  assetStatus?: ExtractedAsset["status"];
};

type LayoutSpec = {
  brand: string;
  brandDescription: string;
  navItems: string[];
  heroTitle: string;
  heroKicker: string;
  heroCta: string;
  infoColumns: Array<{ label: string; text: string }>;
  sectionTitle: string;
  sectionAction: string;
  cards: Array<{ date: string; title: string; subtitle: string }>;
  supportTitle: string;
  supportText: string;
  supportCta: string;
  assets: LayoutAsset[];
};

const cropSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
});

const backgroundRemovalSchema = z.object({
  needed: z.boolean().default(false),
  reason: z.string().default("")
});

const layoutAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["image", "logo", "icon", "button", "background"]),
  crop: cropSchema,
  extractionPrompt: z.string(),
  cleanup: z.object({
    removeText: z.boolean().default(true),
    removeOverlays: z.boolean().default(true),
    notes: z.array(z.string()).default([])
  }),
  backgroundRemoval: backgroundRemovalSchema.default({ needed: false, reason: "" })
});

const layoutSpecSchema = z.object({
  brand: z.string(),
  brandDescription: z.string(),
  navItems: z.array(z.string()),
  heroTitle: z.string(),
  heroKicker: z.string(),
  heroCta: z.string(),
  infoColumns: z.array(z.object({ label: z.string(), text: z.string() })),
  sectionTitle: z.string(),
  sectionAction: z.string(),
  cards: z.array(z.object({ date: z.string(), title: z.string(), subtitle: z.string() })),
  supportTitle: z.string(),
  supportText: z.string(),
  supportCta: z.string(),
  assets: z.array(layoutAssetSchema)
});

type LayoutSpecAgentOutput = z.infer<typeof layoutSpecSchema>;

const frontendCodeSchema = z.object({
  html: z.string(),
  css: z.string(),
  notes: z.array(z.string()).default([])
});

type FrontendCode = z.infer<typeof frontendCodeSchema>;

function now() {
  return new Date().toISOString();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cssUrl(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isDataUrl(value: string) {
  return value.startsWith("data:");
}

function bufferFromDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) throw new Error("Invalid data URL image");
  const payload = match[3] || "";
  return match[2] ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload));
}

function contentTypeFromDataUrl(value: string) {
  return value.match(/^data:([^;,]+)?[;,]/)?.[1] || "image/png";
}

async function bufferFromImageUrl(value: string): Promise<Buffer> {
  if (isDataUrl(value)) return bufferFromDataUrl(value);
  const response = await fetch(value);
  if (!response.ok) throw new Error(`Could not fetch source image: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function numberFrom(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function assetPlaceholderDataUrl(asset: Pick<LayoutAsset, "id" | "name" | "crop">) {
  const width = Math.max(320, Math.min(1400, asset.crop.width || 640));
  const height = Math.max(220, Math.min(1200, asset.crop.height || 420));
  const label = escapeHtml(asset.name || asset.id);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#f6f3ed"/>
    <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="18" fill="none" stroke="#d8d2c8" stroke-dasharray="8 8"/>
    <text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.max(16, Math.round(width * 0.035))}" fill="#6f675d">${label}</text>
    <text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.max(12, Math.round(width * 0.022))}" fill="#9a9288">asset extraction pending</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function dimensionsForRun(run: RunRecord) {
  const image = run.output?.images?.[0];
  if (typeof image?.width === "number" && typeof image?.height === "number") {
    return { width: image.width, height: image.height };
  }

  const aspectRatio = String(run.request.inputs.aspectRatio || "2:3");
  if (aspectRatio === "16:9") return { width: 1536, height: 864 };
  if (aspectRatio === "16:10") return { width: 1536, height: 960 };
  if (aspectRatio === "1:1") return { width: 1024, height: 1024 };
  return { width: 1024, height: 1536 };
}

function defaultCrop(id: string, width: number, height: number): Crop {
  const scaleX = width / 1024;
  const scaleY = height / 1536;
  const crops: Record<string, Crop> = {
    "hero-image": { x: 0, y: 0, width: 1024, height: 665 },
    "exhibition-left": { x: 60, y: 898, width: 283, height: 199 },
    "exhibition-center": { x: 370, y: 898, width: 282, height: 199 },
    "exhibition-right": { x: 678, y: 898, width: 282, height: 199 },
    "support-image": { x: 61, y: 1306, width: 899, height: 230 }
  };
  const crop = crops[id] || { x: 0, y: 0, width: 1024, height: Math.min(720, height) };
  return {
    x: Math.round(crop.x * scaleX),
    y: Math.round(crop.y * scaleY),
    width: Math.round(crop.width * scaleX),
    height: Math.round(crop.height * scaleY)
  };
}

function normalizeCrop(raw: unknown, fallback: Crop, width: number, height: number): Crop {
  const candidate = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  let x = numberFrom(candidate.x, fallback.x);
  let y = numberFrom(candidate.y, fallback.y);
  let cropWidth = numberFrom(candidate.width, fallback.width);
  let cropHeight = numberFrom(candidate.height, fallback.height);

  if (x >= 0 && x <= 1 && y >= 0 && y <= 1 && cropWidth > 0 && cropWidth <= 1 && cropHeight > 0 && cropHeight <= 1) {
    x *= width;
    y *= height;
    cropWidth *= width;
    cropHeight *= height;
  }

  x = clamp(Math.round(x), 0, width - 1);
  y = clamp(Math.round(y), 0, height - 1);
  cropWidth = clamp(Math.round(cropWidth), 1, width - x);
  cropHeight = clamp(Math.round(cropHeight), 1, height - y);

  return { x, y, width: cropWidth, height: cropHeight };
}

function sensibleAssetCrop(id: string, crop: Crop, fallback: Crop, sourceWidth: number, sourceHeight: number) {
  const areaRatio = (crop.width * crop.height) / (sourceWidth * sourceHeight);
  if (areaRatio > 0.78) return fallback;
  if (id === "hero-image" && (crop.height > sourceHeight * 0.62 || crop.y > sourceHeight * 0.18)) return fallback;
  if (id.startsWith("exhibition-") && (crop.width > sourceWidth * 0.48 || crop.height > sourceHeight * 0.28)) return fallback;
  if (id === "support-image" && (crop.height > sourceHeight * 0.34 || crop.y < sourceHeight * 0.62)) return fallback;
  return crop;
}

function sourceAsset(
  sourceImageUrl: string,
  sourceWidth: number,
  sourceHeight: number,
  item: LayoutAsset
): ExtractedAsset {
  const url = item.cleanUrl || assetPlaceholderDataUrl(item);
  return {
    id: item.id,
    name: item.name,
    url,
    type: item.type,
    dimensions: `${item.crop.width}x${item.crop.height}`,
    status: item.assetStatus || (item.cleanUrl ? "generated" : "planned"),
    extractionPrompt: item.extractionPrompt,
    cleanup: item.cleanup,
    backgroundRemoval: item.backgroundRemoval,
    source: {
      imageUrl: sourceImageUrl,
      markedImageUrl: item.markedSourceUrl,
      sourceWidth,
      sourceHeight,
      crop: item.crop
    }
  };
}

function defaultLayoutSpec(sourceWidth: number, sourceHeight: number): LayoutSpec {
  return {
    brand: "Brand",
    brandDescription: "Editable landing page converted from a raster mockup",
    navItems: ["Home", "Work", "Services", "About", "Contact"],
    heroTitle: "Editable\nHero\nHeadline.",
    heroKicker: "Replace this supporting copy\nwith the source mockup text",
    heroCta: "Primary action",
    infoColumns: [
      { label: "Detail", text: "Supporting detail\nfrom the source mockup" },
      { label: "Context", text: "Secondary information\nfrom the source mockup" },
      { label: "Action", text: "Conversion fallback\nready for editing" }
    ],
    sectionTitle: "Featured section",
    sectionAction: "View all",
    cards: [
      { date: "Item 01", title: "Editable card\nheadline", subtitle: "Category" },
      { date: "Item 02", title: "Editable card\nheadline", subtitle: "Category" },
      { date: "Item 03", title: "Editable card\nheadline", subtitle: "Category" }
    ],
    supportTitle: "Editable\nfeature block",
    supportText: "This fallback keeps the uploaded image assets editable when layout analysis is unavailable.",
    supportCta: "Edit this block",
    assets: [
      {
        id: "hero-image",
        name: "Header image asset",
        type: "background",
        crop: defaultCrop("hero-image", sourceWidth, sourceHeight),
        extractionPrompt:
          "Extract only the clean hero photograph/artwork from the screenshot. Remove all overlaid UI text, logo/navigation/button/search marks, and remove any dark gradient or tint overlays. Preserve the underlying gallery wall, sculpture, lighting, and shadows as a raw photographic asset.",
        cleanup: {
          removeText: true,
          removeOverlays: true,
          notes: ["Gradient belongs in CSS after extraction, not inside the asset.", "Header/nav/title text must be recreated as editable HTML."]
        },
        backgroundRemoval: {
          needed: false,
          reason: "Large photographic background should keep its natural background; gradients are rebuilt in CSS."
        }
      },
      {
        id: "exhibition-left",
        name: "First exhibition image",
        type: "image",
        crop: defaultCrop("exhibition-left", sourceWidth, sourceHeight),
        extractionPrompt: "Extract only the first exhibition thumbnail image. Remove surrounding title, date, label, arrows, borders, card text, and UI overlays.",
        cleanup: { removeText: true, removeOverlays: true, notes: ["Card text is editable HTML, not part of this asset."] },
        backgroundRemoval: { needed: false, reason: "Card photograph should remain rectangular with its own background." }
      },
      {
        id: "exhibition-center",
        name: "Second exhibition image",
        type: "image",
        crop: defaultCrop("exhibition-center", sourceWidth, sourceHeight),
        extractionPrompt: "Extract only the center exhibition landscape image. Remove surrounding title, date, label, arrows, borders, card text, and UI overlays.",
        cleanup: { removeText: true, removeOverlays: true, notes: ["Card text is editable HTML, not part of this asset."] },
        backgroundRemoval: { needed: false, reason: "Card photograph should remain rectangular with its own background." }
      },
      {
        id: "exhibition-right",
        name: "Third exhibition image",
        type: "image",
        crop: defaultCrop("exhibition-right", sourceWidth, sourceHeight),
        extractionPrompt: "Extract only the third exhibition sculpture image. Remove surrounding title, date, label, arrows, borders, card text, and UI overlays.",
        cleanup: { removeText: true, removeOverlays: true, notes: ["Card text is editable HTML, not part of this asset."] },
        backgroundRemoval: { needed: false, reason: "Card photograph should remain rectangular with its own background." }
      },
      {
        id: "support-image",
        name: "Bottom support image",
        type: "image",
        crop: defaultCrop("support-image", sourceWidth, sourceHeight),
        extractionPrompt:
          "Extract only the clean wide bottom gallery photograph with people and artwork visible. Remove any dark gradient, text overlays, call-to-action text, and UI copy; those must be recreated as CSS and editable HTML.",
        cleanup: {
          removeText: true,
          removeOverlays: true,
          notes: ["Dark overlay belongs in CSS after extraction, not inside the asset.", "Support copy must be editable HTML."]
        },
        backgroundRemoval: {
          needed: false,
          reason: "Wide photographic support asset should keep its background and lighting."
        }
      }
    ]
  };
}

function stringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => String(item || "").trim()).filter(Boolean);
  return items.length ? items : fallback;
}

function textValue(value: unknown, fallback: string) {
  const text = String(value || "").trim();
  return text ? text : fallback;
}

function normalizeLayoutSpec(raw: unknown, sourceWidth: number, sourceHeight: number): LayoutSpec {
  const fallback = defaultLayoutSpec(sourceWidth, sourceHeight);
  if (!raw || typeof raw !== "object") return fallback;
  const data = raw as Record<string, unknown>;

  const rawAssets = Array.isArray(data.assets) ? data.assets : [];
  const assets = fallback.assets.map((fallbackAsset, index) => {
    const candidate = rawAssets.find((item) => item && typeof item === "object" && (item as { id?: string }).id === fallbackAsset.id) || rawAssets[index];
    const assetData = candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>) : {};
    return {
      id: fallbackAsset.id,
      name: textValue(assetData.name, fallbackAsset.name),
      type: (["image", "logo", "icon", "button", "background"].includes(String(assetData.type)) ? assetData.type : fallbackAsset.type) as ExtractedAsset["type"],
      crop: sensibleAssetCrop(
        fallbackAsset.id,
        normalizeCrop(assetData.crop, fallbackAsset.crop, sourceWidth, sourceHeight),
        fallbackAsset.crop,
        sourceWidth,
        sourceHeight
      ),
      extractionPrompt: textValue(assetData.extractionPrompt, fallbackAsset.extractionPrompt),
      cleanup: {
        removeText:
          typeof (assetData.cleanup as Record<string, unknown> | undefined)?.removeText === "boolean"
            ? Boolean((assetData.cleanup as Record<string, unknown>).removeText)
            : fallbackAsset.cleanup.removeText,
        removeOverlays:
          typeof (assetData.cleanup as Record<string, unknown> | undefined)?.removeOverlays === "boolean"
            ? Boolean((assetData.cleanup as Record<string, unknown>).removeOverlays)
            : fallbackAsset.cleanup.removeOverlays,
        notes: stringList((assetData.cleanup as Record<string, unknown> | undefined)?.notes, fallbackAsset.cleanup.notes || [])
      },
      backgroundRemoval: {
        needed:
          typeof (assetData.backgroundRemoval as Record<string, unknown> | undefined)?.needed === "boolean"
            ? Boolean((assetData.backgroundRemoval as Record<string, unknown>).needed)
            : Boolean(fallbackAsset.backgroundRemoval?.needed),
        reason: textValue(
          (assetData.backgroundRemoval as Record<string, unknown> | undefined)?.reason,
          fallbackAsset.backgroundRemoval?.reason || ""
        )
      }
    };
  });

  const rawInfoColumns = Array.isArray(data.infoColumns) ? data.infoColumns : [];
  const rawCards = Array.isArray(data.cards) ? data.cards : [];

  return {
    brand: textValue(data.brand, fallback.brand),
    brandDescription: textValue(data.brandDescription, fallback.brandDescription),
    navItems: stringList(data.navItems, fallback.navItems),
    heroTitle: textValue(data.heroTitle, fallback.heroTitle),
    heroKicker: textValue(data.heroKicker, fallback.heroKicker),
    heroCta: textValue(data.heroCta, fallback.heroCta),
    infoColumns: fallback.infoColumns.map((column, index) => {
      const candidate = rawInfoColumns[index] && typeof rawInfoColumns[index] === "object" ? (rawInfoColumns[index] as Record<string, unknown>) : {};
      return {
        label: textValue(candidate.label, column.label),
        text: textValue(candidate.text, column.text)
      };
    }),
    sectionTitle: textValue(data.sectionTitle, fallback.sectionTitle),
    sectionAction: textValue(data.sectionAction, fallback.sectionAction),
    cards: fallback.cards.map((card, index) => {
      const candidate = rawCards[index] && typeof rawCards[index] === "object" ? (rawCards[index] as Record<string, unknown>) : {};
      return {
        date: textValue(candidate.date, card.date),
        title: textValue(candidate.title, card.title),
        subtitle: textValue(candidate.subtitle, card.subtitle)
      };
    }),
    supportTitle: textValue(data.supportTitle, fallback.supportTitle),
    supportText: textValue(data.supportText, fallback.supportText),
    supportCta: textValue(data.supportCta, fallback.supportCta),
    assets
  };
}

function safeJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("The layout analysis returned invalid JSON");
  }
}

function imageToWebsiteAgentInstructions() {
  return [
    "You convert a raster web mockup screenshot into a compact editable-layout JSON plan.",
    "Use the screenshot as the source of truth. Do not invent unrelated images, brands, sections, or marketing copy.",
    "Identify exactly five image assets when the page has a hero image, three card images, and a bottom image.",
    "Important extraction rule: image assets must be raw clean assets. Never include overlaid text, navigation, logos, buttons, search icons, card copy, CTA copy, dark tints, gradients, shadows used only for text readability, or other layout overlays inside an extracted asset.",
    "Put gradients, dark tints, and readability overlays back into CSS after the clean asset is placed. Put all text back into editable HTML.",
    "For each asset, return a tight bounding box for where the source asset appears in the screenshot. The box will be rendered as a red overlay and sent back to the image extraction model as a locator.",
    "For each asset, write an extractionPrompt that explicitly tells the image extraction model what to remove and what to preserve.",
    "For each asset, decide whether Pixelcut background removal is needed. Use it for isolated logos, icons, stickers, foreground objects, mascot cutouts, and decorations that need transparency. Do not use it for normal rectangular photos, hero backgrounds, gallery images, or texture/background assets.",
    "Return strict JSON only. Do not include markdown.",
    "Crop coordinates may be pixels in the source image or normalized 0-1 values.",
    "Schema:",
    "{ brand, brandDescription, navItems, heroTitle, heroKicker, heroCta, infoColumns:[{label,text}], sectionTitle, sectionAction, cards:[{date,title,subtitle}], supportTitle, supportText, supportCta, assets:[{id,name,type,crop:{x,y,width,height},extractionPrompt,cleanup:{removeText,removeOverlays,notes},backgroundRemoval:{needed,reason}}] }"
  ].join("\n");
}

function openRouterAgentProvider() {
  const client = new OpenAI({
    apiKey: config.openRouterKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://ray-catalyst-studio.local",
      "X-Title": "Ray Catalyst Studio"
    }
  });
  return new OpenAIProvider({
    openAIClient: client,
    useResponses: false,
    strictFeatureValidation: false
  });
}

async function analyzeLayoutWithAgentSdk(imageUrl: string, prompt: string, sourceWidth: number, sourceHeight: number): Promise<LayoutSpec> {
  const provider = openRouterAgentProvider();
  try {
    const agent = new Agent({
      name: "Catalyst image-to-website planner",
      instructions: imageToWebsiteAgentInstructions(),
      model: config.imageToWebsiteAgentModel,
      modelSettings: {
        temperature: 0.1,
        reasoning: { effort: config.openRouterReasoning as "none" | "minimal" | "low" | "medium" | "high" | "xhigh" }
      },
      outputType: layoutSpecSchema
    });
    const runner = new Runner({
      modelProvider: provider,
      tracingDisabled: true,
      traceIncludeSensitiveData: false
    });

    const result = await runner.run(
      agent,
      [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Source dimensions: ${sourceWidth}x${sourceHeight}. User prompt: ${prompt || "No prompt provided."}`
            },
            { type: "input_image", image: imageUrl, detail: "high" }
          ]
        }
      ],
      { maxTurns: 4, signal: AbortSignal.timeout(30_000) }
    );
    return normalizeLayoutSpec(result.finalOutput as LayoutSpecAgentOutput, sourceWidth, sourceHeight);
  } finally {
    await provider.close();
  }
}

async function analyzeLayoutWithOpenRouter(imageUrl: string, prompt: string, sourceWidth: number, sourceHeight: number): Promise<LayoutSpec | null> {
  if (!config.openRouterKey) return null;

  try {
    return await analyzeLayoutWithAgentSdk(imageUrl, prompt, sourceWidth, sourceHeight);
  } catch (error) {
    console.warn("Agents SDK layout analysis failed; falling back to direct OpenRouter JSON call.", error);
  }

  const text = await callOpenRouter(
    [
      { role: "system", content: imageToWebsiteAgentInstructions() },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Source dimensions: ${sourceWidth}x${sourceHeight}. User prompt: ${prompt || "No prompt provided."}`
          },
          { type: "image_url", image_url: { url: imageUrl } }
        ]
      }
    ],
    { json: true, model: config.imageToWebsiteAgentModel, temperature: 0.1, timeoutMs: 25_000 }
  );
  const parsed = safeJson(text);
  return normalizeLayoutSpec(parsed, sourceWidth, sourceHeight);
}

function frontendCodeInstructions(sourceWidth: number, sourceHeight: number) {
  return [
    "You turn a raster website mockup screenshot into editable standalone HTML and CSS.",
    "Use the screenshot as source of truth for layout, typography, spacing, colors, masks, decorative shapes, and text.",
    "Use the provided extracted asset URLs for image areas. Do not use the full source screenshot as a background image and do not mechanically crop screenshot pixels.",
    "Recreate text, buttons, badges, cards, gradients, masks, overlays, and decorative shapes in editable HTML/CSS.",
    "Displayed text should be real HTML text. Add contenteditable=\"true\" to headings, paragraphs, labels, buttons, links, and other user-editable copy.",
    "Image containers that use extracted assets must include data-asset-id with the matching asset id.",
    "The output must be a standalone page inside one .editable-canvas root, with no scripts, no iframes, no external CSS imports, and no browser/device chrome unless the source image itself explicitly depicts one.",
    `Set .editable-canvas width to ${sourceWidth}px and min-height to ${sourceHeight}px. Keep the design responsive enough inside that fixed canvas without horizontal overflow.`,
    "Return strict JSON only with html, css, and notes."
  ].join("\n");
}

function assetBriefForCoding(spec: LayoutSpec) {
  return spec.assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    url: asset.cleanUrl || "",
    dimensions: `${asset.crop.width}x${asset.crop.height}`,
    crop: asset.crop,
    extractionPrompt: asset.extractionPrompt,
    cleanup: asset.cleanup,
    backgroundRemoval: asset.backgroundRemoval
  }));
}

async function codeEditableFrontendWithAgentSdk(
  sourceImageUrl: string,
  prompt: string,
  sourceWidth: number,
  sourceHeight: number,
  spec: LayoutSpec
): Promise<FrontendCode> {
  const provider = openRouterAgentProvider();
  try {
    const agent = new Agent({
      name: "Catalyst editable frontend coder",
      instructions: frontendCodeInstructions(sourceWidth, sourceHeight),
      model: config.imageToWebsiteAgentModel,
      modelSettings: {
        temperature: 0.1,
        reasoning: { effort: config.openRouterReasoning as "none" | "minimal" | "low" | "medium" | "high" | "xhigh" }
      },
      outputType: frontendCodeSchema
    });
    const runner = new Runner({
      modelProvider: provider,
      tracingDisabled: true,
      traceIncludeSensitiveData: false
    });
    const result = await runner.run(
      agent,
      [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                sourceDimensions: { width: sourceWidth, height: sourceHeight },
                userPrompt: prompt || "Uploaded raster website mockup",
                layoutText: {
                  brand: spec.brand,
                  brandDescription: spec.brandDescription,
                  navItems: spec.navItems,
                  heroTitle: spec.heroTitle,
                  heroKicker: spec.heroKicker,
                  heroCta: spec.heroCta,
                  infoColumns: spec.infoColumns,
                  sectionTitle: spec.sectionTitle,
                  sectionAction: spec.sectionAction,
                  cards: spec.cards,
                  supportTitle: spec.supportTitle,
                  supportText: spec.supportText,
                  supportCta: spec.supportCta
                },
                extractedAssets: assetBriefForCoding(spec)
              })
            },
            { type: "input_image", image: sourceImageUrl, detail: "high" }
          ]
        }
      ],
      { maxTurns: 4, signal: AbortSignal.timeout(45_000) }
    );
    return sanitizeFrontendCode(result.finalOutput as FrontendCode);
  } finally {
    await provider.close();
  }
}

async function codeEditableFrontendWithOpenRouter(
  sourceImageUrl: string,
  prompt: string,
  sourceWidth: number,
  sourceHeight: number,
  spec: LayoutSpec
): Promise<FrontendCode | null> {
  if (!config.openRouterKey) return null;

  try {
    return await codeEditableFrontendWithAgentSdk(sourceImageUrl, prompt, sourceWidth, sourceHeight, spec);
  } catch (error) {
    console.warn("Agents SDK frontend coding failed; falling back to direct OpenRouter JSON call.", error);
  }

  const text = await callOpenRouter(
    [
      { role: "system", content: frontendCodeInstructions(sourceWidth, sourceHeight) },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              sourceDimensions: { width: sourceWidth, height: sourceHeight },
              userPrompt: prompt || "Uploaded raster website mockup",
              extractedAssets: assetBriefForCoding(spec)
            })
          },
          { type: "image_url", image_url: { url: sourceImageUrl } }
        ]
      }
    ],
    { json: true, model: config.imageToWebsiteAgentModel, temperature: 0.1, timeoutMs: 45_000 }
  );

  return sanitizeFrontendCode(safeJson(text) as FrontendCode);
}

function sanitizeFrontendCode(code: FrontendCode): FrontendCode {
  const record = code && typeof code === "object" ? (code as Record<string, unknown>) : {};
  return {
    html: textValue(record.html, "").replace(/<script[\s\S]*?<\/script>/gi, ""),
    css: textValue(record.css, "").replace(/@import[^;]+;/gi, ""),
    notes: Array.isArray(record.notes) ? record.notes.map((note) => String(note || "").trim()).filter(Boolean) : []
  };
}

function htmlLines(value: string) {
  return escapeHtml(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("<br />");
}

function cropRule(asset: LayoutAsset, sourceWidth: number, sourceHeight: number) {
  const assetImageUrl = asset.cleanUrl || assetPlaceholderDataUrl(asset);
  const sizing = asset.id === "hero-image" || asset.id === "support-image" ? "" : `\n  width: ${asset.crop.width}px;\n  height: ${asset.crop.height}px;`;
  return `
.asset-${asset.id} {${sizing}
  background-image: url("${cssUrl(assetImageUrl)}");
  background-size: cover;
  background-position: center;
}`;
}

function imageUrlFromFalData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const candidates = [record.image, record.images, record.output, record.data];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const url = imageUrlFromFalData({ image: item });
        if (url) return url;
      }
    } else if (typeof candidate === "object") {
      const nested = candidate as Record<string, unknown>;
      if (typeof nested.url === "string" && nested.url) return nested.url;
      const url = imageUrlFromFalData(candidate);
      if (url) return url;
    }
  }

  if (typeof record.url === "string" && record.url) return record.url;
  return null;
}

const extractionAspectOptions = ["8:1", "4:1", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16", "1:4", "1:8"];

function ratioNumber(value: string) {
  const [rawWidth, rawHeight] = value.split(":");
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? width / height : 1;
}

function extractionAspectRatio(crop: Crop) {
  const target = crop.width / crop.height;
  return extractionAspectOptions.reduce((best, option) => {
    const bestDistance = Math.abs(Math.log(ratioNumber(best) / target));
    const optionDistance = Math.abs(Math.log(ratioNumber(option) / target));
    return optionDistance < bestDistance ? option : best;
  }, "1:1");
}

export function buildMarkedAssetOverlaySvg(asset: Pick<LayoutAsset, "id" | "name" | "crop">, sourceWidth = 1024, sourceHeight = 1536) {
  const stroke = Math.max(4, Math.round(Math.min(sourceWidth, sourceHeight) * 0.006));
  const labelSize = Math.max(18, Math.round(Math.min(sourceWidth, sourceHeight) * 0.026));
  const label = escapeHtml(asset.name || asset.id);
  const labelX = clamp(asset.crop.x, 0, sourceWidth - 1);
  const labelY = Math.max(labelSize + stroke * 2, asset.crop.y - stroke * 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sourceWidth}" height="${sourceHeight}" viewBox="0 0 ${sourceWidth} ${sourceHeight}">
    <rect x="${asset.crop.x}" y="${asset.crop.y}" width="${asset.crop.width}" height="${asset.crop.height}" fill="rgba(255,0,0,0.08)" stroke="#ff1f1f" stroke-width="${stroke}" vector-effect="non-scaling-stroke"/>
    <rect x="${labelX}" y="${labelY - labelSize - stroke}" width="${Math.min(sourceWidth - labelX, Math.max(180, label.length * labelSize * 0.62))}" height="${labelSize + stroke * 2}" rx="${stroke}" fill="#ff1f1f"/>
    <text x="${labelX + stroke * 2}" y="${labelY - stroke}" font-family="Arial, sans-serif" font-size="${labelSize}" font-weight="700" fill="#fff">${label}</text>
  </svg>`;
}

async function createMarkedSourceUrl(sourceBuffer: Buffer, asset: LayoutAsset, sourceWidth: number, sourceHeight: number) {
  const overlay = Buffer.from(buildMarkedAssetOverlaySvg(asset, sourceWidth, sourceHeight));
  const marked = await sharp(sourceBuffer)
    .resize(sourceWidth, sourceHeight, { fit: "fill" })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
  return uploadFalFile(marked, `${asset.id}-marked-source.png`, "image/png");
}

async function removeBackgroundWithPixelcut(imageUrl: string) {
  const result = await callFalDirect("pixelcut/background-removal", {
    image_url: imageUrl,
    output_format: "rgba",
    sync_mode: false
  });
  return imageUrlFromFalData(result);
}

function cropPositionText(crop: Crop, sourceWidth: number, sourceHeight: number) {
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  const horizontal = centerX < sourceWidth / 3 ? "left" : centerX > (sourceWidth * 2) / 3 ? "right" : "center";
  const vertical = centerY < sourceHeight / 3 ? "top" : centerY > (sourceHeight * 2) / 3 ? "bottom" : "middle";
  return `${vertical}-${horizontal} area`;
}

export function buildAssetExtractionPrompt(asset: LayoutAsset, sourceWidth = 1024, sourceHeight = 1536, hasMarkedBox = false) {
  const notes = asset.cleanup.notes?.length ? ` Cleanup notes: ${asset.cleanup.notes.join(" ")}` : "";
  return [
    "Use the full provided website mockup screenshot as the only visual reference.",
    hasMarkedBox
      ? "The provided reference image has a red bounding box and label marking the target asset. Use the red box only to locate the asset; do not include any red outline, label, or annotation in the output."
      : "",
    `Extract/regenerate only this one standalone asset: ${asset.name}.`,
    `Asset position in the mockup: ${cropPositionText(asset.crop, sourceWidth, sourceHeight)}; approximate bounding box x=${asset.crop.x}, y=${asset.crop.y}, width=${asset.crop.width}, height=${asset.crop.height}. This box is a location hint for visual reasoning, not a command to crop pixels.`,
    asset.extractionPrompt,
    "Do not return a rectangular screenshot crop of the page.",
    "Do not include navigation, logos, buttons, UI cards, captions, badges, labels, body copy, decorative overlay shapes, dark readability gradients, white page margins, or surrounding layout chrome unless they are truly part of the raw image asset.",
    "If text or a gradient overlaps the asset in the mockup, reconstruct the underlying clean asset without that overlay.",
    "Return the asset itself as a clean PNG-ready image that can be embedded directly in HTML/CSS with object-fit: cover.",
    asset.backgroundRemoval?.needed
      ? "This asset is expected to become a transparent cutout after extraction; keep the subject clean and separated from any page background."
      : "",
    notes
  ]
    .filter(Boolean)
    .join(" ");
}

async function extractCleanAssets(sourceImageUrl: string, sourceWidth: number, sourceHeight: number, assets: LayoutAsset[]) {
  if (config.providerMode !== "live" || !config.falKey) {
    return assets.map((asset) => ({ ...asset, cleanUrl: assetPlaceholderDataUrl(asset), assetStatus: "planned" as const }));
  }

  let extractionSourceUrl = sourceImageUrl;
  let sourceBuffer: Buffer;
  try {
    sourceBuffer = await bufferFromImageUrl(sourceImageUrl);
  } catch (error) {
    console.warn("Could not read source mockup for red-box extraction references; using the unmarked source image.", error);
    sourceBuffer = Buffer.alloc(0);
  }

  if (isDataUrl(sourceImageUrl)) {
    try {
      extractionSourceUrl = await uploadFalFile(sourceBuffer.length ? sourceBuffer : bufferFromDataUrl(sourceImageUrl), "mockup-source.png", contentTypeFromDataUrl(sourceImageUrl));
    } catch (error) {
      console.warn("Could not upload source mockup for model extraction; using planned placeholders.", error);
      return assets.map((asset) => ({ ...asset, cleanUrl: assetPlaceholderDataUrl(asset), assetStatus: "planned" as const }));
    }
  }

  const extracted: LayoutAsset[] = [];
  for (const asset of assets) {
    try {
      let markedSourceUrl: string | undefined;
      if (sourceBuffer.length) {
        try {
          markedSourceUrl = await createMarkedSourceUrl(sourceBuffer, asset, sourceWidth, sourceHeight);
        } catch (error) {
          console.warn(`Could not create marked source for ${asset.id}; falling back to unmarked source.`, error);
        }
      }
      const prompt = buildAssetExtractionPrompt(asset, sourceWidth, sourceHeight, Boolean(markedSourceUrl));

      const result = await callFalQueue(
        "fal-ai/nano-banana-2/edit",
        {
          prompt,
          image_urls: [markedSourceUrl || extractionSourceUrl],
          num_images: 1,
          aspect_ratio: extractionAspectRatio(asset.crop),
          output_format: "png",
          resolution: "1K"
        },
        120_000
      );
      let cleanUrl = imageUrlFromFalData(result.data);
      let backgroundRemoval = asset.backgroundRemoval;

      if (cleanUrl && asset.backgroundRemoval?.needed) {
        try {
          const cutoutUrl = await removeBackgroundWithPixelcut(cleanUrl);
          if (cutoutUrl) {
            cleanUrl = cutoutUrl;
            backgroundRemoval = {
              ...asset.backgroundRemoval,
              applied: true,
              modelId: "pixelcut/background-removal"
            };
          }
        } catch (error) {
          console.warn(`Pixelcut background removal failed for ${asset.id}; keeping extracted asset.`, error);
          backgroundRemoval = {
            ...asset.backgroundRemoval,
            applied: false,
            modelId: "pixelcut/background-removal"
          };
        }
      }

      extracted.push(
        cleanUrl
          ? { ...asset, markedSourceUrl, cleanUrl, backgroundRemoval, assetStatus: "generated" }
          : { ...asset, markedSourceUrl, cleanUrl: assetPlaceholderDataUrl(asset), assetStatus: "failed" }
      );
    } catch (error) {
      console.warn(`Clean asset extraction failed for ${asset.id}; using planned placeholder.`, error);
      extracted.push({ ...asset, cleanUrl: assetPlaceholderDataUrl(asset), assetStatus: "failed" });
    }
  }
  return extracted;
}

function buildEditableMockup(
  sourceImageUrl: string,
  sourceWidth: number,
  sourceHeight: number,
  spec: LayoutSpec,
  layoutModel?: string,
  code?: FrontendCode | null
): EditableMockup {
  const nav = spec.navItems.map((item) => `<a href="#">${escapeHtml(item)}</a>`).join("");
  const infoColumns = spec.infoColumns
    .map(
      (item) => `
    <div class="info-item">
      <span class="info-label" contenteditable="true">${escapeHtml(item.label)}</span>
      <p contenteditable="true">${htmlLines(item.text)}</p>
    </div>`
    )
    .join("");
  const cards = spec.cards
    .map((card, index) => {
      const assetId = ["exhibition-left", "exhibition-center", "exhibition-right"][index] || "exhibition-left";
      return `
    <article class="exhibition-card">
      <div class="asset-thumb asset-${assetId}" data-asset-id="${assetId}" aria-label="${escapeHtml(spec.assets[index + 1]?.name || "Exhibition image")}"></div>
      <p class="card-date" contenteditable="true">${escapeHtml(card.date)}</p>
      <h3 contenteditable="true">${htmlLines(card.title)}</h3>
      <p class="card-type" contenteditable="true">${escapeHtml(card.subtitle)}</p>
    </article>`;
    })
    .join("");

  const html = `
<div class="editable-canvas">
  <section class="hero">
    <div class="asset-hero-image" data-asset-id="hero-image" aria-label="Header image asset"></div>
    <header class="site-header">
      <div class="brand-block">
        <strong contenteditable="true">${escapeHtml(spec.brand)}</strong>
        <span contenteditable="true">${htmlLines(spec.brandDescription)}</span>
      </div>
      <nav>${nav}</nav>
      <button class="ticket-button" type="button">Tickets</button>
      <span class="search-mark" aria-hidden="true"></span>
    </header>
    <div class="hero-copy">
      <h1 contenteditable="true">${htmlLines(spec.heroTitle)}</h1>
      <p contenteditable="true">${htmlLines(spec.heroKicker)}</p>
      <button type="button">${escapeHtml(spec.heroCta)}</button>
    </div>
  </section>

  <section class="info-strip">
    ${infoColumns}
  </section>

  <section class="exhibitions">
    <div class="section-heading">
      <h2 contenteditable="true">${escapeHtml(spec.sectionTitle)}</h2>
      <a href="#">${escapeHtml(spec.sectionAction)} <span aria-hidden="true">-&gt;</span></a>
    </div>
    <div class="cards">
      ${cards}
    </div>
  </section>

  <section class="support-panel">
    <div class="asset-support-image" data-asset-id="support-image" aria-label="Bottom support image"></div>
    <div class="support-copy">
      <h2 contenteditable="true">${htmlLines(spec.supportTitle)}</h2>
      <p contenteditable="true">${htmlLines(spec.supportText)}</p>
      <a href="#">${escapeHtml(spec.supportCta)} <span aria-hidden="true">-&gt;</span></a>
    </div>
  </section>
</div>`.trim();

  const css = `
:root {
  --ink: #191713;
  --paper: #fbfaf7;
  --muted: #6f675d;
  --line: rgba(25, 23, 19, 0.13);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #f2f0eb;
}

.editable-canvas {
  --source-image: url("${cssUrl(sourceImageUrl)}");
  width: ${sourceWidth}px;
  min-height: ${sourceHeight}px;
  background: var(--paper);
  color: var(--ink);
  font-family: "Inter", "DM Sans", Arial, sans-serif;
  overflow: hidden;
}

[contenteditable="true"] {
  outline: none;
}

[contenteditable="true"]:focus {
  box-shadow: 0 0 0 2px rgba(25, 23, 19, 0.22);
  border-radius: 2px;
}

.hero {
  position: relative;
  min-height: ${Math.round(sourceHeight * 0.433)}px;
  color: #fff;
  overflow: hidden;
}

.asset-hero-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: ${Math.round(sourceHeight * 0.433)}px;
  background-repeat: no-repeat;
}

.asset-hero-image::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(90deg, rgba(31, 27, 22, 1) 0%, rgba(31, 27, 22, 1) 48%, rgba(31, 27, 22, 0.55) 58%, rgba(31, 27, 22, 0.12) 72%, rgba(31, 27, 22, 0) 84%);
}

.site-header {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 300px 1fr auto 32px;
  gap: 26px;
  align-items: start;
  padding: 38px 44px 0;
  text-transform: uppercase;
  letter-spacing: 0.14em;
}

.brand-block {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.brand-block strong {
  font-family: "Instrument Serif", Georgia, serif;
  font-size: 58px;
  line-height: 0.75;
  letter-spacing: 0.03em;
}

.brand-block span {
  max-width: 112px;
  font-size: 12px;
  line-height: 1.32;
}

.site-header nav {
  display: flex;
  gap: 30px;
  justify-content: center;
  padding-top: 14px;
}

.site-header nav a,
.section-heading a,
.support-copy a {
  color: inherit;
  text-decoration: none;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.ticket-button {
  width: 92px;
  height: 38px;
  border: 1px solid rgba(255,255,255,0.76);
  background: transparent;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 12px;
}

.search-mark {
  width: 17px;
  height: 17px;
  border: 2px solid currentColor;
  border-radius: 999px;
  margin-top: 13px;
  position: relative;
}

.search-mark::after {
  content: "";
  position: absolute;
  width: 8px;
  height: 2px;
  background: currentColor;
  right: -6px;
  bottom: -4px;
  transform: rotate(45deg);
}

.hero-copy {
  position: relative;
  z-index: 2;
  width: 390px;
  padding: 118px 0 0 60px;
}

.hero-copy h1 {
  font-family: "Instrument Serif", Georgia, serif;
  font-size: 54px;
  font-weight: 400;
  line-height: 1.1;
  margin: 0 0 28px;
}

.hero-copy p {
  margin: 0 0 28px;
  font-size: 15px;
  line-height: 1.5;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.hero-copy button {
  width: 166px;
  height: 43px;
  border: 1px solid rgba(255,255,255,0.8);
  background: transparent;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 12px;
}

.info-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 28px;
  padding: 36px 60px 34px;
  border-bottom: 1px solid var(--line);
}

.info-item {
  min-height: 66px;
  padding-left: 20px;
  border-left: 1px solid var(--line);
}

.info-label {
  display: block;
  margin-bottom: 18px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.info-item p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  text-transform: uppercase;
}

.exhibitions {
  padding: 44px 60px 58px;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28px;
}

.section-heading h2 {
  margin: 0;
  font-family: "Instrument Serif", Georgia, serif;
  font-size: 28px;
  font-weight: 400;
  text-transform: uppercase;
}

.cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 28px;
}

.exhibition-card {
  min-width: 0;
}

.asset-thumb {
  border-radius: 2px;
  margin-bottom: 24px;
  background-repeat: no-repeat;
}

.card-date,
.card-type {
  margin: 0 0 13px;
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.exhibition-card h3 {
  margin: 0 0 22px;
  font-family: "Instrument Serif", Georgia, serif;
  font-size: 25px;
  font-weight: 400;
  line-height: 1.12;
}

.support-panel {
  position: relative;
  margin: 0 60px;
  height: 230px;
  color: #fff;
  overflow: hidden;
  border-radius: 4px 4px 0 0;
}

.asset-support-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background-repeat: no-repeat;
}

.asset-support-image::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(90deg, rgba(20, 18, 15, 1) 0%, rgba(20, 18, 15, 0.94) 44%, rgba(20, 18, 15, 0.24) 72%, rgba(20, 18, 15, 0) 100%);
}

.support-copy {
  position: relative;
  z-index: 2;
  width: 270px;
  padding: 38px 0 0 38px;
}

.support-copy h2 {
  margin: 0 0 18px;
  font-family: "Instrument Serif", Georgia, serif;
  font-size: 29px;
  font-weight: 400;
  line-height: 1.08;
  text-transform: uppercase;
}

.support-copy p {
  margin: 0 0 28px;
  font-size: 14px;
  line-height: 1.42;
}
${spec.assets.map((asset) => cropRule(asset, sourceWidth, sourceHeight)).join("\n")}
`.trim();

  return {
    id: crypto.randomUUID(),
    sourceImageUrl,
    sourceWidth,
    sourceHeight,
    html: code?.html || html,
    css: code?.css || css,
    assets: spec.assets.map((asset) => sourceAsset(sourceImageUrl, sourceWidth, sourceHeight, asset)),
    generatedAt: now(),
    layoutModel,
    comparison: {
      status: "ready-for-review",
      notes: [
        "Rendered HTML is available in Compare view for browser-side review against the original raster mockup.",
        ...(code?.notes || [])
      ]
    }
  };
}

export async function convertRunToMockup(run: RunRecord): Promise<EditableMockup> {
  const sourceImageUrl = run.output?.images?.[0]?.url;
  if (!sourceImageUrl) throw new Error("No image is available to convert");

  const { width, height } = dimensionsForRun(run);
  const prompt = String(run.request.inputs.prompt || "");
  let spec: LayoutSpec | null = null;
  let layoutModel: string | undefined;

  if (hasLlmCredentials()) {
    try {
      spec = await analyzeLayoutWithOpenRouter(sourceImageUrl, prompt, width, height);
      layoutModel = config.imageToWebsiteAgentModel;
    } catch (error) {
      console.warn("OpenRouter layout analysis failed; using the default asset map with planned extraction placeholders.", error);
    }
  }

  const layoutSpec = spec || defaultLayoutSpec(width, height);
  const assets = await extractCleanAssets(sourceImageUrl, width, height, layoutSpec.assets);
  const finalSpec = { ...layoutSpec, assets };
  let code: FrontendCode | null = null;
  if (hasLlmCredentials()) {
    try {
      code = await codeEditableFrontendWithOpenRouter(sourceImageUrl, prompt, width, height, finalSpec);
    } catch (error) {
      console.warn("OpenRouter frontend coding failed; using the built-in fallback scaffold.", error);
    }
  }
  return buildEditableMockup(sourceImageUrl, width, height, finalSpec, layoutModel, code);
}

export async function editMockupLayout(mockup: EditableMockup, prompt: string): Promise<EditableMockup> {
  if (!prompt.trim()) return mockup;
  if (!hasLlmCredentials()) {
    throw new Error(
      config.llmProvider === "fal-openrouter"
        ? "FAL_KEY is required for prompt-to-edit changes."
        : "OPENROUTER_API_KEY is required for prompt-to-edit changes."
    );
  }

  const text = await callOpenRouter(
    [
      {
        role: "system",
        content:
          "Modify the provided editable HTML/CSS according to the user request. Return strict JSON with html and css only. Preserve asset URLs, data-asset-id attributes, contenteditable attributes, and existing class names unless the edit requires changing them."
      },
      {
        role: "user",
        content: JSON.stringify({
          prompt,
          html: mockup.html,
          css: mockup.css
        })
      }
    ],
    { json: true, temperature: 0.1, timeoutMs: 30_000 }
  );

  const parsed = safeJson(text || "{}") as Record<string, unknown>;
  return {
    ...mockup,
    html: textValue(parsed.html, mockup.html).replace(/<script[\s\S]*?<\/script>/gi, ""),
    css: textValue(parsed.css, mockup.css),
    generatedAt: now(),
    layoutModel: config.openRouterModel
  };
}
