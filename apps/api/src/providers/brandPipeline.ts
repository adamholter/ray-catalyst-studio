import sharp from "sharp";
import type { Attachment, BrandConcept, BrandIdentityOutput, CreateRunRequest, RunOutput } from "@ray-catalyst/core";
import { config } from "../config";
import { callFalDirect, callFalQueue, uploadFalFile } from "./fal";
import { callOpenRouter, callOpenRouterJson } from "./openrouter";

const imageModelGuide = `
IMAGE MODELS - choose based on content type and budget:
- "nano-banana-2": Best quality. Strong logo/icon/text rendering. Use for reference sheets when budget allows.
- "seedream-5": Good all-around quality and strong text. Good default for assets.
- "z-image-turbo": Cheapest. Use only for photographic textures/backgrounds, not logos or text.
Return imageModels as {"referenceSheet":"nano-banana-2","refResolution":"1K","assets":"seedream-5"} unless the brief and budget strongly suggest otherwise.
`;

const mockConcept: BrandConcept = {
  name: "KOVA",
  tagline: "Move with intention.",
  personality: ["kinetic", "precise", "bold", "athletic", "focused"],
  audience: "Performance athletes who prioritize technique over trophies",
  colors: {
    primary: "#FF3B00",
    secondary: "#1A1A2E",
    accent: "#FFD600",
    neutral: "#F5F5F0",
    neutralDark: "#1C1C1E"
  },
  fonts: {
    display: "Bebas Neue",
    body: "Archivo",
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Archivo:wght@400;500;600&display=swap"
  },
  icons: [
    { name: "lightning bolt", description: "speed and energy", use: "performance metrics" },
    { name: "target", description: "precision and goals", use: "goal tracking" },
    { name: "flame", description: "intensity and heat", use: "workout intensity" },
    { name: "stopwatch", description: "timing and records", use: "personal records" },
    { name: "mountain peak", description: "achievement", use: "milestones" },
    { name: "forward arrow", description: "progress", use: "navigation" }
  ],
  prompts: {
    referenceSheet:
      "Brand reference sheet for KOVA athletic brand. Pure white background. Center K logo mark in Vermilion #FF3B00. Color palette row. 6 flat vector icons in a single horizontal row: lightning bolt, target, flame, stopwatch, mountain peak, arrow. No labels near icons. Typography specimens.",
    heroBackground: "Dark athletic texture, deep navy blue to black gradient, subtle diagonal speed lines, dramatic cinematic lighting.",
    lightPattern: "Minimal dot-grid on off-white cream, subtle geometric diamond tessellation, clean premium athletic surface.",
    darkPattern: "Dark navy with subtle geometric hexagon pattern, premium athletic, sophisticated texture."
  },
  imageStrategy: "Use generated reference imagery as a coherent source for the icon family and supporting brand surfaces.",
  imageModels: { referenceSheet: "nano-banana-2", refResolution: "1K", assets: "seedream-5" }
};

type BrandUpdate = (message: string) => Promise<void>;

function svgDataUri(label: string, color = "#D4625A", dark = "#111318") {
  const safeLabel = label.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600"><rect width="900" height="600" fill="#f7f4ee"/><circle cx="720" cy="120" r="190" fill="${color}" opacity=".18"/><rect x="90" y="110" width="720" height="380" rx="32" fill="#fff" stroke="#e5ded2"/><text x="130" y="245" font-family="Arial, sans-serif" font-size="80" font-weight="700" fill="${dark}">${safeLabel}</text><text x="130" y="320" font-family="Arial, sans-serif" font-size="28" fill="${color}">Brand Catalyst mock asset</text><g fill="${color}"><circle cx="145" cy="405" r="28"/><circle cx="220" cy="405" r="28"/><circle cx="295" cy="405" r="28"/></g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const item = data as Record<string, unknown>;
  if (typeof item.url === "string") return item.url;
  const image = item.image as Record<string, unknown> | undefined;
  if (typeof image?.url === "string") return image.url;
  const images = item.images;
  if (Array.isArray(images)) {
    for (const candidate of images) {
      const url = getUrl(candidate);
      if (url) return url;
    }
  }
  for (const key of ["output", "data", "result"]) {
    const url = getUrl(item[key]);
    if (url) return url;
  }
  return null;
}

