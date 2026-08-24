import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const identityHeaders = {
  "oai-authenticated-user-id": "runtime-smoke-user",
  "oai-authenticated-user-email": "runtime-smoke@example.test",
};

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForReady(origin, child) {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Standalone server exited with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(`${origin}/api/ready`);
      if (response.ok) return;
      lastError = new Error(`Readiness returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError ?? new Error("Standalone server did not become ready.");
}

async function startServer(dataDirectory, bundleDirectory) {
  const port = await availablePort();
  const child = spawn(process.execPath, [join(bundleDirectory, "server.js")], {
    cwd: bundleDirectory,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(port),
      APPLITRAIL_DATA_DIR: dataDirectory,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostics = "";
  child.stdout.on("data", (chunk) => { diagnostics += String(chunk); });
  child.stderr.on("data", (chunk) => { diagnostics += String(chunk); });
  const origin = `http://127.0.0.1:${port}`;
  try {
    await waitForReady(origin, child);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`${error instanceof Error ? error.message : error}\n${diagnostics}`);
  }
  return { child, origin };
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function json(response) {
  const payload = await response.json();
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload;
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "applitrail-runtime-"));
const dataDirectory = join(temporaryRoot, "data");
const bundleDirectory = join(temporaryRoot, "bundle");
await cp(join(process.cwd(), "dist", "standalone"), bundleDirectory, {
  recursive: true,
});
let server;
try {
  server = await startServer(dataDirectory, bundleDirectory);
  const health = await json(await fetch(`${server.origin}/api/health`));
  assert.equal(health.status, "ok");

  const initial = await json(await fetch(`${server.origin}/api/state`, {
    headers: identityHeaders,
  }));
  assert.equal(initial.hasState, false);

  const state = {
    apps: [{
      id: 1,
      company: "Persistence Test",
      role: "Cloud Portability",
      stage: "Saved",
      date: "2026-08-24",
    }],
    masterCvs: [{
      id: "master-portable",
      label: "Portable Master CV",
      profile: { name: "Runtime Smoke User" },
      resume: null,
      createdAt: "2026-08-24T00:00:00.000Z",
    }],
    activeMasterCvId: "master-portable",
    preferences: { reminderDaysBefore: 3, followUpDays: 7 },
  };
  await json(await fetch(`${server.origin}/api/state`, {
    method: "PUT",
    headers: { ...identityHeaders, "content-type": "application/json" },
    body: JSON.stringify({ state }),
  }));

  const form = new FormData();
  form.set("file", new File(["%PDF-1.4\n%AppliTrail smoke test"], "smoke.pdf", {
    type: "application/pdf",
  }));
  const uploaded = await json(await fetch(`${server.origin}/api/resumes`, {
    method: "POST",
    headers: identityHeaders,
    body: form,
  }));
  assert.match(uploaded.resume.id, /^[a-f0-9-]{20,60}$/i);
  const resumeId = uploaded.resume.id;

  await stopServer(server.child);
  server = await startServer(dataDirectory, bundleDirectory);

  const persisted = await json(await fetch(`${server.origin}/api/state`, {
    headers: identityHeaders,
  }));
  assert.equal(persisted.hasState, true);
  assert.equal(persisted.state.apps[0].company, "Persistence Test");
  assert.equal(persisted.state.masterCvs[0].label, "Portable Master CV");

  const resumedFile = await fetch(`${server.origin}/api/resumes?id=${encodeURIComponent(resumeId)}`, {
    headers: identityHeaders,
  });
  assert.equal(resumedFile.ok, true);
  assert.equal(await resumedFile.text(), "%PDF-1.4\n%AppliTrail smoke test");

  console.log("Standalone runtime, database, and resume persistence checks passed.");
} finally {
  if (server) await stopServer(server.child);
  await rm(temporaryRoot, { recursive: true, force: true });
}
