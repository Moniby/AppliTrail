export type Identity = {
  userId: string;
  email: string;
  displayName: string;
};

export type AuthenticationMode = "sites" | "gateway" | "local";

type HeaderSource = Pick<Headers, "get">;

const DEFAULT_HEADERS = {
  userId: "oai-authenticated-user-id",
  email: "oai-authenticated-user-email",
  fullName: "oai-authenticated-user-full-name",
  fullNameEncoding: "oai-authenticated-user-full-name-encoding",
} as const;

function configuredHeader(name: keyof typeof DEFAULT_HEADERS) {
  const environmentName = `APPLITRAIL_AUTH_${name
    .replace(/[A-Z]/g, (letter) => `_${letter}`)
    .toUpperCase()}_HEADER`;
  return process.env[environmentName]?.trim().toLowerCase() || DEFAULT_HEADERS[name];
}

export function authenticationMode(): AuthenticationMode {
  const value = process.env.APPLITRAIL_AUTH_MODE?.trim().toLowerCase();
  if (value === "gateway" || value === "local" || value === "sites") return value;
  return "sites";
}

function equalSecret(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function gatewayIsTrusted(headers: HeaderSource) {
  const expected = process.env.APPLITRAIL_AUTH_GATEWAY_SECRET?.trim();
  if (!expected) return false;
  const headerName = process.env.APPLITRAIL_AUTH_GATEWAY_SECRET_HEADER?.trim().toLowerCase()
    || "x-applitrail-auth-secret";
  const received = headers.get(headerName) ?? "";
  return equalSecret(received, expected);
}

export function identityFromTrustedHeaders(headers: HeaderSource): Identity | null {
  const userId = headers.get(configuredHeader("userId"));
  const email = headers.get(configuredHeader("email"));
  if (!userId || !email) return null;

  const encodedFullName = headers.get(configuredHeader("fullName"));
  const encoding = headers.get(configuredHeader("fullNameEncoding"));
  let fullName: string | null = null;
  if (encodedFullName && encoding === "percent-encoded-utf-8") {
    try {
      fullName = decodeURIComponent(encodedFullName);
    } catch {
      fullName = null;
    }
  } else if (encodedFullName) {
    fullName = encodedFullName;
  }

  return { userId, email, displayName: fullName || email };
}

export function identityFromRequestHeaders(headers: HeaderSource): Identity | null {
  const mode = authenticationMode();
  if (mode === "local") {
    if (process.env.NODE_ENV === "production") return null;
    const email = process.env.APPLIFLOW_ADMIN_EMAIL?.trim() || "local@applitrail.test";
    return { userId: "applitrail-local-user", email, displayName: "Local Administrator" };
  }
  if (mode === "gateway" && !gatewayIsTrusted(headers)) return null;
  return identityFromTrustedHeaders(headers);
}
