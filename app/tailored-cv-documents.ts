import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import {
  parseTailoredCv,
  type TailoredCvIdentity,
  type TailoredCvTemplateId,
} from "./tailored-cv-format";

type TailoredCvDocumentOptions = {
  content: string;
  identity: TailoredCvIdentity;
  template: TailoredCvTemplateId;
  company: string;
  role: string;
};

const BLUE = "2466C5";
const NAVY = "17263B";
const BODY = "263443";
const BLACK = "111111";

function safeText(value: string) {
  return value.replace(/[\u2010-\u2015]/g, "-").replace(/\u00a0/g, " ");
}

function sectionHeading(title: string, template: TailoredCvTemplateId) {
  const blue = template === "blue-professional";
  return new Paragraph({
    spacing: { before: blue ? 260 : 300, after: 110 },
    keepNext: true,
    border: {
      bottom: {
        color: blue ? BLUE : BLACK,
        style: BorderStyle.SINGLE,
        size: blue ? 10 : 7,
        space: 4,
      },
    },
    children: [
      new TextRun({
        text: safeText(title.toUpperCase()),
        font: "Arial",
        size: blue ? 24 : 28,
        bold: true,
        color: blue ? BLUE : BLACK,
      }),
    ],
  });
}

function bodyParagraph(
  text: string,
  template: TailoredCvTemplateId,
  bullet: boolean,
  emphasis: boolean,
) {
  const blue = template === "blue-professional";
  return new Paragraph({
    ...(bullet ? { bullet: { level: 0 } } : {}),
    spacing: { after: bullet ? 45 : 80, line: blue ? 275 : 280 },
    keepLines: true,
    children: [
      new TextRun({
        text: safeText(text),
        font: "Arial",
        size: blue ? 20 : 21,
        bold: emphasis,
        color: blue ? BODY : BLACK,
      }),
    ],
  });
}

export async function createTailoredCvDocxBlob(options: TailoredCvDocumentOptions) {
  const parsed = parseTailoredCv(options.content, options.identity);
  const blue = options.template === "blue-professional";
  const headerAlignment = blue ? AlignmentType.LEFT : AlignmentType.CENTER;
  const sections = parsed.sections.flatMap((section) => [
    sectionHeading(section.title, options.template),
    ...section.entries.map((entry) =>
      bodyParagraph(entry.text, options.template, entry.bullet, entry.emphasis),
    ),
  ]);

  const document = new Document({
    creator: "AppliTrail",
    title: `${parsed.name} - ${options.role} - Tailored CV`,
    description: `Tailored CV for ${options.role} at ${options.company}`,
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: blue ? 20 : 21, color: blue ? BODY : BLACK },
          paragraph: { spacing: { after: 80, line: blue ? 275 : 280 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11_906, height: 16_838 },
            margin: {
              top: blue ? 780 : 850,
              right: blue ? 850 : 900,
              bottom: 800,
              left: blue ? 850 : 900,
              header: 400,
              footer: 400,
            },
          },
        },
        children: [
          new Paragraph({
            alignment: headerAlignment,
            spacing: { after: blue ? 120 : 150 },
            keepNext: true,
            children: [
              new TextRun({
                text: safeText(parsed.name.toUpperCase()),
                font: "Arial",
                size: blue ? 54 : 64,
                bold: true,
                color: blue ? BLUE : BLACK,
              }),
            ],
          }),
          ...(parsed.headline
            ? [
                new Paragraph({
                  alignment: headerAlignment,
                  spacing: { after: 85 },
                  keepNext: true,
                  children: [
                    new TextRun({
                      text: safeText(parsed.headline.toUpperCase()),
                      font: "Arial",
                      size: blue ? 28 : 27,
                      bold: true,
                      color: blue ? NAVY : BLACK,
                    }),
                  ],
                }),
              ]
            : []),
          ...(parsed.contact
            ? [
                new Paragraph({
                  alignment: headerAlignment,
                  spacing: { after: blue ? 250 : 280 },
                  border: blue
                    ? {
                        bottom: {
                          color: BLUE,
                          style: BorderStyle.SINGLE,
                          size: 8,
                          space: 12,
                        },
                      }
                    : undefined,
                  keepNext: true,
                  children: [
                    new TextRun({
                      text: safeText(parsed.contact),
                      font: "Arial",
                      size: 19,
                      color: blue ? BODY : BLACK,
                    }),
                  ],
                }),
              ]
            : []),
          ...sections,
        ],
      },
    ],
  });

  return Packer.toBlob(document);
}

