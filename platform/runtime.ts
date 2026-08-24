import type {
  ApplicationRuntime,
  ObjectStorage,
  SqlDatabase,
} from "./contracts";

let runtime: ApplicationRuntime | null = null;
let runtimePromise: Promise<ApplicationRuntime> | null = null;

function hasMethod(value: unknown, method: string) {
  return Boolean(
    value &&
      typeof value === "object" &&
      method in value &&
      typeof (value as Record<string, unknown>)[method] === "function",
  );
}

function cloudflareRuntime(
  environment: Record<string, unknown> | undefined,
): ApplicationRuntime | null {
  const database = environment?.DB;
  const resumeStorage = environment?.RESUMES;
  if (!hasMethod(database, "prepare") || !hasMethod(resumeStorage, "get")) {
    return null;
  }
  return {
    database: database as SqlDatabase,
    resumeStorage: resumeStorage as ObjectStorage,
    provider: "cloudflare",
    databaseDialect: "sqlite",
    storageProvider: "cloudflare-r2",
    dataLocation: "Cloudflare D1 and R2",
  };
}

export async function initializeRuntime(
  environment?: Record<string, unknown>,
): Promise<ApplicationRuntime> {
  if (runtime) return runtime;
  if (runtimePromise) return runtimePromise;

  runtimePromise = (async () => {
    const cloudflare = cloudflareRuntime(environment);
    if (cloudflare) return cloudflare;

    const { createNodeRuntime } = await import("./runtime-node");
    return createNodeRuntime();
  })();

  try {
    runtime = await runtimePromise;
    return runtime;
  } catch (error) {
    runtimePromise = null;
    throw error;
  }
}

export function requireRuntime(): ApplicationRuntime {
  if (!runtime) {
    throw new Error(
      "AppliTrail's runtime has not been initialized. Initialize it at the request boundary before using persistence.",
    );
  }
  return runtime;
}

export async function runtimeReadiness() {
  const activeRuntime = requireRuntime();
  const databaseResult = await activeRuntime.database
    .prepare("SELECT 1 AS ready")
    .first<{ ready: number }>();
  if (Number(databaseResult?.ready) !== 1) {
    throw new Error("The application database did not pass its readiness check.");
  }
  await activeRuntime.resumeStorage.list({ prefix: "__health__", limit: 1 });
  return {
    provider: activeRuntime.provider,
    databaseDialect: activeRuntime.databaseDialect,
    storageProvider: activeRuntime.storageProvider,
    dataLocation: activeRuntime.dataLocation,
  };
}
