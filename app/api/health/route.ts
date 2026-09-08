export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      status: "ok",
      service: "applitrail",
      environment: process.env.APPLITRAIL_ENVIRONMENT || "production",
      release: process.env.APPLITRAIL_RELEASE || "development",
      checkedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
