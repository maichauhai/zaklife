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

const activeFirebasePaths = contract.activeFirebasePaths || contract.firebasePaths || [];
const backupPaths = contract.backupPaths || activeFirebasePaths;
const moduleFirebasePaths = contract.moduleFirebasePaths || {};
const writeRules = contract.writeRules || {};

for (const firebasePath of activeFirebasePaths) {
  assert(allRuntime.includes(firebasePath), `Firebase path not referenced by runtime: ${firebasePath}`);
}

const backupScript = read("ops/zaklife-maintenance/scripts/backup_firebase.py");
for (const firebasePath of backupPaths) {
  assert(backupScript.includes(firebasePath), `Firebase path not covered by backup script: ${firebasePath}`);
}

const migrationScriptPath = "ops/zaklife-maintenance/scripts/migrate_zaklife_data_v2.py";
if (fs.existsSync(path.join(root, migrationScriptPath))) {
  const migrationScript = read(migrationScriptPath);
  for (const firebasePath of Object.values(moduleFirebasePaths)) {
    assert(migrationScript.includes(firebasePath) || backupScript.includes(firebasePath), `Module path not covered by migration/backup tooling: ${firebasePath}`);
  }
}

for (const firebasePath of writeRules.forbidSetOnPaths || []) {
  const escapedPath = firebasePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const broadSetPattern = new RegExp(`ref\\(["'\`]${escapedPath}["'\`]\\)\\.set\\(`);
  assert(!broadSetPattern.test(allRuntime), `Broad Firebase set() is forbidden on ${firebasePath}`);
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
