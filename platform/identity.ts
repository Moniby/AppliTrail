export type Identity = {
  userId: string;
  email: string;
  displayName: string;
};

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
