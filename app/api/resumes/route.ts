import { getResumeStorage } from "../../../db";
import { ensureUser } from "../../../db/appliflow-store";
import { resumeKey, validResumeId } from "../../../db/resume-storage";
import { rejectCrossSiteMutation } from "../../api-security";
import { authenticationRequired, requestUser } from "../../request-user";

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

function resumeContentType(file: File) {
  if (ALLOWED_TYPES.has(file.type)) return file.type;
  if (/\.pdf$/i.test(file.name)) return "application/pdf";
  if (/\.docx$/i.test(file.name)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (/\.doc$/i.test(file.name)) return "application/msword";
  return "";
}

function detectedResumeContentType(bytes: ArrayBuffer) {
  const data = new Uint8Array(bytes);
  const beginsWith = (...signature: number[]) => signature.every((byte, index) => data[index] === byte);
  if (beginsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (beginsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return "application/msword";
  if (beginsWith(0x50, 0x4b, 0x03, 0x04)) {
    const archiveIndex = new TextDecoder("latin1").decode(data);
    if (archiveIndex.includes("[Content_Types].xml") && archiveIndex.includes("word/")) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
  }
  return "";
}

function safeResumeName(name: string) {
  return name.replace(/[\\/\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || "resume";
}

export async function POST(request: Request) {
  const untrusted = rejectCrossSiteMutation(request);
  if (untrusted) return untrusted;
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  try {
    const account = await ensureUser(identity);
    if (account.accountStatus === "suspended") return Response.json({ error: "This AppliTrail account is suspended." }, { status: 403 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a resume to upload." }, { status: 400 });
    const expectedContentType = resumeContentType(file);
    if (!expectedContentType || file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return Response.json({ error: "Choose a PDF, DOC or DOCX resume smaller than 3 MB." }, { status: 400 });
    }
    const contents = await file.arrayBuffer();
    const contentType = detectedResumeContentType(contents);
    if (!contentType || contentType !== expectedContentType) {
      return Response.json({ error: "This file does not appear to be a valid PDF, DOC or DOCX resume." }, { status: 400 });
    }
    const id = crypto.randomUUID();
    const uploadedAt = new Date().toISOString();
    const originalName = safeResumeName(file.name);
    await getResumeStorage().put(resumeKey(identity.userId, id), contents, {
      httpMetadata: { contentType },
      customMetadata: { ownerId: identity.userId, originalName, uploadedAt },
    });
    return Response.json({ resume: { id, name: originalName, size: file.size, type: contentType, uploadedAt } }, { status: 201 });
  } catch {
    return Response.json({ error: "The resume could not be uploaded. Please try again." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  const account = await ensureUser(identity);
  if (account.accountStatus === "suspended") return Response.json({ error: "This AppliTrail account is suspended." }, { status: 403 });
  const id = validResumeId(new URL(request.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "A valid resume is required." }, { status: 400 });
  const object = await getResumeStorage().get(resumeKey(identity.userId, id));
  if (!object) return Response.json({ error: "Resume not found." }, { status: 404 });
  const name = object.customMetadata?.originalName || "resume";
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(object.body, { headers });
}

export async function DELETE(request: Request) {
  const untrusted = rejectCrossSiteMutation(request);
  if (untrusted) return untrusted;
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  const account = await ensureUser(identity);
  if (account.accountStatus === "suspended") return Response.json({ error: "This AppliTrail account is suspended." }, { status: 403 });
  const id = validResumeId(new URL(request.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "A valid resume is required." }, { status: 400 });
  await getResumeStorage().delete(resumeKey(identity.userId, id));
  return Response.json({ deleted: true });
}
