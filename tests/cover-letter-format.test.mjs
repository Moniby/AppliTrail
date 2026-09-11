import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("generated cover letters are constrained to a concise one-page structure", async () => {
  const generationRoute = await readFile("app/api/generate-application-material/route.ts", "utf8");
  const wordDocument = await readFile("app/cover-letter-docx.ts", "utf8");

  assert.match(generationRoute, /exactly four concise main paragraphs/i);
  assert.match(generationRoute, /one short concluding paragraph/i);
  assert.match(generationRoute, /never exceed 400 words/i);
  assert.match(generationRoute, /maxOutputTokens: 2_000/);
  assert.match(generationRoute, /wordCount\(result\.document\) > 400/);
  assert.match(wordDocument, /spacing: \{ after: 150, line: 280 \}/);
});
