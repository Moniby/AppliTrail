import { getResumeBucket } from ".";
import { resumePrefix } from "./appliflow-store";

export function validResumeId(value: string | null | undefined) {
  return value && /^[a-f0-9-]{20,60}$/i.test(value) ? value : null;
}

export function resumeKey(userId: string, id: string) {
  return `${resumePrefix(userId)}${id}`;
}

export async function loadResumeForUser(userId: string, resume: { id?: string; name?: string; type?: string } | null | undefined) {
  const id = validResumeId(resume?.id);
  if (!id) return null;
  const object = await getResumeBucket().get(resumeKey(userId, id));
  if (!object) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  const type = object.httpMetadata?.contentType || resume?.type || "application/octet-stream";
  return { name: object.customMetadata?.originalName || resume?.name || "resume", dataUrl: `data:${type};base64,${btoa(binary)}` };
}
