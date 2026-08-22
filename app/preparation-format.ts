export type PreparationBlock = {
  type: "heading" | "bullet" | "numbered" | "paragraph";
  text: string;
  level?: number;
  marker?: string;
};

function cleanHeading(text: string) {
  return text
    .replace(/^(?:\*\*|__)/, "")
    .replace(/(?:\*\*|__):?$/, "")
    .replace(/:$/, "")
    .trim();
}

export function parsePreparationBlocks(content: string): PreparationBlock[] {
  const blocks: PreparationBlock[] = [];
  for (const rawLine of content.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const markdownHeading = line.match(/^(#{1,6})\s+(.+)$/);
    if (markdownHeading) {
      blocks.push({ type: "heading", text: cleanHeading(markdownHeading[2]), level: Math.min(2, markdownHeading[1].length) });
      continue;
    }

    if (/^(?:\*\*|__).+(?:\*\*|__):?$/.test(line)) {
      blocks.push({ type: "heading", text: cleanHeading(line), level: 2 });
      continue;
    }

    if (/^[A-Z0-9][A-Z0-9 '&/(),.+\-–—]{3,100}$/.test(line) || (/^[A-Z][^.!?]{1,90}:$/.test(line) && !/^https?:/i.test(line))) {
      blocks.push({ type: "heading", text: cleanHeading(line), level: 2 });
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      blocks.push({ type: "bullet", text: bullet[1].trim() });
      continue;
    }

    const numbered = line.match(/^(\d+[.)])\s+(.+)$/);
    if (numbered) {
      blocks.push({ type: "numbered", marker: numbered[1], text: numbered[2].trim() });
      continue;
    }

    blocks.push({ type: "paragraph", text: line });
  }
  return blocks;
}
