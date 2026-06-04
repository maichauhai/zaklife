const fs = require("fs");
const path = require("path");

const root = process.cwd();
const contract = JSON.parse(fs.readFileSync(path.join(root, "docs/schema/zaklife-contract.json"), "utf8"));

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exitCode = 1;
  }
}

for (const file of contract.requiredStaticFiles) {
  assert(fs.existsSync(path.join(root, file)), `Missing required static file: ${file}`);
}

const firebaseInit = read("js/firebase-init.js");
const contentJs = read("js/content.js");
const dashboardJs = read("js/dashboard.js");
const worker = read("ops/monstea-facebook/scripts/post_due_facebook.py");
const allRuntime = `${firebaseInit}\n${contentJs}\n${dashboardJs}\n${worker}`;

for (const firebasePath of contract.firebasePaths) {
  assert(allRuntime.includes(firebasePath), `Firebase path not referenced by runtime: ${firebasePath}`);
}

for (const field of contract.contentPostRequiredFields) {
  assert(contentJs.includes(field) || firebaseInit.includes(field), `Content post field not preserved: ${field}`);
}

for (const status of contract.contentPostStatuses) {
  assert(allRuntime.includes(status), `Content status not referenced by runtime: ${status}`);
}

for (const field of contract.automationHeartbeatFields) {
  assert(allRuntime.includes(field), `Automation heartbeat field not referenced by runtime: ${field}`);
}

if (process.exitCode) process.exit(1);
console.log("Schema contract check passed.");