function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Only base64 data URLs can be uploaded as brand references.");
  return {
    buffer: Buffer.from(match[2], "base64"),
    mimeType: match[1]
  };
}

async function uploadReferences(attachments: Attachment[], update: BrandUpdate) {
  if (!attachments.length || config.providerMode === "mock") return [];
  await update(`Uploading ${attachments.length} reference image${attachments.length === 1 ? "" : "s"}`);
  const urls = await Promise.all(
    attachments.slice(0, 4).map(async (attachment, index) => {
      const { buffer, mimeType } = dataUrlToBuffer(attachment.dataUrl);
      const extension = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
      return uploadFalFile(buffer, `brand-reference-${index + 1}.${extension}`, mimeType);
    })
  );
  return urls.filter(Boolean);
}

function normalizeConcept(raw: BrandConcept): BrandConcept {
  const concept = { ...mockConcept, ...raw };
  concept.colors = { ...mockConcept.colors, ...(raw.colors || {}) };
  concept.fonts = { ...mockConcept.fonts, ...(raw.fonts || {}) };
  concept.prompts = { ...mockConcept.prompts, ...(raw.prompts || {}) };
  concept.imageModels = {
    referenceSheet: raw.imageModels?.referenceSheet || "nano-banana-2",
    refResolution: raw.imageModels?.refResolution || "1K",
    assets: raw.imageModels?.assets || "seedream-5"
  };
  concept.icons = (raw.icons?.length ? raw.icons : mockConcept.icons).slice(0, 6);
  while (concept.icons.length < 6) {
    concept.icons.push(mockConcept.icons[concept.icons.length]);
  }
  return concept;
}

async function createConcept(description: string, budget: number, referenceUrls: string[], update: BrandUpdate) {
  await update("Creating brand concept");
  if (config.providerMode === "mock") return mockConcept;

  const imageNote = referenceUrls.length
    ? "Reference images are attached. Use them as style inspiration, logo reference, or direct visual input for image generation when appropriate."
    : "No reference images are attached.";

  return normalizeConcept(
    await callOpenRouterJson<BrandConcept>([
      {
        role: "system",
        content: "You are a creative brand director. Return only strict JSON with no markdown fences."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Create a complete brand identity for: "${description}"\n\n${imageNote}\n\nBudget: $${budget.toFixed(2)} total for all image generation.\n\n${imageModelGuide}\n\nReturn JSON with this exact shape:\n{"name":"...","tagline":"...","personality":["..."],"audience":"...","colors":{"primary":"#...","secondary":"#...","accent":"#...","neutral":"#F5F5F0","neutralDark":"#1A1A1A"},"fonts":{"display":"Distinctive Google Font, not Inter/Roboto/Poppins/Montserrat/DM Sans","body":"Google Font","googleFontsUrl":"..."},"icons":[{"name":"...","description":"...","use":"..."}],"prompts":{"referenceSheet":"Detailed prompt for brand reference sheet. White BG. Center logo mark. Color palette row with hex labels. Exactly 6 flat vector icons in one horizontal row, no labels near icons. Typography specimens.","heroBackground":"...","lightPattern":"...","darkPattern":"..."},"imageStrategy":"...","imageModels":{"referenceSheet":"nano-banana-2","refResolution":"1K","assets":"seedream-5"}}\n\nRules: exactly 6 icons. Avoid #F95301, #8AC245, #6EC1E4. Choose a distinctive display font.`
          },
          ...referenceUrls.map((url) => ({ type: "image_url", image_url: { url } }))
        ]
      }
    ])
  );
}

