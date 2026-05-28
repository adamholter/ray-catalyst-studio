import type { CreateRunRequest, RunOutput } from "@ray-catalyst/core";
import type { ModelSpec } from "@ray-catalyst/core";

function svgDataUrl(label: string, subtitle: string, aspectRatio: string) {
  const portrait = aspectRatio === "2:3";
  const width = portrait ? 864 : aspectRatio === "16:9" ? 1280 : 1024;
  const height = portrait ? 1296 : aspectRatio === "16:9" ? 720 : 1024;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#f6f3ed"/>
    <rect x="${width * 0.08}" y="${height * 0.08}" width="${width * 0.84}" height="${height * 0.84}" rx="24" fill="#fff" stroke="#ded7cb"/>
    <text x="${width * 0.12}" y="${height * 0.18}" font-family="Georgia, serif" font-size="${Math.round(width * 0.055)}" fill="#171717">Catalyst mock</text>
    <text x="${width * 0.12}" y="${height * 0.25}" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.026)}" fill="#5f5a52">${label}</text>
    <text x="${width * 0.12}" y="${height * 0.31}" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.022)}" fill="#81786b">${subtitle}</text>
    <rect x="${width * 0.12}" y="${height * 0.4}" width="${width * 0.76}" height="${height * 0.42}" rx="18" fill="#151515"/>
    <circle cx="${width * 0.2}" cy="${height * 0.49}" r="${width * 0.035}" fill="#d6f0ff"/>
    <rect x="${width * 0.28}" y="${height * 0.47}" width="${width * 0.46}" height="${height * 0.035}" rx="10" fill="#f3efe6"/>
    <rect x="${width * 0.28}" y="${height * 0.54}" width="${width * 0.34}" height="${height * 0.026}" rx="8" fill="#938c80"/>
    <rect x="${width * 0.28}" y="${height * 0.61}" width="${width * 0.52}" height="${height * 0.14}" rx="14" fill="#2f302d"/>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width,
    height,
    contentType: "image/svg+xml"
  };
}

export async function runMockModel(model: ModelSpec, request: CreateRunRequest): Promise<RunOutput> {
  const prompt = String(request.inputs.prompt || "Untitled request");
  if (model.id === "mock-deck-planner") {
    return {
      deck: {
        title: "Mock deck plan",
        slides: Array.from({ length: Number(request.inputs.slideCount || 6) }, (_, index) => ({
          title: `Slide ${index + 1}`,
          notes: `Plan for: ${prompt}`,
          assetPrompt: `Create a clean slide visual for ${prompt}, slide ${index + 1}`
        }))
      }
    };
  }

  const count = Math.max(1, Math.min(Number(request.inputs.count || 1), 4));
  const aspectRatio = String(request.inputs.aspectRatio || "2:3");
  return {
    images: Array.from({ length: count }, (_, index) =>
      svgDataUrl(model.label, `${prompt.slice(0, 90)}${index > 0 ? ` / ${index + 1}` : ""}`, aspectRatio)
    )
  };
}

export async function runMockUpscaler(output: RunOutput, upscalerId: string): Promise<RunOutput> {
  if (!output.images?.length) return output;
  return {
    ...output,
    images: output.images.map((image) => ({
      ...image,
      url: image.url,
      width: image.width ? image.width * 4 : image.width,
      height: image.height ? image.height * 4 : image.height,
      contentType: image.contentType
    })),
    raw: {
      ...(typeof output.raw === "object" && output.raw ? output.raw : {}),
      postprocess: [{ upscalerId, mode: "mock" }]
    }
  };
}
