import { getResumeBucket } from "../../../db";
import { ensureUser } from "../../../db/appliflow-store";
import { resumeKey, validResumeId } from "../../../db/resume-storage";
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

export async function POST(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  try {
    const account = await ensureUser(identity);
    if (account.accountStatus === "suspended") return Response.json({ error: "This AppliTrail account is suspended." }, { status: 403 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a resume to upload." }, { status: 400 });
    const contentType = resumeContentType(file);
    if (!contentType || file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return Response.json({ error: "Choose a PDF, DOC or DOCX resume smaller than 3 MB." }, { status: 400 });
    }
    const id = crypto.randomUUID();
    const uploadedAt = new Date().toISOString();
    await getResumeBucket().put(resumeKey(identity.userId, id), await file.arrayBuffer(), {
      httpMetadata: { contentType },
      customMetadata: { ownerId: identity.userId, originalName: file.name.slice(0, 300), uploadedAt },
    });
    return Response.json({ resume: { id, name: file.name.slice(0, 300), size: file.size, type: contentType, uploadedAt } }, { status: 201 });
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
  const object = await getResumeBucket().get(resumeKey(identity.userId, id));
  if (!object) return Response.json({ error: "Resume not found." }, { status: 404 });
  const name = object.customMetadata?.originalName || "resume";
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(object.body, { headers });
}

export async function DELETE(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  const account = await ensureUser(identity);
  if (account.accountStatus === "suspended") return Response.json({ error: "This AppliTrail account is suspended." }, { status: 403 });
  const id = validResumeId(new URL(request.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "A valid resume is required." }, { status: 400 });
  await getResumeBucket().delete(resumeKey(identity.userId, id));
  return Response.json({ deleted: true });
}
