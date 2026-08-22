export type TailoredCvTemplateId = "blue-professional" | "clean-classic";

export type TailoredCvIdentity = {
  name: string;
  headline: string;
  phone: string;
  email: string;
  address: string;
  linkedin: string;
};

export type TailoredCvEntry = {
  text: string;
  bullet: boolean;
  emphasis: boolean;
};

export type TailoredCvSection = {
  title: string;
  entries: TailoredCvEntry[];
};

export type ParsedTailoredCv = {
  name: string;
  headline: string;
  contact: string;
  sections: TailoredCvSection[];
};

export const tailoredCvTemplates: Array<{
  id: TailoredCvTemplateId;
  name: string;
  description: string;
  atsLabel: string;
}> = [
  {
    id: "blue-professional",
    name: "Format 1 - Blue Professional",
    description: "Blue headings and rules based on your original AppliFlow CV.",
    atsLabel: "ATS friendly",
  },
  {
    id: "clean-classic",
    name: "Format 2 - Clean Classic",
    description: "Centred header, black section titles and a traditional layout.",
    atsLabel: "Highest ATS compatibility",
  },
];

const sectionAliases = new Map<string, string>([
  ["PROFILE", "PROFILE"],
  ["PROFESSIONAL PROFILE", "PROFESSIONAL PROFILE"],
  ["PROFESSIONAL SUMMARY", "PROFESSIONAL SUMMARY"],
  ["SUMMARY", "PROFESSIONAL SUMMARY"],
  ["CORE COMPETENCIES", "CORE COMPETENCIES"],
  ["CORE SKILLS", "CORE SKILLS"],
  ["TECHNICAL SKILLS", "TECHNICAL SKILLS"],
  ["SKILLS", "SKILLS"],
  ["PROFESSIONAL EXPERIENCE", "PROFESSIONAL EXPERIENCE"],
  ["WORK EXPERIENCE", "WORK EXPERIENCE"],
  ["EMPLOYMENT HISTORY", "EMPLOYMENT HISTORY"],
  ["EXPERIENCE", "PROFESSIONAL EXPERIENCE"],
  ["EDUCATION", "EDUCATION"],
  ["CERTIFICATIONS", "CERTIFICATIONS"],
  ["CERTIFICATES", "CERTIFICATIONS"],
  ["PROJECTS", "PROJECTS"],
  ["TECHNICAL TOOLS", "TECHNICAL TOOLS"],
  ["TOOLS & TECHNOLOGIES", "TOOLS & TECHNOLOGIES"],
  ["TOOLS AND TECHNOLOGIES", "TOOLS & TECHNOLOGIES"],
  ["TOOLS", "TOOLS"],
  ["LANGUAGES", "LANGUAGES"],
  ["ACHIEVEMENTS", "ACHIEVEMENTS"],
  ["VOLUNTEER EXPERIENCE", "VOLUNTEER EXPERIENCE"],
  ["VOLUNTEERING", "VOLUNTEERING"],
  ["ADDITIONAL INFORMATION", "ADDITIONAL INFORMATION"],
]);

function cleanInlineFormatting(value: string) {
  return value
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedHeading(value: string) {
  const clean = cleanInlineFormatting(value).replace(/:$/, "").trim();
  return sectionAliases.get(clean.toUpperCase()) ?? null;
}

function looksLikeSectionHeading(value: string) {
  if (normalizedHeading(value)) return true;
  const clean = cleanInlineFormatting(value).replace(/:$/, "").trim();
  return clean.length >= 4 && clean.length <= 54 && /^[A-Z][A-Z0-9 &/,+()-]+$/.test(clean);
}

function looksLikeRoleLine(value: string) {
  const clean = cleanInlineFormatting(value);
  return (
    /\b(?:19|20)\d{2}\b/.test(clean) ||
    /\b(?:present|current)\b/i.test(clean) ||
    /\s[|·]\s/.test(clean) ||
    /\s[-–—]\s/.test(clean)
  );
}

function contactLine(identity: TailoredCvIdentity) {
  return [identity.address, identity.phone, identity.email, identity.linkedin].filter(Boolean).join(" | ");
}

export function parseTailoredCv(content: string, identity: TailoredCvIdentity): ParsedTailoredCv {
  const lines = content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const firstSectionIndex = lines.findIndex((line) => Boolean(normalizedHeading(line)));
  const inferredHeaderLength = firstSectionIndex >= 0 ? firstSectionIndex : Math.min(3, lines.length);
  const headerLines = lines.slice(0, inferredHeaderLength);
  const bodyLines = lines.slice(inferredHeaderLength);
  const identityValues = new Set(
    [identity.name, identity.headline, identity.address, identity.phone, identity.email, identity.linkedin]
      .filter(Boolean)
      .map((value) => cleanInlineFormatting(value).toLowerCase()),
  );
  const meaningfulHeader = headerLines
    .map(cleanInlineFormatting)
    .filter((line) => line && !identityValues.has(line.toLowerCase()));

  const name = cleanInlineFormatting(headerLines[0] || identity.name || "Your name");
  const headline = cleanInlineFormatting(headerLines[1] || identity.headline || "");
  const contact = cleanInlineFormatting(
    headerLines.slice(2).join(" | ") || contactLine(identity),
  );
  const sections: TailoredCvSection[] = [];
  let current: TailoredCvSection | null = null;

  const ensureSection = () => {
    if (!current) {
      current = { title: "PROFESSIONAL PROFILE", entries: [] };
      sections.push(current);
    }
    return current;
  };

  for (const rawLine of bodyLines) {
    const heading = normalizedHeading(rawLine);
    if (heading || looksLikeSectionHeading(rawLine)) {
      const title = heading || cleanInlineFormatting(rawLine).replace(/:$/, "").toUpperCase();
      current = { title, entries: [] };
      sections.push(current);
      continue;
    }

    const bullet = rawLine.match(/^[-*•]\s+(.+)$/);
    const text = cleanInlineFormatting(bullet ? bullet[1] : rawLine);
    if (!text || meaningfulHeader.includes(text)) continue;
    ensureSection().entries.push({
      text,
      bullet: Boolean(bullet),
      emphasis: !bullet && looksLikeRoleLine(text),
    });
  }

  return {
    name: name || identity.name || "Your name",
    headline: headline || identity.headline,
    contact: contact || contactLine(identity),
    sections: sections.filter((section) => section.entries.length),
  };
}
