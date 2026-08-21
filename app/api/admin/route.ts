import { adminSummary, grantBonusCredits } from "../../../db/appliflow-store";
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
    const payload = await request.json() as { userId?: string; bonusCredits?: number };
    if (!payload.userId) return Response.json({ error: "Choose a user." }, { status: 400 });
    await grantBonusCredits(identity, payload.userId, Number(payload.bonusCredits) || 0);
    return Response.json(await adminSummary(identity));
  } catch { return Response.json({ error: "Administrator access is required." }, { status: 403 }); }
}
