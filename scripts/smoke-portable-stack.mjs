import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origin = process.env.APPLITRAIL_TEST_ORIGIN || "http://127.0.0.1:3000";
const identity = `portable-${Date.now()}-${crypto.randomUUID()}`;
const identityHeaders = {
  "oai-authenticated-user-id": identity,
  "oai-authenticated-user-email": `${identity}@example.test`,
};
const administratorHeaders = {
  "oai-authenticated-user-id": "portable-bootstrap-administrator",
  "oai-authenticated-user-email": "portable-admin@example.test",
};
const portableEnvironment = {
  DATABASE_URL: "postgresql://applitrail:applitrail-local-not-for-production@127.0.0.1:54329/applitrail",
  AZURE_STORAGE_CONNECTION_STRING: "DefaultEndpointsProtocol=http;AccountName=applitrail;AccountKey=YXBwbGl0cmFpbC1sb2NhbC1zdG9yYWdlLWtleS1ub3QtZm9yLXByb2R1Y3Rpb24=;BlobEndpoint=http://127.0.0.1:10000/applitrail;",
  AZURE_STORAGE_CONTAINER: "resumes",
};

async function json(response) {
  const payload = await response.json();
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload;
}

async function waitForReady() {
  let lastError;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/ready`);
      if (response.ok) return json(response);
      lastError = new Error(`Readiness returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error("The portable stack did not become ready.");
}

async function compose(...arguments_) {
  await new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", ...arguments_], {
      cwd: process.cwd(),
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(`docker compose ${arguments_.join(" ")} exited with ${code}.`)));
  });
}

async function runNode(arguments_, environment = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, arguments_, {
      cwd: process.cwd(),
      env: { ...process.env, ...environment },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(`node ${arguments_.join(" ")} exited with ${code}.`)));
  });
}

const ready = await waitForReady();
assert.equal(ready.database, "postgres");
assert.equal(ready.storage, "azure-blob");

const temporaryBackup = await mkdtemp(join(tmpdir(), "applitrail-portable-backup-"));
try {
const administrator = await json(await fetch(`${origin}/api/admin`, {
  headers: administratorHeaders,
}));
assert.ok(administrator.totals);

const state = {
  apps: [{
    id: 1,
    company: "Portable Stack Test",
    role: "Cloud Portability",
    stage: "Saved",
    date: "2026-08-24",
  }],
  masterCvs: [{
    id: "portable-master",
    label: "Portable Master CV",
    profile: { name: "Portable Test User" },
    resume: null,
    createdAt: "2026-08-24T00:00:00.000Z",
  }],
  activeMasterCvId: "portable-master",
  preferences: { reminderDaysBefore: 3, followUpDays: 7 },
};

await json(await fetch(`${origin}/api/state`, {
  method: "PUT",
  headers: { ...identityHeaders, "content-type": "application/json" },
  body: JSON.stringify({ state }),
}));
await json(await fetch(`${origin}/api/account`, {
  method: "POST",
  headers: { ...identityHeaders, "content-type": "application/json", "user-agent": "AppliTrail portable smoke" },
  body: JSON.stringify({ action: "record-login" }),
}));

const form = new FormData();
form.set("file", new File(["%PDF-1.4\n%AppliTrail portable stack"], "portable.pdf", {
  type: "application/pdf",
}));
const uploaded = await json(await fetch(`${origin}/api/resumes`, {
  method: "POST",
  headers: identityHeaders,
  body: form,
}));
const resumeId = uploaded.resume.id;
assert.match(resumeId, /^[a-f0-9-]{20,60}$/i);

await compose("restart", "applitrail");
await waitForReady();

const persisted = await json(await fetch(`${origin}/api/state`, { headers: identityHeaders }));
assert.equal(persisted.state.apps[0].company, "Portable Stack Test");
assert.equal(persisted.state.masterCvs[0].label, "Portable Master CV");

const resume = await fetch(`${origin}/api/resumes?id=${encodeURIComponent(resumeId)}`, {
  headers: identityHeaders,
});
assert.equal(resume.ok, true);
assert.equal(await resume.text(), "%PDF-1.4\n%AppliTrail portable stack");

  await runNode(["scripts/portable-backup.mjs", "backup", temporaryBackup], portableEnvironment);

  await json(await fetch(`${origin}/api/account`, {
    method: "DELETE",
    headers: identityHeaders,
  }));
  await json(await fetch(`${origin}/api/account`, {
    method: "DELETE",
    headers: administratorHeaders,
  }));

  await runNode(["scripts/portable-backup.mjs", "restore", temporaryBackup], {
    ...portableEnvironment,
    APPLITRAIL_RESTORE_CONFIRM: "empty-target",
  });
  const restored = await json(await fetch(`${origin}/api/state`, { headers: identityHeaders }));
  assert.equal(restored.state.apps[0].company, "Portable Stack Test");
  const restoredResume = await fetch(`${origin}/api/resumes?id=${encodeURIComponent(resumeId)}`, {
    headers: identityHeaders,
  });
  assert.equal(restoredResume.ok, true);
  assert.equal(await restoredResume.text(), "%PDF-1.4\n%AppliTrail portable stack");
} finally {
  await fetch(`${origin}/api/account`, {
    method: "DELETE",
    headers: identityHeaders,
  }).catch(() => undefined);
  await fetch(`${origin}/api/account`, {
    method: "DELETE",
    headers: administratorHeaders,
  }).catch(() => undefined);
  await rm(temporaryBackup, { recursive: true, force: true });
}

console.log("PostgreSQL, Azure Blob, restart persistence, backup, and restore checks passed.");
