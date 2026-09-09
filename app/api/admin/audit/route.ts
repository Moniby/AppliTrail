import { adminAudit, type AdminAuditKind } from "../../../../db/appliflow-store";
import { authenticationRequired, requestUser } from "../../../request-user";

export const dynamic = "force-dynamic";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  try {
    const params = new URL(request.url).searchParams;
    const kind: AdminAuditKind = params.get("kind") === "payment" ? "payment" : "credit";
    const format = params.get("format") === "csv" ? "csv" : "json";
    const result = await adminAudit(identity, kind, {
      query: params.get("q") ?? "",
      from: params.get("from") ?? "",
      to: params.get("to") ?? "",
      page: format === "csv" ? 1 : Number(params.get("page") || 1),
      pageSize: format === "csv" ? 5_000 : 50,
    });
    if (format === "json") return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    const rows = kind === "credit"
      ? [["Timestamp", "User", "Email", "Credit used for", "Credit source", "Model", "Input tokens", "Output tokens"],
          ...result.entries.map((entry) => { const item = entry as Record<string, unknown>; return [item.usedAt, item.displayName, item.email, item.kind, item.creditSource, item.model, item.inputTokens, item.outputTokens]; })]
      : [["Timestamp", "User", "Email", "Event", "Product", "Plan", "Credits", "Amount cents", "Currency", "Gateway", "Status"],
          ...result.entries.map((entry) => { const item = entry as Record<string, unknown>; return [item.createdAt, item.displayName, item.email, item.kind, item.productId, item.plan, item.credits, item.amountCents, item.currency, item.gateway, item.status]; })];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="applitrail-${kind}-audit.csv"`, "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Administrator audit unavailable." }, { status: 403 });
  }
}
