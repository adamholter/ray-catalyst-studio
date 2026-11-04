import { execFile, spawn } from "node:child_process";
import { accessSync, constants, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { config } from "../config";

// Runs conversion prompts through the Claude Code login already on this computer.
// There is nothing to configure: "sonnet" is Claude Code's alias for the latest Sonnet.
const CLAUDE_MODEL = "sonnet";
const CLAUDE_EFFORT = "medium";
const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const MAX_IMAGE_EDGE = 1568;

// Removed so a stray key or proxy can never redirect or bill these calls: they use the subscription login.
const STRIPPED_ENV = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL", "ANTHROPIC_SMALL_FAST_MODEL", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"];

function isExecutable(file: string) {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function desktopAppBinaries(home: string) {
  const root = path.join(home, "Library", "Application Support", "Claude", "claude-code");
  try {
    return readdirSync(root)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .flatMap((version) => [path.join(root, version, "claude"), path.join(root, version, "claude.app", "Contents", "MacOS", "claude")]);
  } catch {
    return [];
  }
}

// A background server often has a minimal PATH, so the usual install locations are checked as well.
export function findClaudeBinary(env: NodeJS.ProcessEnv = process.env, home = homedir(), systemDirs = ["/opt/homebrew/bin", "/usr/local/bin"]) {
  if (env.CATALYST_CLAUDE_BIN) return isExecutable(env.CATALYST_CLAUDE_BIN) ? env.CATALYST_CLAUDE_BIN : null;
  const candidates = [
    ...(env.PATH || "").split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, "claude")),
    path.join(home, ".claude", "local", "claude"),
    path.join(home, ".local", "bin", "claude"),
    ...systemDirs.map((dir) => path.join(dir, "claude")),
    ...desktopAppBinaries(home)
  ];
  return candidates.find(isExecutable) ?? null;
}

export function claudeCodeEnabled() {
  return config.providerMode === "live" && Boolean(findClaudeBinary());
}

function childEnv() {
  const env = { ...process.env };
  for (const key of STRIPPED_ENV) delete env[key];
  return env;
}

export async function claudeCodeSignedIn(): Promise<boolean> {
  const binary = config.providerMode === "live" ? findClaudeBinary() : null;
  if (!binary) return false;
  return new Promise((resolve) => {
    execFile(binary, ["auth", "status", "--json"], { env: childEnv(), timeout: 10_000 }, (_error, stdout) => {
      try {
        resolve(JSON.parse(stdout).loggedIn === true);
      } catch {
        resolve(false);
      }
    });
  });
}

export const CLAUDE_NOT_INSTALLED = "Claude Code was not found on this computer. Install Claude Code and sign in, then try again.";

export function friendlyClaudeError(detail: string) {
  if (/not logged in|\/login|authenticat|unauthori[sz]ed|oauth/i.test(detail)) {
    return "Claude Code is not signed in on this computer. Open Claude Code, sign in, then try again.";
  }
  if (/(session|weekly|usage|opus|sonnet|spend) limit|rate.?limit|out of (usage|extra usage|credits)/i.test(detail)) {
    return `Claude usage limit reached, so nothing was converted. ${detail}`.trim();
  }
  if (/unknown option|error: option/i.test(detail)) {
    return "Claude Code needs an update to run this. Update Claude Code, then try again.";
  }
  return `Claude Code could not finish this step. ${detail}`.trim();
}

export async function prepareImageForClaude(image: Buffer) {
  const output = await sharp(image)
    .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 88 })
    .toBuffer();
  return output.toString("base64");
}

type ResultLine = {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  errors?: unknown[];
  structured_output?: unknown;
  total_cost_usd?: number;
  model?: string;
};

export function parseClaudeOutput(stdout: string) {
  let model = "";
  let result: ResultLine | undefined;
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as ResultLine;
      if (entry.type === "system" && entry.subtype === "init" && entry.model) model = entry.model;
      if (entry.type === "result") result = entry;
    } catch {
      // Claude Code may print non-JSON notices; only the JSON event lines matter.
    }
  }
  if (!result) return { ok: false as const, detail: "" };
  if (result.is_error || result.subtype !== "success" || result.structured_output === undefined) {
    const detail = [result.result, ...(result.errors || [])].filter(Boolean).join(" ") || result.subtype || "";
    return { ok: false as const, detail: String(detail) };
  }
  return { ok: true as const, data: result.structured_output, model, costUsd: result.total_cost_usd ?? 0 };
}

// Claude Code rejects the draft 2020-12 "$schema" marker that zod adds, so it is dropped.
export function schemaArgument(schema: object) {
  const { $schema: _dropped, ...rest } = schema as Record<string, unknown>;
  return JSON.stringify(rest);
}

export async function callClaudeCode(options: {
  system: string;
  text: string;
  schema: object;
  image?: Buffer;
  timeoutMs?: number;
}): Promise<{ data: unknown; model: string; costUsd: number }> {
  const binary = findClaudeBinary();
  if (!binary) throw new Error(CLAUDE_NOT_INSTALLED);

  const content: unknown[] = [{ type: "text", text: options.text }];
  if (options.image) {
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await prepareImageForClaude(options.image) } });
  }
  const args = [
    "-p",
    "--model", CLAUDE_MODEL,
    "--effort", CLAUDE_EFFORT,
    "--tools", "",
    "--setting-sources", "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose",
    "--json-schema", schemaArgument(options.schema),
    "--system-prompt", options.system
  ];
  if (config.claudeMaxBudgetUsd) args.push("--max-budget-usd", config.claudeMaxBudgetUsd);

  // An empty working directory keeps this repo's agent instructions out of the prompt.
  const cwd = await mkdtemp(path.join(tmpdir(), "catalyst-claude-"));
  try {
    const { stdout, stderr, code, timedOut } = await new Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean }>((resolve, reject) => {
      const child = spawn(binary, args, { cwd, env: childEnv(), stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      let timedOutFlag = false;
      const timer = setTimeout(() => {
        timedOutFlag = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      child.stdout.on("data", (chunk) => (out += chunk));
      child.stderr.on("data", (chunk) => (err += chunk));
      child.stdin.on("error", () => undefined);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        resolve({ stdout: out, stderr: err, code: exitCode, timedOut: timedOutFlag });
      });
      child.stdin.end(`${JSON.stringify({ type: "user", message: { role: "user", content } })}\n`);
    });

    if (timedOut) throw new Error("Claude Code took too long on this step, so it was stopped. Please try again.");
    const parsed = parseClaudeOutput(stdout);
    if (!parsed.ok) throw new Error(friendlyClaudeError(parsed.detail || stderr.trim().slice(0, 400) || `Exit code ${code}.`));
    console.log(`Claude Code ${parsed.model}: estimated $${parsed.costUsd.toFixed(4)} at list price (subscription login)`);
    return parsed;
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
