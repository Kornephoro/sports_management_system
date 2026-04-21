import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT_DIR = process.cwd();
const SRC_DIR = join(ROOT_DIR, "src");
const EXTENSIONS = new Set([".tsx", ".jsx"]);

const PATTERNS = [
  {
    name: "button-wrap-button",
    regex: /<button\b(?![^>]*\/\s*>)[^>]*>(?:(?!<\/button>).)*<button\b/gs,
  },
  {
    name: "button-wrap-link",
    regex: /<button\b(?![^>]*\/\s*>)[^>]*>(?:(?!<\/button>).)*(<a\b|<Link\b)/gs,
  },
  {
    name: "link-wrap-button",
    regex: /(<a\b(?![^>]*\/\s*>)[^>]*>|<Link\b(?![^>]*\/\s*>)[^>]*>)(?:(?!<\/a>|<\/Link>).)*<button\b/gs,
  },
];

async function collectFiles(dirPath, output) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(fullPath, output);
      continue;
    }
    const dotIndex = entry.name.lastIndexOf(".");
    const extension = dotIndex >= 0 ? entry.name.slice(dotIndex) : "";
    if (EXTENSIONS.has(extension)) {
      output.push(fullPath);
    }
  }
}

function toLine(source, index) {
  return source.slice(0, index).split("\n").length;
}

async function main() {
  const fileInfo = await stat(SRC_DIR).catch(() => null);
  if (!fileInfo || !fileInfo.isDirectory()) {
    console.error("verify-ui-structure: src 目录不存在。");
    process.exit(1);
  }

  const files = [];
  await collectFiles(SRC_DIR, files);

  const violations = [];

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    const relativePath = relative(ROOT_DIR, filePath).replaceAll("\\", "/");

    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(source)) !== null) {
        violations.push({
          file: relativePath,
          line: toLine(source, match.index),
          type: pattern.name,
        });
      }
    }
  }

  if (violations.length === 0) {
    console.log("verify-ui-structure: PASS (未发现 button/link 嵌套交互)");
    return;
  }

  console.error("verify-ui-structure: FAIL");
  for (const item of violations) {
    console.error(`- ${item.file}:${item.line} 命中 ${item.type}`);
  }
  process.exit(1);
}

void main();
