import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT_DIR = process.cwd();
const SRC_DIR = join(ROOT_DIR, "src");
const EXTENSIONS = new Set([".tsx", ".jsx"]);
const INTERACTIVE_TAGS = new Set(["button", "a", "link"]);

type Violation = {
  file: string;
  line: number;
  outerTag: string;
  innerTag: string;
};

async function collectFiles(dirPath: string, output: string[]) {
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

function countLine(source: string, index: number) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (source.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

function normalizeTagName(raw: string) {
  const lower = raw.toLowerCase();
  if (lower === "link") {
    return "link";
  }
  if (lower === "a") {
    return "a";
  }
  return "button";
}

function lintInteractiveNesting(source: string, file: string): Violation[] {
  const violations: Violation[] = [];
  const stack: Array<{ tag: string; index: number }> = [];
  const tagPattern = /<\/?\s*([A-Za-z][\w:-]*)\b[^>]*?>/g;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(source)) !== null) {
    const rawTag = match[0];
    const tagNameRaw = match[1];
    const tagName = normalizeTagName(tagNameRaw);
    if (!INTERACTIVE_TAGS.has(tagName)) {
      continue;
    }

    const isClosing = /^<\s*\//.test(rawTag);
    const isSelfClosing = /\/\s*>$/.test(rawTag);
    const index = match.index;

    if (isClosing) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].tag === tagName) {
          stack.splice(i, 1);
          break;
        }
      }
      continue;
    }

    if (stack.length > 0) {
      const outer = stack[stack.length - 1];
      violations.push({
        file,
        line: countLine(source, index),
        outerTag: outer.tag,
        innerTag: tagName,
      });
    }

    if (!isSelfClosing) {
      stack.push({ tag: tagName, index });
    }
  }

  return violations;
}

async function main() {
  const fileInfo = await stat(SRC_DIR).catch(() => null);
  if (!fileInfo || !fileInfo.isDirectory()) {
    console.error("verify-ui-structure: src 目录不存在。");
    process.exit(1);
  }

  const files: string[] = [];
  await collectFiles(SRC_DIR, files);

  const allViolations: Violation[] = [];
  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    const relativePath = relative(ROOT_DIR, filePath).replaceAll("\\", "/");
    const violations = lintInteractiveNesting(source, relativePath);
    allViolations.push(...violations);
  }

  if (allViolations.length === 0) {
    console.log("verify-ui-structure: PASS (未发现 button/link 嵌套交互)");
    process.exit(0);
  }

  console.error("verify-ui-structure: FAIL");
  for (const violation of allViolations) {
    console.error(
      `- ${violation.file}:${violation.line} 嵌套交互：<${violation.outerTag}> 内包含 <${violation.innerTag}>`,
    );
  }
  process.exit(1);
}

void main();
