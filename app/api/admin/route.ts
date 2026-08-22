import { adminSummary, setAccountStatus, setMonthlyAllowance } from "../../../db/appliflow-store";
import { authenticationRequired, requestUser } from "../../request-user";

export async function GET(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  try { return Response.json(await adminSummary(identity)); }
  catch { return Response.json({ error: "Administrator access is required." }, { status: 403 }); }
}

export async function POST(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  try {
    const payload = await request.json() as { action?: "allowance" | "status"; userId?: string; monthlyAllowance?: number; status?: "active" | "suspended" };
    if (!payload.userId) return Response.json({ error: "Choose a user." }, { status: 400 });
    if (payload.action === "status") {
      if (payload.status !== "active" && payload.status !== "suspended") return Response.json({ error: "Choose a valid account status." }, { status: 400 });
      await setAccountStatus(identity, payload.userId, payload.status);
    } else if (payload.action === "allowance") {
      await setMonthlyAllowance(identity, payload.userId, Number(payload.monthlyAllowance) || 0);
    } else {
      return Response.json({ error: "Choose a valid administrator action." }, { status: 400 });
    }
    return Response.json(await adminSummary(identity));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Administrator access is required." }, { status: 403 });
  }
}
