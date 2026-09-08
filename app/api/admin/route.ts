import { adminSummary, adminUserDetail, replyToSupportIssue, setAccountStatus, setAdminRole, setMonthlyAllowance, setSupportIssueStatus } from "../../../db/appliflow-store";
import { rejectCrossSiteMutation } from "../../api-security";
import { authenticationRequired, requestUser } from "../../request-user";

export async function GET(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  try {
    const searchParams = new URL(request.url).searchParams;
    const userId = searchParams.get("userId");
    return Response.json(userId ? await adminUserDetail(identity, userId) : await adminSummary(identity, searchParams.get("q") ?? ""));
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Administrator access is required." }, { status: 403 }); }
}

export async function POST(request: Request) {
  const untrusted = rejectCrossSiteMutation(request);
  if (untrusted) return untrusted;
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  try {
    const payload = await request.json() as { action?: "allowance" | "status" | "role" | "issue-status" | "issue-reply"; userId?: string; issueId?: string; reply?: string; monthlyAllowance?: number; status?: string; isAdmin?: boolean; query?: string };
    if (payload.action === "issue-reply") {
      if (!payload.issueId) return Response.json({ error: "Choose an issue report." }, { status: 400 });
      await replyToSupportIssue(identity, payload.issueId, payload.reply ?? "");
    } else if (payload.action === "issue-status") {
      if (!payload.issueId) return Response.json({ error: "Choose an issue report." }, { status: 400 });
      await setSupportIssueStatus(identity, payload.issueId, payload.status ?? "");
    } else if (!payload.userId) {
      return Response.json({ error: "Choose a user." }, { status: 400 });
    } else if (payload.action === "status") {
      if (payload.status !== "active" && payload.status !== "suspended") return Response.json({ error: "Choose a valid account status." }, { status: 400 });
      await setAccountStatus(identity, payload.userId, payload.status);
    } else if (payload.action === "allowance") {
      await setMonthlyAllowance(identity, payload.userId, Number(payload.monthlyAllowance) || 0);
    } else if (payload.action === "role") {
      if (typeof payload.isAdmin !== "boolean") return Response.json({ error: "Choose a valid administrator role." }, { status: 400 });
      await setAdminRole(identity, payload.userId, payload.isAdmin);
    } else {
      return Response.json({ error: "Choose a valid administrator action." }, { status: 400 });
    }
    return Response.json(await adminSummary(identity, payload.query ?? ""));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Administrator access is required." }, { status: 403 });
  }
}
