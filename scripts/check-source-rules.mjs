import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const sourceDirs = ["apps/api/src", "apps/web/src", "packages/core/src"];
const forbidden = [
  {
    pattern: /\bmax_tokens\b|\bmax_completion_tokens\b/,
    message: "Do not set OpenRouter token caps. Omit token-limit fields so JSON/HTML/CSS responses are not truncated."
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
    for (const rule of forbidden) {
      if (rule.pattern.test(text)) {
        violations.push(`${file.replace(root, "")}: ${rule.message}`);
      }
    }
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("Source rules passed");
