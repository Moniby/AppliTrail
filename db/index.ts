import { drizzle } from "drizzle-orm/d1";
import { requireRuntime } from "../platform/runtime";
import type { SqlDatabase } from "../platform/contracts";
import * as schema from "./schema";

export function getDb() {
  return drizzle(getSqlDatabase() as D1Database, { schema });
}

export function getSqlDatabase(): SqlDatabase {
  return requireRuntime().database;
}

export function getDatabaseDialect() {
  return requireRuntime().databaseDialect;
}

export function getResumeStorage() {
  return requireRuntime().resumeStorage;
}
