import assert from "node:assert/strict";

const baseUrl = (process.argv[2] || process.env.APPLITRAIL_HEALTH_URL || "https://applitrail.com").replace(/\/$/, "");

assert.match(baseUrl, /^https:\/\//, "Hosted health checks require an HTTPS URL");

async function readJson(pathname) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const body = await response.json();
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

const health = await readJson("/api/health");
assert.equal(health.response.status, 200, "Health endpoint must return HTTP 200");
assert.equal(health.body.status, "ok");
assert.equal(health.body.service, "applitrail");

const readiness = await readJson("/api/ready");
assert.equal(readiness.response.status, 200, "Readiness endpoint must return HTTP 200");
assert.equal(readiness.body.status, "ready");
assert.equal(readiness.body.service, "applitrail");

console.log(`AppliTrail is healthy and ready at ${baseUrl}`);
