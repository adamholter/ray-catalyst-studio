import { readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const sourceDirs = ["apps/api/src", "apps/web/src", "packages/core/src"];
const sourceRules = [
  {
    pattern: /\bmax_tokens\b|\bmax_completion_tokens\b/,
    message: "Do not set OpenRouter token caps. Omit token-limit fields so JSON/HTML/CSS responses are not truncated."
  }
];
const secretRules = [
  {
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{32}\b/i,
    message: "Possible fal.ai API key found in tracked source. Use a server-side environment variable instead."
  },
  {
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
    message: "Possible provider API key found in tracked source. Use a server-side environment variable instead."
  }
];

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* files(path);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      yield path;
    }
  }
}

const violations = [];

for (const sourceDir of sourceDirs) {
  for await (const file of files(join(root, sourceDir))) {
    const text = await readFile(file, "utf8");
    for (const rule of sourceRules) {
      if (rule.pattern.test(text)) {
        violations.push(`${file.replace(root, "")}: ${rule.message}`);
      }
    }
  }
}

const publicFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  cwd: root,
  encoding: "utf8"
}).trim().split("\n").filter(Boolean);

for (const relativeFile of publicFiles) {
  let text;
  try {
    text = await readFile(join(root, relativeFile), "utf8");
  } catch {
    continue;
  }
  for (const rule of secretRules) {
    if (rule.pattern.test(text)) {
      violations.push(`${relativeFile}: ${rule.message}`);
    }
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("Source rules passed");
