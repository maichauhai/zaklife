const fs = require("fs");
const path = require("path");

const root = process.cwd();
const ignoredDirs = new Set([
  ".git",
  "node_modules",
  "assets",
  "media",
  "logs",
  "backups",
  "__pycache__",
]);
const ignoredFiles = new Set(["tools/ci/check-secrets.js"]);
const ignoredExt = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".pyc", ".sqlite"]);

const patterns = [
  { name: "GitHub token", re: /\b(?:github_pat_|gh[oprsu]_[A-Za-z0-9_]{20,})/ },
  { name: "OpenAI key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{20,}/ },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Private key", re: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { name: "Facebook long token", re: /\bEA[A-Za-z0-9]{80,}\b/ },
  {
    name: "Hardcoded secret assignment",
    re: /\b(?:secret|secret_key|api_secret|page_access_token|bot_token|private_key)\b\s*[:=]\s*["'][^"']{12,}["']/i,
  },
];

function isIgnored(file) {
  const normalized = file.replace(/\\/g, "/");
  if (ignoredFiles.has(normalized)) return true;
  const parts = file.split(path.sep);
  if (parts.some((part) => ignoredDirs.has(part))) return true;
  return ignoredExt.has(path.extname(file).toLowerCase());
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (isIgnored(rel)) continue;
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function scanFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const hits = [];
  for (const pattern of patterns) {
    const match = text.match(pattern.re);
    if (match) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      hits.push({ file: path.relative(root, file), line, name: pattern.name });
    }
  }
  return hits;
}

const hits = [];
for (const file of walk(root)) {
  try {
    hits.push(...scanFile(file));
  } catch {
    // Binary or unreadable files are ignored by extension above; keep this scanner non-blocking for odd files.
  }
}

if (hits.length) {
  console.error("Potential secrets found:");
  for (const hit of hits) console.error(`- ${hit.file}:${hit.line} ${hit.name}`);
  process.exit(1);
}

console.log("Secret scan passed.");
