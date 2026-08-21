import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type AppliFlowBindings = {
  DB: D1Database;
  RESUMES: R2Bucket;
};

function bindings() {
  return env as unknown as AppliFlowBindings;
}

export function getDb() {
  if (!bindings().DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(bindings().DB, { schema });
}

export function getD1() {
  if (!bindings().DB) throw new Error("AppliFlow's database is unavailable.");
  return bindings().DB;
}

export function getResumeBucket() {
  if (!bindings().RESUMES) throw new Error("AppliFlow's resume storage is unavailable.");
  return bindings().RESUMES;
}
