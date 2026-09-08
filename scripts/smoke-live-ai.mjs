import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

assert.ok(process.env.OPENAI_API_KEY, "OPENAI_API_KEY is required for the live AI smoke test");

const identityHeaders = {
  "content-type": "application/json",
  "oai-authenticated-user-id": "live-ai-smoke-user",
  "oai-authenticated-user-email": "live-ai-smoke@applitrail.test",
  "oai-authenticated-user-full-name": "Live AI Smoke",
};

const application = {
  company: "Northstar Technology",
  role: "IT Support Analyst",
  sector: "Technology",
  location: "Toronto, ON",
  description: "Provide empathetic end-user support for Windows devices, Microsoft 365, account access, hardware incidents, ticket documentation, and cross-team troubleshooting in a fast-paced environment.",
  applicationDate: "2026-09-08",
  phoneDate: "2026-09-10",
  phoneTime: "10:00",
  phoneTimeZone: "America/Toronto",
  interviewDate: "2026-09-12",
  interviewTime: "14:00",
  interviewTimeZone: "America/Toronto",
};

const masterCv = {
  label: "IT Support Test CV",
  profile: {
    name: "Live AI Smoke",
    headline: "IT Support Professional",
    phone: "+1 555 010 1000",
    email: "live-ai-smoke@applitrail.test",
    address: "Toronto, ON",
    linkedin: "",
    summary: "IT support professional experienced in customer-focused troubleshooting and technical documentation.",
    skills: "Windows support, Microsoft 365, account access, ticket triage, hardware troubleshooting, documentation",
    experience: "IT Support Specialist, Example Services. Resolved end-user incidents involving Windows devices, Microsoft 365, user access and desktop hardware. Documented resolutions and collaborated with infrastructure teams on escalations.",
    education: "College diploma in Information Technology",
    certifications: [],
    projects: "",
    tools: "Windows, Microsoft 365, ticketing systems",
    customSections: [],
  },
  resume: null,
};

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForReady(origin, child) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Standalone server exited with code ${child.exitCode}`);
    try {
      if ((await fetch(`${origin}/api/ready`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Standalone server did not become ready");
}

async function json(response) {
  const body = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, JSON.stringify({ status: response.status, error: body.error }));
  return body;
}

async function post(origin, path, body) {
  return json(await fetch(`${origin}${path}`, {
    method: "POST",
    headers: identityHeaders,
    body: JSON.stringify(body),
  }));
}

const dataDirectory = await mkdtemp(join(tmpdir(), "applitrail-live-ai-"));
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [join(process.cwd(), "dist", "standalone", "server.js")], {
  cwd: join(process.cwd(), "dist", "standalone"),
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: String(port),
    APPLITRAIL_DATA_DIR: dataDirectory,
    APPLIFLOW_ADMIN_EMAIL: identityHeaders["oai-authenticated-user-email"],
    APPLIFLOW_PAYMENT_MODE: "demo",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let diagnostics = "";
child.stdout.on("data", (chunk) => { diagnostics += String(chunk); });
child.stderr.on("data", (chunk) => { diagnostics += String(chunk); });

try {
  await waitForReady(origin, child);
  await post(origin, "/api/account", { action: "accept-policies" });
  await post(origin, "/api/billing", {
    action: "checkout",
    productId: "basic_monthly",
    quantity: 1,
    requestId: `live-ai-${Date.now()}`,
  });

  const cv = await post(origin, "/api/tailor-cv", { application, masterCv });
  assert.equal(cv.model, "gpt-5.6-sol");
  assert.ok(cv.document?.length > 300);
  assert.ok(Number.isInteger(cv.score));
  console.log("✓ Tailored CV generation");

  for (const kind of ["cover", "phone", "interview"]) {
    const result = await post(origin, "/api/generate-application-material", { kind, application, masterCv });
    assert.equal(result.model, kind === "cover" ? "gpt-5.6-sol" : "gpt-5.6-luna");
    assert.ok(result.document?.length > 200);
    assert.ok(Array.isArray(result.review_questions));
    console.log(`✓ ${kind} generation`);
  }

  const state = await json(await fetch(`${origin}/api/state`, { headers: identityHeaders }));
  assert.equal(state.creditAudit.length, 4);
  assert.equal(state.usage.used, 4);
  assert.equal(state.usage.remaining, 6);
  assert.deepEqual(new Set(state.creditAudit.map((entry) => entry.kind)), new Set(["cv", "cover", "phone", "interview"]));
  console.log("✓ Four successful credit-audit records; six Basic credits remain");
} catch (error) {
  if (diagnostics) console.error(diagnostics.slice(-4_000));
  throw error;
} finally {
  if (child.exitCode === null) child.kill("SIGTERM");
  await rm(dataDirectory, { recursive: true, force: true });
}
