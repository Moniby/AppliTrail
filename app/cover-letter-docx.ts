import {
  AlignmentType,
  Document,
  Footer,
  Header,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";

type CoverLetterIdentity = {
  name: string;
  phone: string;
  email: string;
  address: string;
  linkedin: string;
};

function cleanText(value: string) {
  return value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^[-*•]\s+/gm, "")
    .trim();
}

function coverLetterParagraphs(content: string) {
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  const blocks = normalized.includes("\n\n") ? normalized.split(/\n{2,}/) : normalized.split("\n");

  return blocks
    .map((block) => cleanText(block.replace(/\n+/g, " ")))
    .filter(Boolean)
    .map((text) => new Paragraph({
      spacing: { after: 220, line: 320 },
      children: [new TextRun({ text })],
    }));
}

export async function createCoverLetterDocxBlob({
  content,
  identity,
  company,
  role,
  generatedAt = new Date(),
}: {
  content: string;
  identity: CoverLetterIdentity;
  company: string;
  role: string;
  generatedAt?: Date;
}) {
  const formattedDate = generatedAt.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const contact = [identity.address, identity.phone, identity.email, identity.linkedin]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("  |  ");

  const document = new Document({
    creator: "AppliTrail",
    title: `Cover Letter - ${role} at ${company}`,
    description: `AppliTrail cover letter for ${role} at ${company}`,
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: "263A55" },
          paragraph: { spacing: { after: 180, line: 320 } },
        },
      },
      paragraphStyles: [
        {
          id: "ApplicantName",
          name: "Applicant Name",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Calibri", size: 42, bold: true, color: "0B2545" },
          paragraph: { spacing: { after: 70 }, keepNext: true },
        },
        {
          id: "LetterSubject",
          name: "Letter Subject",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Calibri", size: 24, bold: true, color: "1F5FAE" },
          paragraph: { spacing: { before: 100, after: 260 }, keepNext: true },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12_240, height: 15_840 },
            margin: { top: 1_080, right: 1_260, bottom: 1_080, left: 1_260, header: 600, footer: 600 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: "APPLITRAIL · COVER LETTER", bold: true, size: 17, color: "6A7B90" })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: "AppliTrail · Page ", size: 17, color: "748399" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 17, color: "748399" }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            style: "ApplicantName",
            children: [new TextRun({ text: identity.name.trim() || "Applicant", bold: true })],
          }),
          ...(contact
            ? [new Paragraph({ spacing: { after: 260 }, children: [new TextRun({ text: contact, size: 19, color: "5F7188" })] })]
            : []),
          new Paragraph({ children: [new TextRun({ text: formattedDate })] }),
          new Paragraph({
            style: "LetterSubject",
            children: [new TextRun({ text: `Re: ${role} at ${company}`, bold: true })],
          }),
          ...coverLetterParagraphs(content),
        ],
      },
    ],
  });

  return Packer.toBlob(document);
}