function imageParams(model: string, prompt: string, imageUrls: string[], resolution = "1K", aspectRatio = "1:1") {
  if (model === "nano-banana-2") {
    const base = { prompt, resolution, aspect_ratio: aspectRatio, num_images: 1, output_format: "png" };
    return imageUrls.length
      ? { endpoint: "fal-ai/nano-banana-2/edit", input: { ...base, image_urls: imageUrls }, direct: false }
      : { endpoint: "fal-ai/nano-banana-2", input: base, direct: false };
  }
  if (model === "seedream-5") {
    const base = { prompt, num_images: 1, max_images: 1, enable_safety_checker: true };
    const imageSize = aspectRatio === "16:9" ? "auto_2K" : "square_hd";
    return imageUrls.length
      ? { endpoint: "fal-ai/bytedance/seedream/v5/lite/edit", input: { ...base, image_urls: imageUrls, image_size: imageSize }, direct: false }
      : { endpoint: "fal-ai/bytedance/seedream/v5/lite/text-to-image", input: { ...base, image_size: imageSize }, direct: false };
  }
  return {
    endpoint: "fal-ai/z-image/turbo",
    input: {
      prompt,
      image_size: aspectRatio === "16:9" ? "landscape_16_9" : "square_hd",
      num_inference_steps: 8,
      num_images: 1,
      output_format: "png",
      acceleration: "regular",
      enable_safety_checker: true
    },
    direct: true
  };
}

async function generateImage(model: string, prompt: string, imageUrls: string[], resolution: string, aspectRatio: string, update: BrandUpdate) {
  if (config.providerMode === "mock") {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return svgDataUri(prompt.slice(0, 28), model === "nano-banana-2" ? "#D4625A" : "#355C7D");
  }
  const params = imageParams(model, prompt, imageUrls, resolution, aspectRatio);
  await update(`Calling ${params.endpoint}`);
  const data = params.direct ? await callFalDirect(params.endpoint, params.input) : (await callFalQueue(params.endpoint, params.input, 180_000)).data;
  const url = getUrl(data);
  if (!url) throw new Error(`No image URL returned from ${params.endpoint}`);
  return url;
}

async function imageBufferFromUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download generated image: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function normalizeBbox(candidate: unknown): [number, number, number, number] | null {
  if (!candidate || typeof candidate !== "object") return null;
  const item = candidate as Record<string, unknown>;
  const raw = Array.isArray(item.bbox) ? item.bbox : Array.isArray(item.bounding_box) ? item.bounding_box : null;
  if (raw && raw.length >= 4) {
    const values = raw.slice(0, 4).map(Number);
    if (values.every(Number.isFinite)) return values as [number, number, number, number];
  }
  const values = [item.x_min, item.y_min, item.x_max, item.y_max].map(Number);
  if (values.every(Number.isFinite)) return values as [number, number, number, number];
  return null;
}

async function cropDetectedIcon(sourceUrl: string, iconName: string) {
  const detection = (await callFalDirect("fal-ai/moondream3-preview/detect", {
    image_url: sourceUrl,
    prompt: `Locate the ${iconName} icon`
  })) as { objects?: unknown[]; detections?: unknown[] };
  const candidate = [...(detection.objects || []), ...(detection.detections || [])][0];
  const bbox = normalizeBbox(candidate);
  if (!bbox) return null;
  const [x1, y1, x2, y2] = bbox;
  const bboxArea = (x2 - x1) * (y2 - y1);
  if (bboxArea <= 0 || bboxArea > 0.35) return null;

  const input = await imageBufferFromUrl(sourceUrl);
  const metadata = await sharp(input).metadata();
  const sourceWidth = metadata.width || 1024;
  const sourceHeight = metadata.height || 1024;
  const pad = 0.015;
  const left = Math.max(0, Math.floor((x1 - pad) * sourceWidth));
  const top = Math.max(0, Math.floor((y1 - pad) * sourceHeight));
  const right = Math.min(sourceWidth, Math.ceil((x2 + pad) * sourceWidth));
  const bottom = Math.min(sourceHeight, Math.ceil((y2 + pad) * sourceHeight));
  const width = Math.max(8, right - left);
  const height = Math.max(8, bottom - top);
  const cropped = await sharp(input).extract({ left, top, width, height }).png().toBuffer();
  return uploadFalFile(cropped, "brand-icon-crop.png", "image/png");
}

