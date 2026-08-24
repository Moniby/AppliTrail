import { runtimeReadiness } from "../../../platform/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runtime = await runtimeReadiness();
    return Response.json(
      {
        status: "ready",
        service: "applitrail",
        provider: runtime.provider,
        database: runtime.databaseDialect,
        storage: runtime.storageProvider,
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        status: "not_ready",
        service: "applitrail",
        checkedAt: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
