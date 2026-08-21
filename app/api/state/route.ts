import { ensureUser, getUsageSummary, getUserState, saveUserState } from "../../../db/appliflow-store";
import { authenticationRequired, requestUser } from "../../request-user";

const STAGES = new Set(["Saved", "Applied", "No response after application", "Phone screen", "Interview", "No response after interview", "Assessment", "Offer", "Rejected"]);
const MAX_APPLICATIONS = 500;
const MAX_MASTER_CVS = 20;

function text(value: unknown, maximum = 40_000) {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

function cleanProfile(value: unknown) {
  const profile = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    name: text(profile.name, 200), headline: text(profile.headline, 300), phone: text(profile.phone, 120),
    email: text(profile.email, 320), address: text(profile.address, 500), linkedin: text(profile.linkedin, 500),
    summary: text(profile.summary), skills: text(profile.skills), experience: text(profile.experience), education: text(profile.education),
    certifications: Array.isArray(profile.certifications) ? profile.certifications.map((item) => text(item, 500)).filter(Boolean).slice(0, 50) : [],
  };
}

function cleanResume(value: unknown) {
  const resume = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (!resume || !/^[a-f0-9-]{20,60}$/i.test(text(resume.id, 80))) return null;
  return { id: text(resume.id, 80), name: text(resume.name, 300), size: Math.max(0, Number(resume.size) || 0), type: text(resume.type, 200), uploadedAt: text(resume.uploadedAt, 50) };
}

function cleanState(value: unknown) {
  const state = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const masterCvs = (Array.isArray(state.masterCvs) ? state.masterCvs : []).slice(0, MAX_MASTER_CVS).map((item, index) => {
    const master = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      id: text(master.id, 100) || `master-${index + 1}`,
      label: text(master.label, 300) || `Master CV ${index + 1}`,
      profile: cleanProfile(master.profile),
      resume: cleanResume(master.resume),
      createdAt: text(master.createdAt, 50) || new Date().toISOString(),
    };
  });
  const masterIds = new Set(masterCvs.map((master) => master.id));
  const fallbackMasterId = masterCvs[0]?.id || "";
  const apps = (Array.isArray(state.apps) ? state.apps : []).slice(0, MAX_APPLICATIONS).map((item) => {
    const app = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const stage = text(app.stage, 80);
    const safe = { ...app } as Record<string, unknown>;
    for (const [key, maximum] of Object.entries({ company: 300, role: 300, sector: 300, location: 500, url: 1000, description: 40_000, date: 30, phoneDate: 30, phoneTime: 30, phoneTimeZone: 100, interviewDate: 30, interviewTime: 30, interviewTimeZone: 100 })) {
      safe[key] = text(app[key], maximum);
    }
    safe.id = Number.isFinite(Number(app.id)) ? Number(app.id) : Date.now();
    safe.stage = STAGES.has(stage) ? stage : "Saved";
    safe.masterCvId = masterIds.has(text(app.masterCvId, 100)) ? text(app.masterCvId, 100) : fallbackMasterId;
    delete safe.eventDate; delete safe.eventTime;
    return safe;
  });
  const activeMasterCvId = masterIds.has(text(state.activeMasterCvId, 100)) ? text(state.activeMasterCvId, 100) : fallbackMasterId;
  return { schemaVersion: 2, apps, masterCvs, activeMasterCvId };
}

export async function GET(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  try {
    const account = await ensureUser(identity);
    const [stored, usage] = await Promise.all([getUserState(identity.userId), getUsageSummary(identity.userId)]);
    return Response.json({ account, usage, hasState: Boolean(stored), state: stored?.state ?? null, updatedAt: stored?.updatedAt ?? null });
  } catch {
    return Response.json({ error: "AppliFlow could not load your account data. Please refresh and try again." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  try {
    await ensureUser(identity);
    const payload = await request.json() as { state?: unknown };
    const state = cleanState(payload.state);
    if (!state.masterCvs.length) return Response.json({ error: "Keep at least one Master CV in your account." }, { status: 400 });
    await saveUserState(identity.userId, state);
    return Response.json({ saved: true, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Your account data could not be saved.";
    return Response.json({ error: message }, { status: 500 });
  }
}