async function processIcon(referenceSheetUrl: string, icon: BrandConcept["icons"][number], refModel: string, update: BrandUpdate) {
  if (config.providerMode === "mock") {
    return { name: icon.name, url: svgDataUri(icon.name, "#111318"), source: "generated" as const };
  }

  let workUrl: string | null = null;
  let source: "detected" | "generated" | "fallback" = "fallback";
  try {
    workUrl = await cropDetectedIcon(referenceSheetUrl, icon.name);
    if (workUrl) source = "detected";
  } catch {
    workUrl = null;
  }

  if (!workUrl) {
    const prompt = `Flat vector icon on white background, single clean design: ${icon.name}. ${icon.description}. Minimal, professional, no text, no labels, centered in frame.`;
    workUrl = await generateImage(refModel || "seedream-5", prompt, [], "1K", "1:1", update);
    source = "generated";
  }

  try {
    const upscaled = getUrl(await callFalDirect("fal-ai/seedvr/upscale/image", {
      image_url: workUrl,
      upscale_mode: "factor",
      upscale_factor: 2,
      noise_scale: 0.1,
      output_format: "png"
    }));
    if (upscaled) workUrl = upscaled;
  } catch {
    // Cropped icons are still usable if upscaling fails.
  }

  try {
    const transparent = getUrl(await callFalDirect("fal-ai/birefnet/v2", {
      image_url: workUrl,
      model: "General Use (Light)",
      operating_resolution: "1024x1024",
      refine_foreground: true,
      output_format: "png"
    }));
    if (transparent) workUrl = transparent;
  } catch {
    // Keep the processed icon without background removal if the cleanup model fails.
  }

  return { name: icon.name, url: workUrl || referenceSheetUrl, source };
}

function mockSkillDoc(concept: BrandConcept) {
  return `---\nname: ${concept.name.toLowerCase().replace(/\\s+/g, "-")}-branding\ndescription: "${concept.name} brand guidelines"\n---\n\n# ${concept.name} Brand System\n\n${concept.tagline}\n\n## Color Palette\n\n${Object.entries(concept.colors)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n")}\n\n## Typography\n\n- Display: ${concept.fonts.display}\n- Body: ${concept.fonts.body}\n\n## Personality\n\n${concept.personality.map((item) => `- ${item}`).join("\n")}\n`;
}

function mockShowcase(concept: BrandConcept, heroUrl: string) {
  return `<!DOCTYPE html><html><head><title>${concept.name}</title><style>body{margin:0;font-family:${concept.fonts.body},sans-serif;background:${concept.colors.neutralDark};color:${concept.colors.neutral}}.hero{min-height:100vh;display:grid;place-items:center;background:linear-gradient(90deg,rgba(0,0,0,.7),rgba(0,0,0,.2)),url('${heroUrl}');background-size:cover}.inner{max-width:920px;padding:64px}h1{font-family:${concept.fonts.display},sans-serif;font-size:120px;line-height:.9;margin:0;color:${concept.colors.primary}}p{font-size:28px}</style></head><body><section class="hero"><div class="inner"><h1>${concept.name}</h1><p>${concept.tagline}</p></div></section></body></html>`;
}

