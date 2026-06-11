import type { CreateRunRequest, RunOutput } from "@ray-catalyst/core";
import type { ModelSpec } from "@ray-catalyst/core";

function svgDataUrl(label: string, subtitle: string, aspectRatio: string) {
  const parts = aspectRatio.split(":");
  let w = 2, h = 3;
  if (parts.length === 2) {
    w = parseFloat(parts[0]) || 2;
    h = parseFloat(parts[1]) || 3;
  }
  const maxDim = 1024;
  const scale = maxDim / Math.max(w, h);
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);
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

export async function runMockVectorizer(output: RunOutput): Promise<RunOutput> {
  if (!output.images?.length) return output;
  return {
    ...output,
    images: output.images.map((image) => {
      const width = image.width || 1024;
      const height = image.height || 1024;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="100%" height="100%" fill="#faf9f5"/>
        <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="Georgia, serif" font-size="32" fill="#111318">✦ Vectorized Mark ✦</text>
        <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#6b7280">Originally: ${image.url.substring(0, 40)}...</text>
        <circle cx="50%" cy="30%" r="40" fill="#c2d8f5" opacity="0.5"/>
      </svg>`;
      return {
        url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        width,
        height,
        contentType: "image/svg+xml"
      };
    }),
    raw: {
      ...(typeof output.raw === "object" && output.raw ? output.raw : {}),
      postprocess: [{ mode: "mock-vectorize" }]
    }
  };
}