function pdfLines(
  document: import("jspdf").jsPDF,
  text: string,
  width: number,
) {
  return document.splitTextToSize(safeText(text), width) as string[];
}

export async function createTailoredCvPdfBlob(options: TailoredCvDocumentOptions) {
  const { jsPDF } = await import("jspdf");
  const parsed = parseTailoredCv(options.content, options.identity);
  const blue = options.template === "blue-professional";
  const document = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const marginX = blue ? 17 : 19;
  const contentWidth = pageWidth - marginX * 2;
  const bodySize = blue ? 9.6 : 10;
  const bodyLine = blue ? 4.35 : 4.55;
  let y = blue ? 18 : 20;

  document.setProperties({
    title: `${parsed.name} - ${options.role} - Tailored CV`,
    subject: `Tailored CV for ${options.role} at ${options.company}`,
    author: parsed.name,
    creator: "AppliTrail",
  });

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - 15) return;
    document.addPage();
    y = 17;
  };

  const drawTextLines = ({
    text,
    indent = 0,
    bullet = false,
    bold = false,
    after = 1.4,
  }: {
    text: string;
    indent?: number;
    bullet?: boolean;
    bold?: boolean;
    after?: number;
  }) => {
    const bulletIndent = bullet ? 4 : 0;
    const lines = pdfLines(document, text, contentWidth - indent - bulletIndent);
    ensureSpace(lines.length * bodyLine + after);
    document.setFont("helvetica", bold ? "bold" : "normal");
    document.setFontSize(bodySize);
    document.setTextColor(blue ? 38 : 17, blue ? 52 : 17, blue ? 67 : 17);
    if (bullet) document.text("•", marginX + indent, y);
    document.text(lines, marginX + indent + bulletIndent, y);
    y += lines.length * bodyLine + after;
  };

  document.setFont("helvetica", "bold");
  document.setFontSize(blue ? 26 : 30);
  document.setTextColor(blue ? 36 : 17, blue ? 102 : 17, blue ? 197 : 17);
  document.text(safeText(parsed.name.toUpperCase()), blue ? marginX : pageWidth / 2, y, {
    align: blue ? "left" : "center",
  });
  y += blue ? 8.2 : 10;

  if (parsed.headline) {
    document.setFontSize(blue ? 13.5 : 12.5);
    document.setTextColor(blue ? 23 : 17, blue ? 38 : 17, blue ? 59 : 17);
    document.text(safeText(parsed.headline.toUpperCase()), blue ? marginX : pageWidth / 2, y, {
      align: blue ? "left" : "center",
    });
    y += 6.2;
  }

  if (parsed.contact) {
    document.setFont("helvetica", "normal");
    document.setFontSize(9.2);
    document.setTextColor(blue ? 38 : 17, blue ? 52 : 17, blue ? 67 : 17);
    const contact = pdfLines(document, parsed.contact, contentWidth);
    document.text(contact, blue ? marginX : pageWidth / 2, y, {
      align: blue ? "left" : "center",
    });
    y += contact.length * 4 + 3;
  }

  if (blue) {
    document.setDrawColor(36, 102, 197);
    document.setLineWidth(0.35);
    document.line(marginX, y, pageWidth - marginX, y);
    y += 3;
  } else {
    y += 1;
  }

  for (const section of parsed.sections) {
    ensureSpace(12);
    y += blue ? 3.2 : 4.2;
    document.setFont("helvetica", "bold");
    document.setFontSize(blue ? 11.5 : 14);
    document.setTextColor(blue ? 36 : 17, blue ? 102 : 17, blue ? 197 : 17);
    document.text(safeText(section.title.toUpperCase()), marginX, y);
    y += 2.1;
    document.setDrawColor(blue ? 36 : 17, blue ? 102 : 17, blue ? 197 : 17);
    document.setLineWidth(blue ? 0.3 : 0.22);
    document.line(marginX, y, pageWidth - marginX, y);
    y += blue ? 4.5 : 5;

    for (const entry of section.entries) {
      drawTextLines({
        text: entry.text,
        bullet: entry.bullet,
        bold: entry.emphasis,
        indent: entry.bullet ? 1 : 0,
        after: entry.emphasis ? 2.1 : 1.3,
      });
    }
  }

  return document.output("blob");
}