export async function runBrandIdentityPipeline(request: CreateRunRequest, update: BrandUpdate): Promise<RunOutput> {
  const description = String(request.inputs.prompt || "").trim();
  if (!description) throw new Error("Describe the brand you want to create.");
  const budget = Math.max(0.1, Number(request.inputs.budget || 1.5));

  const referenceUrls = await uploadReferences(request.attachments || [], update);
  const concept = normalizeConcept(await createConcept(description, budget, referenceUrls, update));
  await update(`Concept: ${concept.name} - ${concept.tagline}`);

  const leanBudget = config.providerMode === "live" && budget < 0.5;
  if (leanBudget) {
    concept.imageModels.referenceSheet = "nano-banana-2";
    concept.imageModels.refResolution = "1K";
    await update(`Lean budget mode: one reference-sheet generation within the $${budget.toFixed(2)} target`);
  }

  await update("Generating reference sheet");
  const referenceSheet = await generateImage(
    concept.imageModels.referenceSheet,
    concept.prompts.referenceSheet,
    referenceUrls,
    concept.imageModels.refResolution,
    "1:1",
    update
  );

  let icons: BrandIdentityOutput["assets"]["icons"];
  let heroBackground: string;
  let lightPattern: string;
  let darkPattern: string;
  if (leanBudget) {
    await update("Using lightweight derived assets to honor the selected budget");
    icons = concept.icons.slice(0, 6).map((icon) => ({ name: icon.name, url: svgDataUri(icon.name, concept.colors.primary, concept.colors.neutralDark), source: "fallback" as const }));
    heroBackground = referenceSheet;
    lightPattern = svgDataUri(`${concept.name} light pattern`, concept.colors.accent, concept.colors.neutralDark);
    darkPattern = svgDataUri(`${concept.name} dark pattern`, concept.colors.secondary, concept.colors.neutralDark);
  } else {
    await update("Generating icons and supporting assets");
    const iconJobs = concept.icons.slice(0, 6).map((icon) =>
      processIcon(referenceSheet, icon, concept.imageModels.referenceSheet, async (message) => update(`${icon.name}: ${message}`))
    );
    const assetJobs = {
      heroBackground: generateImage(concept.imageModels.assets, concept.prompts.heroBackground, [], "1K", "16:9", update),
      lightPattern: generateImage(concept.imageModels.assets, concept.prompts.lightPattern, [], "1K", "1:1", update),
      darkPattern: generateImage(concept.imageModels.assets, concept.prompts.darkPattern, [], "1K", "1:1", update)
    };
    [icons, heroBackground, lightPattern, darkPattern] = await Promise.all([
      Promise.all(iconJobs),
      assetJobs.heroBackground,
      assetJobs.lightPattern,
      assetJobs.darkPattern
    ]);
  }

  await update("Assembling skill document and showcase");
  const skillMarkdown =
    config.providerMode === "mock"
      ? mockSkillDoc(concept)
      : await callOpenRouter([
          {
            role: "user",
            content: `Generate a complete brand skill document for "${concept.name}".\n\nBRAND: ${JSON.stringify(
              {
                name: concept.name,
                tagline: concept.tagline,
                personality: concept.personality,
                colors: concept.colors,
                fonts: concept.fonts,
                audience: concept.audience
              },
              null,
              2
            )}\n\nASSETS:\n- Reference Sheet: ${referenceSheet}\n- Icons: ${icons.map((icon) => `${icon.name}: ${icon.url}`).join("\n")}\n- Hero BG: ${heroBackground}\n- Light Pattern: ${lightPattern}\n- Dark Pattern: ${darkPattern}\n\nFormat as a practical branding skill document with brand philosophy, color palette CSS, typography, asset tables, layout patterns, and a do-not list. Return only markdown.`
          }
        ]);

  const showcaseHtml =
    config.providerMode === "mock"
      ? mockShowcase(concept, heroBackground)
      : await callOpenRouter([
          {
            role: "user",
            content: `Generate a visually strong HTML brand showcase for "${concept.name}".\n\nBRAND: ${JSON.stringify(
              {
                name: concept.name,
                tagline: concept.tagline,
                colors: concept.colors,
                fonts: concept.fonts
              },
              null,
              2
            )}\n\nIMAGES:\n- Hero: ${heroBackground || referenceSheet}\n- Light pattern: ${lightPattern}\n- Dark pattern: ${darkPattern}\n- Ref sheet: ${referenceSheet}\n- Icons: ${icons.map((icon) => `${icon.name}: ${icon.url}`).join("\n")}\n\nGoogle Fonts: ${concept.fonts.googleFontsUrl || ""}\n\nSections: hero, color swatches, typography specimen, icon grid, components, stats block, split layout, footer. Use all relevant image URLs. Self-contained HTML and CSS only. No JavaScript. Return only the HTML starting with <!DOCTYPE html>.`
          }
        ]).then((raw) => raw.match(/<!DOCTYPE html>[\s\S]*<\/html>/i)?.[0] || raw);

  const brand: BrandIdentityOutput = {
    concept,
    skillMarkdown,
    showcaseHtml,
    assets: {
      referenceSheet,
      heroBackground,
      lightPattern,
      darkPattern,
      icons
    },
    budget,
    generatedAt: new Date().toISOString()
  };

  return {
    brand,
    text: `${concept.name}: ${concept.tagline}`,
    raw: { brand }
  };
}
