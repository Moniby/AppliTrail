import type { Identity } from "../db/appliflow-store";

const FULL_NAME = "oai-authenticated-user-full-name";
const FULL_NAME_ENCODING = "oai-authenticated-user-full-name-encoding";

export function requestUser(request: Request): Identity | null {
  const userId = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  if (!userId || !email) {
    if (process.env.NODE_ENV !== "production") {
      return { userId: "appliflow-local-user", email: "local@appliflow.test", displayName: "Local User" };
    }
    return null;
  }
  const encoded = request.headers.get(FULL_NAME);
  let fullName: string | null = null;
  if (encoded && request.headers.get(FULL_NAME_ENCODING) === "percent-encoded-utf-8") {
    try { fullName = decodeURIComponent(encoded); } catch { fullName = null; }
  }
  return { userId, email, displayName: fullName || email };
}

export function authenticationRequired() {
  return Response.json(
    { error: "Sign in with ChatGPT to continue.", signInUrl: "/signin-with-chatgpt?return_to=%2Fapp" },
    { status: 401 },
  );
}
