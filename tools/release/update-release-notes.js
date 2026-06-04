const fs = require("fs");
const path = require("path");

const root = process.cwd();
const eventPath = process.env.GITHUB_EVENT_PATH;
const sha = process.env.GITHUB_SHA || "";
const repo = process.env.GITHUB_REPOSITORY || "maichauhai/zaklife";
const releasesPath = path.join(root, "docs/RELEASES.md");

if (!eventPath || !fs.existsSync(eventPath)) {
  console.log("No GitHub event payload found. Skipping release notes.");
  process.exit(0);
}

const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
const headMessage = event.head_commit?.message || "";
if (/docs:\s*update release notes/i.test(headMessage)) {
  console.log("Release-note maintenance commit. Skipping.");
  process.exit(0);
}

const shortSha = sha.slice(0, 7);
const marker = `<!-- release:${shortSha} -->`;
let current = fs.existsSync(releasesPath) ? fs.readFileSync(releasesPath, "utf8") : "# ZakLife Releases\n\n";
if (current.includes(marker)) {
  console.log(`Release ${shortSha} already documented.`);
  process.exit(0);
}

const commits = Array.isArray(event.commits) && event.commits.length
  ? event.commits
  : event.head_commit
    ? [event.head_commit]
    : [];

const date = new Date().toLocaleDateString("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const lines = [];
lines.push(`## ${date} - ${shortSha}`);
lines.push(marker);
lines.push("");
for (const commit of commits) {
  const message = String(commit.message || "").split(/\r?\n/)[0].trim();
  if (!message) continue;
  const commitSha = String(commit.id || commit.sha || "").slice(0, 7);
  const url = commitSha ? `https://github.com/${repo}/commit/${commit.id || commit.sha}` : "";
  lines.push(`- ${message}${commitSha ? ` ([${commitSha}](${url}))` : ""}`);
}
if (lines.length === 3) lines.push("- Production update.");
lines.push("");

const header = "# ZakLife Releases\n\nRelease notes are updated automatically when `main` receives a new production push.\n\n";
const body = current.startsWith("# ZakLife Releases")
  ? current.replace(/^# ZakLife Releases\n\n(?:Release notes are updated automatically[^\n]*\n\n)?/, "")
  : current;
fs.writeFileSync(releasesPath, header + lines.join("\n") + "\n" + body, "utf8");
console.log(`Release notes updated for ${shortSha}.`);
