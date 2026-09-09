import { getResumeStorage } from "../../../db";
import { applicationDocumentKey, validApplicationDocumentId } from "../../../db/application-document-storage";
import { ensureUser } from "../../../db/appliflow-store";
import { resumeKey, validResumeId } from "../../../db/resume-storage";
import { rejectCrossSiteMutation } from "../../api-security";
import { authenticationRequired, requestUser } from "../../request-user";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

function contentTypeFor(file: File) {
  if (ALLOWED_TYPES.has(file.type)) return file.type;
  if (/\.pdf$/i.test(file.name)) return "application/pdf";
  if (/\.docx$/i.test(file.name)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (/\.doc$/i.test(file.name)) return "application/msword";
  return "";
}

function detectedType(bytes: ArrayBuffer) {
  const data = new Uint8Array(bytes);
  const beginsWith = (...signature: number[]) => signature.every((byte, index) => data[index] === byte);
  if (beginsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (beginsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return "application/msword";
  if (beginsWith(0x50, 0x4b, 0x03, 0x04)) {
    const index = new TextDecoder("latin1").decode(data);
    if (index.includes("[Content_Types].xml") && index.includes("word/")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "";
}

function safeName(value: string) {
  const printable = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return character === "\\" || character === "/" || code < 32 || code === 127 ? " " : character;
  }).join("");
  return printable.replace(/\s+/g, " ").trim().slice(0, 180) || "application-document";
}

async function activeIdentity(request: Request) {
  const identity = requestUser(request);
  if (!identity) return null;
  const account = await ensureUser(identity);
  if (account.accountStatus === "suspended") return null;
  return identity;
}

export async function POST(request: Request) {
  const untrusted = rejectCrossSiteMutation(request);
  if (untrusted) return untrusted;
  const identity = await activeIdentity(request);
  if (!identity) return authenticationRequired();
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a PDF or Word document." }, { status: 400 });
    const expected = contentTypeFor(file);
    if (!expected || file.size <= 0 || file.size > MAX_FILE_SIZE) return Response.json({ error: "Choose a PDF, DOC or DOCX file smaller than 5 MB." }, { status: 400 });
    const contents = await file.arrayBuffer();
    const contentType = detectedType(contents);
    if (!contentType || contentType !== expected) return Response.json({ error: "This file does not appear to be a valid PDF or Word document." }, { status: 400 });
    const id = crypto.randomUUID(), uploadedAt = new Date().toISOString(), name = safeName(file.name);
    await getResumeStorage().put(applicationDocumentKey(identity.userId, id), contents, {
      httpMetadata: { contentType },
      customMetadata: { ownerId: identity.userId, originalName: name, uploadedAt, purpose: "application-document" },
    });
    return Response.json({ document: { id, name, size: file.size, type: contentType, uploadedAt } }, { status: 201 });
  } catch {
    return Response.json({ error: "The document could not be uploaded. Please try again." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const untrusted = rejectCrossSiteMutation(request);
  if (untrusted) return untrusted;
  const identity = await activeIdentity(request);
  if (!identity) return authenticationRequired();
  try {
    const payload = await request.json() as { resumeId?: string; name?: string };
    const resumeId = validResumeId(payload.resumeId);
    if (!resumeId) return Response.json({ error: "Choose an uploaded Master CV to attach." }, { status: 400 });
    const source = await getResumeStorage().get(resumeKey(identity.userId, resumeId));
    if (!source) return Response.json({ error: "The selected Master CV file was not found." }, { status: 404 });
    const id = crypto.randomUUID(), uploadedAt = new Date().toISOString(), bytes = await source.arrayBuffer();
    const name = safeName(payload.name || source.customMetadata?.originalName || "Master CV");
    const type = source.httpMetadata?.contentType || "application/octet-stream";
    await getResumeStorage().put(applicationDocumentKey(identity.userId, id), bytes, {
      httpMetadata: { contentType: type },
      customMetadata: { ownerId: identity.userId, originalName: name, uploadedAt, purpose: "application-document", copiedFrom: resumeId },
    });
    return Response.json({ document: { id, name, size: bytes.byteLength, type, uploadedAt } }, { status: 201 });
  } catch {
    return Response.json({ error: "The Master CV copy could not be attached. Please try again." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const identity = await activeIdentity(request);
  if (!identity) return authenticationRequired();
  const id = validApplicationDocumentId(new URL(request.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "A valid application document is required." }, { status: 400 });
  const object = await getResumeStorage().get(applicationDocumentKey(identity.userId, id));
  if (!object) return Response.json({ error: "Application document not found." }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(object.customMetadata?.originalName || "application-document")}`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(object.body, { headers });
}

export async function DELETE(request: Request) {
  const untrusted = rejectCrossSiteMutation(request);
  if (untrusted) return untrusted;
  const identity = await activeIdentity(request);
  if (!identity) return authenticationRequired();
  const id = validApplicationDocumentId(new URL(request.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "A valid application document is required." }, { status: 400 });
  await getResumeStorage().delete(applicationDocumentKey(identity.userId, id));
  return Response.json({ deleted: true });
}
