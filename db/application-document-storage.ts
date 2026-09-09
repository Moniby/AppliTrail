import { getResumeStorage } from ".";
import { resumePrefix } from "./appliflow-store";

export function validApplicationDocumentId(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  return /^[a-f0-9-]{20,60}$/i.test(id) ? id : "";
}

export function applicationDocumentKey(userId: string, id: string) {
  return `${resumePrefix(userId)}application-documents/${id}`;
}

export async function loadApplicationDocumentForUser(
  userId: string,
  document: { id?: string; name?: string; type?: string } | null | undefined,
) {
  const id = validApplicationDocumentId(document?.id);
  if (!id) return null;
  const object = await getResumeStorage().get(applicationDocumentKey(userId, id));
  if (!object) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const type = object.httpMetadata?.contentType || document?.type || "application/octet-stream";
  return {
    name: object.customMetadata?.originalName || document?.name || "application-cv",
    dataUrl: `data:${type};base64,${btoa(binary)}`,
  };
}
