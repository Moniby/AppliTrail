import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("application documents are private snapshots and do not consume AI credits", async () => {
  const [dashboard, route, state, privacy, generation, storage] = await Promise.all([
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/application-documents/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/generate-application-material/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/application-document-storage.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /Keep the exact application documents/);
  assert.match(dashboard, /Use tailored CV/);
  assert.match(dashboard, /Mark submitted/);
  assert.match(dashboard, /No AI credit used/);
  assert.match(route, /applicationDocumentKey\(identity\.userId/);
  assert.match(route, /copiedFrom/);
  assert.match(state, /cleanApplicationDocument/);
  assert.match(state, /schemaVersion: 11/);
  assert.match(privacy, /application-specific document copies/);
  assert.match(generation, /loadApplicationDocumentForUser/);
  assert.match(generation, /prioritize the application CV as the applicant-facing version/);
  assert.match(storage, /application-documents/);
});
