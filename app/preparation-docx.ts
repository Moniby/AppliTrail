import {
  AlignmentType,
  Document,
  Footer,
  Header,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import { parsePreparationBlocks } from "./preparation-format";

function inlineRuns(text: string, forceBold = false, inheritParagraphStyle = false) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) => {
    const markedBold = /^\*\*[^*]+\*\*$/.test(part);
    return new TextRun({
      text: markedBold ? part.slice(2, -2) : part,
      bold: forceBold || markedBold,
      ...(inheritParagraphStyle ? {} : { font: "Calibri", size: 22, color: "263A55" }),
    });
  });
}

function preparationParagraphs(content: string) {
  return parsePreparationBlocks(content).map((block) => {
    if (block.type === "heading") {
      return new Paragraph({
        style: block.level === 1 ? "PrepHeading1" : "PrepHeading2",
        children: inlineRuns(block.text, true, true),
      });
    }
    if (block.type === "bullet") {
      return new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 80, line: 300 },
        children: inlineRuns(block.text),
      });
    }
    if (block.type === "numbered") {
      return new Paragraph({
        numbering: { reference: "prep-numbered", level: 0 },
        spacing: { after: 80, line: 300 },
        children: inlineRuns(block.text),
      });
    }
    return new Paragraph({ spacing: { after: 120, line: 300 }, children: inlineRuns(block.text) });
  });
}

export async function createPreparationDocxBlob({
  content,
  kind,
  company,
  role,
  generatedAt = new Date(),
}: {
  content: string;
  kind: "phone" | "interview";
  company: string;
  role: string;
  generatedAt?: Date;
}) {
  const documentLabel = kind === "phone" ? "Phone Screen Brief" : "Interview Preparation";
  const formattedDate = generatedAt.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
  const document = new Document({
    creator: "AppliTrail",
    title: `${documentLabel} - ${role} at ${company}`,
    description: `AppliTrail ${documentLabel.toLowerCase()} for ${role} at ${company}`,
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: "263A55" },
          paragraph: { spacing: { after: 120, line: 300 } },
        },
      },
      paragraphStyles: [
        {
          id: "PrepTitle",
          name: "Preparation Title",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Calibri", size: 48, bold: true, color: "0B2545" },
          paragraph: { spacing: { before: 0, after: 120 }, keepNext: true },
        },
        {
          id: "PrepHeading1",
          name: "Preparation Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Calibri", size: 32, bold: true, color: "1F5FAE" },
          paragraph: { spacing: { before: 360, after: 200 }, keepNext: true, outlineLevel: 0 },
        },
        {
          id: "PrepHeading2",
          name: "Preparation Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Calibri", size: 26, bold: true, color: "1F5FAE" },
          paragraph: { spacing: { before: 280, after: 140 }, keepNext: true, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "prep-numbered",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 540, hanging: 270 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12_240, height: 15_840 },
            margin: { top: 1_440, right: 1_440, bottom: 1_440, left: 1_440, header: 708, footer: 708 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `AppliTrail · ${documentLabel.toUpperCase()}`, bold: true, size: 18, color: "5F7188" })],
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
                  new TextRun({ text: "AppliTrail · Page ", size: 18, color: "748399" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "748399" }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ style: "PrepTitle", children: [new TextRun({ text: documentLabel, bold: true })] }),
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: `${role} · ${company}`, bold: true, size: 26, color: "315E96" }),
            ],
          }),
          new Paragraph({
            spacing: { after: 280 },
            children: [new TextRun({ text: `Prepared ${formattedDate}`, size: 20, color: "697A90" })],
          }),
          ...preparationParagraphs(content),
        ],
      },
    ],
  });

  return Packer.toBlob(document);
}
