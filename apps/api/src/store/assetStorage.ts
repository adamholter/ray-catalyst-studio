import crypto from "node:crypto";
import { Readable } from "node:stream";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { BrandIdentityOutput, ExtractedAsset, GeneratedImage, RunRecord } from "@ray-catalyst/core";
import { config } from "../config";

type StoredUrl = {
  url: string;
  key: string;
  sourceUrl?: string;
  contentType?: string;
};

export type StoredAssetBody = {
  body: Readable | Uint8Array | string;
  contentType?: string;
  contentLength?: number;
};

let r2Client: S3Client | null = null;

function isR2Enabled() {
  return config.assetStorageDriver === "r2";
}

function getR2Client() {
  if (!isR2Enabled()) throw new Error("R2 asset storage is not enabled");
  if (!config.r2.bucket || !config.r2.endpoint || !config.r2.accessKeyId || !config.r2.secretAccessKey) {
    throw new Error("R2 asset storage requires R2_ENDPOINT or R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY");
  }
  if (!r2Client) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: config.r2.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey
      }
    });
  }
  return r2Client;
}

function encodedKeyPath(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function assetUrlForKey(key: string) {
  if (config.r2.publicBaseUrl) return `${config.r2.publicBaseUrl}/${encodedKeyPath(key)}`;
  return `/api/assets/${encodedKeyPath(key)}`;
}

function isAlreadyStored(url: string) {
  if (url.startsWith("/api/assets/")) return true;
  return Boolean(config.r2.publicBaseUrl && url.startsWith(`${config.r2.publicBaseUrl}/`));
}

function extensionFor(contentType: string, url: string) {
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("png")) return "png";
  try {
    const ext = new URL(url).pathname.split(".").pop()?.toLowerCase();
    if (ext && /^[a-z0-9]{2,5}$/.test(ext)) return ext;
  } catch {
    // Ignore invalid URLs and fall back to png below.
  }
  return "png";
}

function parseDataUrl(url: string) {
  const match = url.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
  if (!match) return null;
  const contentType = match[1] || "application/octet-stream";
  const body = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]));
  return { body, contentType };
}

async function readSource(url: string, fallbackContentType?: string) {
  const data = parseDataUrl(url);
  if (data) return data;

  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Asset download failed: ${response.status}`);
  const contentType = response.headers.get("content-type") || fallbackContentType || "application/octet-stream";
  const body = Buffer.from(await response.arrayBuffer());
  return { body, contentType };
}

function safeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function persistUrl(runId: string, url: string, name: string, fallbackContentType?: string): Promise<StoredUrl | null> {
  if (!isR2Enabled() || !url || isAlreadyStored(url)) return null;

  const source = await readSource(url, fallbackContentType);
  const digest = crypto.createHash("sha256").update(source.body).digest("hex").slice(0, 16);
  const ext = extensionFor(source.contentType, url);
  const key = `runs/${runId}/${safeName(name) || "asset"}-${digest}.${ext}`;

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: key,
      Body: source.body,
      ContentType: source.contentType,
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: {
        catalystRunId: runId,
        sourceHash: digest
      }
    })
  );

  return {
    url: assetUrlForKey(key),
    key,
    sourceUrl: url.startsWith("data:") ? undefined : url,
    contentType: source.contentType
  };
}

async function persistGeneratedImage(runId: string, image: GeneratedImage, index: number): Promise<GeneratedImage> {
  const stored = await persistUrl(runId, image.url, `image-${index + 1}-${image.operation || "generated"}`, image.contentType);
  if (!stored) return image;
  return {
    ...image,
    url: stored.url,
    contentType: stored.contentType || image.contentType,
    storage: {
      provider: "r2",
      key: stored.key,
      sourceUrl: stored.sourceUrl,
      storedAt: new Date().toISOString()
    }
  };
}

async function persistExtractedAsset(runId: string, asset: ExtractedAsset, index: number): Promise<ExtractedAsset> {
  const stored = await persistUrl(runId, asset.url, `mockup-asset-${index + 1}-${asset.name}`, "image/png");
  if (!stored) return asset;
  return {
    ...asset,
    url: stored.url,
    storage: {
      provider: "r2",
      key: stored.key,
      sourceUrl: stored.sourceUrl,
      storedAt: new Date().toISOString()
    }
  };
}

async function persistBrandAssets(runId: string, brand: BrandIdentityOutput): Promise<BrandIdentityOutput> {
  const assets = { ...brand.assets };
  const entries = [
    ["referenceSheet", assets.referenceSheet],
    ["heroBackground", assets.heroBackground],
    ["lightPattern", assets.lightPattern],
    ["darkPattern", assets.darkPattern]
  ] as const;

  for (const [key, url] of entries) {
    if (!url) continue;
    const stored = await persistUrl(runId, url, `brand-${key}`, "image/png");
    if (stored) assets[key] = stored.url;
  }

  assets.icons = await Promise.all(
    assets.icons.map(async (icon, index) => {
      const stored = await persistUrl(runId, icon.url, `brand-icon-${index + 1}-${icon.name}`, "image/png");
      return stored ? { ...icon, url: stored.url } : icon;
    })
  );

  return { ...brand, assets };
}

export async function persistRunAssets(run: RunRecord): Promise<RunRecord> {
  if (!isR2Enabled() || !run.output) return run;

  const next: RunRecord = {
    ...run,
    output: {
      ...run.output
    },
    events: [...run.events]
  };

  try {
    if (next.output?.images?.length) {
      next.output.images = await Promise.all(next.output.images.map((image, index) => persistGeneratedImage(next.id, image, index)));
    }
    if (next.output?.mockup?.assets?.length) {
      next.output.mockup = {
        ...next.output.mockup,
        assets: await Promise.all(next.output.mockup.assets.map((asset, index) => persistExtractedAsset(next.id, asset, index)))
      };
    }
    if (next.output?.brand) {
      next.output.brand = await persistBrandAssets(next.id, next.output.brand);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    next.events.push({
      at: new Date().toISOString(),
      message: `Durable asset copy failed: ${message}`
    });
  }

  return next;
}

export async function getStoredAsset(key: string): Promise<StoredAssetBody | null> {
  const result = await getR2Client().send(
    new GetObjectCommand({
      Bucket: config.r2.bucket,
      Key: key
    })
  );
  if (!result.Body) return null;
  return {
    body: result.Body as Readable,
    contentType: result.ContentType,
    contentLength: result.ContentLength
  };
}
