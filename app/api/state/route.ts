import { ensureUser, getUsageSummary, getUserCreditAudit, getUserState, hasPaidPlanFeatures, planResourceLimits, saveUserState } from "../../../db/appliflow-store";
import { authenticationRequired, requestUser } from "../../request-user";

const STAGES = new Set(["Saved", "Applied", "No response after application", "Phone screen", "Interview", "No response after interview", "Assessment", "Offer", "Rejected"]);
const POSITION_TYPES = new Set(["Full-time", "Contract", "Part-time", "Internship", "Volunteer"]);
const LOCATION_TYPES = new Set(["Remote", "Hybrid", "Onsite"]);
const MAX_APPLICATIONS = 500;
const MAX_MASTER_CVS = 20;

function text(value: unknown, maximum = 40_000) {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

function safeJobUrl(value: unknown) {
  const candidate = text(value, 1000).trim();
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch { return ""; }
}

function cleanProfile(value: unknown) {
  const profile = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const customSections = (Array.isArray(profile.customSections) ? profile.customSections : []).slice(0, 20).map((item, index) => {
    const section = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { id: text(section.id, 100).replace(/[^a-z0-9-]/gi, "-") || `section-${index + 1}`, title: text(section.title, 200) || "Additional section", content: text(section.content) };
  });
  const standardSections = ["summary", "skills", "experience", "education", "certifications", "projects", "tools"];
  const allowedSections = new Set([...standardSections, ...customSections.map((section) => `custom:${section.id}`)]);
  const hasSectionOrder = Array.isArray(profile.sectionOrder);
  const requestedOrder = (hasSectionOrder ? profile.sectionOrder as unknown[] : standardSections).map((item) => text(item, 120)).filter((item) => allowedSections.has(item));
  return {
    name: text(profile.name, 200), headline: text(profile.headline, 300), phone: text(profile.phone, 120),
    email: text(profile.email, 320), address: text(profile.address, 500), linkedin: text(profile.linkedin, 500),
    summary: text(profile.summary), skills: text(profile.skills), experience: text(profile.experience), education: text(profile.education),
    certifications: Array.isArray(profile.certifications) ? profile.certifications.map((item) => text(item, 500)).filter(Boolean).slice(0, 50) : [],
    projects: text(profile.projects), tools: text(profile.tools), customSections,
    sectionOrder: Array.from(new Set([...requestedOrder, ...customSections.map((section) => `custom:${section.id}`)])),
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
    for (const [key, maximum] of Object.entries({ company: 300, role: 300, sector: 300, location: 500, description: 40_000, salary: 200, rejectionComment: 10_000, interviewNotes: 20_000, date: 30, phoneDate: 30, phoneTime: 30, phoneTimeZone: 100, interviewDate: 30, interviewTime: 30, interviewTimeZone: 100 })) {
      safe[key] = text(app[key], maximum);
    }
    safe.customTasks = (Array.isArray(app.customTasks) ? app.customTasks : []).slice(0, 200).map((item, index) => {
      const task = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const date = /^\d{4}-\d{2}-\d{2}$/.test(text(task.date, 30)) ? text(task.date, 30) : "";
      const time = /^\d{2}:\d{2}$/.test(text(task.time, 30)) ? text(task.time, 30) : "";
      const createdAt = text(task.createdAt, 50), completedAt = text(task.completedAt, 50);
      return {
        id: text(task.id, 120).replace(/[^a-z0-9-]/gi, "-") || `task-${index + 1}`,
        title: text(task.title, 300) || "Application task",
        date,
        ...(time ? { time } : {}),
        timeZone: text(task.timeZone, 100) || "Local time",
        ...(text(task.notes, 5000) ? { notes: text(task.notes, 5000) } : {}),
        completed: Boolean(task.completed),
        createdAt: createdAt && !Number.isNaN(Date.parse(createdAt)) ? createdAt : new Date().toISOString(),
        ...(completedAt && !Number.isNaN(Date.parse(completedAt)) ? { completedAt } : {}),
      };
    }).filter((task) => task.date);
    const rawReviewDecisions = app.tailoredCvReviewDecisions && typeof app.tailoredCvReviewDecisions === "object"
      ? app.tailoredCvReviewDecisions as Record<string, unknown>
      : {};
    safe.tailoredCvReviewDecisions = Object.fromEntries(
      Object.entries(rawReviewDecisions)
        .filter(([key, decision]) => key.length <= 700 && (decision === "included" || decision === "excluded"))
        .slice(0, 200),
    );
    safe.url = safeJobUrl(app.url);
    safe.id = Number.isFinite(Number(app.id)) ? Number(app.id) : Date.now();
    safe.stage = STAGES.has(stage) ? stage : "Saved";
    safe.positionType = POSITION_TYPES.has(text(app.positionType, 80)) ? text(app.positionType, 80) : "";
    safe.locationType = LOCATION_TYPES.has(text(app.locationType, 80)) ? text(app.locationType, 80) : "";
    const stageHistory = (Array.isArray(app.stageHistory) ? app.stageHistory : []).slice(0, 100).map((item) => {
      const event = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const eventStage = text(event.stage, 80), enteredAt = text(event.enteredAt, 50), leftAt = text(event.leftAt, 50);
      if (!STAGES.has(eventStage) || Number.isNaN(Date.parse(enteredAt))) return null;
      return { stage: eventStage, enteredAt, ...(leftAt && !Number.isNaN(Date.parse(leftAt)) ? { leftAt } : {}) };
    }).filter(Boolean);
    const stageDate = safe.stage === "Interview" && /^\d{4}-\d{2}-\d{2}$/.test(String(safe.interviewDate)) ? String(safe.interviewDate)
      : safe.stage === "Phone screen" && /^\d{4}-\d{2}-\d{2}$/.test(String(safe.phoneDate)) ? String(safe.phoneDate)
      : String(safe.date);
    const stageTime = safe.stage === "Interview" ? String(safe.interviewTime || "12:00") : safe.stage === "Phone screen" ? String(safe.phoneTime || "12:00") : "12:00";
    safe.stageHistory = stageHistory.length ? stageHistory : [{ stage: safe.stage, enteredAt: /^\d{4}-\d{2}-\d{2}$/.test(stageDate) && /^\d{2}:\d{2}$/.test(stageTime) ? `${stageDate}T${stageTime}:00.000Z` : new Date().toISOString() }];
    safe.masterCvId = masterIds.has(text(app.masterCvId, 100)) ? text(app.masterCvId, 100) : fallbackMasterId;
    delete safe.eventDate; delete safe.eventTime;
    return safe;
  });
  const activeMasterCvId = masterIds.has(text(state.activeMasterCvId, 100)) ? text(state.activeMasterCvId, 100) : fallbackMasterId;
  const rawPreferences = state.preferences && typeof state.preferences === "object" ? state.preferences as Record<string, unknown> : {};
  const preferences = {
    reminderDaysBefore: Math.max(1, Math.min(30, Math.round(Number(rawPreferences.reminderDaysBefore) || 3))),
    followUpDays: Math.max(3, Math.min(60, Math.round(Number(rawPreferences.followUpDays) || 7))),
  };
  return { schemaVersion: 8, apps, masterCvs, activeMasterCvId, preferences };
}

export async function GET(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  try {
    const account = await ensureUser(identity);
    if (account.accountStatus === "suspended") return Response.json({ error: "This AppliTrail account is suspended. Contact the administrator for help." }, { status: 403 });
    const [stored, usage, creditAudit] = await Promise.all([getUserState(identity.userId), getUsageSummary(identity.userId), getUserCreditAudit(identity.userId)]);
    return Response.json({ account, usage, creditAudit, hasState: Boolean(stored), state: stored?.state ?? null, updatedAt: stored?.updatedAt ?? null });
  } catch {
    return Response.json({ error: "AppliTrail could not load your account data. Please refresh and try again." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  try {
    const account = await ensureUser(identity);
    if (account.accountStatus === "suspended") return Response.json({ error: "This AppliTrail account is suspended. Contact the administrator for help." }, { status: 403 });
    const payload = await request.json() as { state?: unknown };
    const state = cleanState(payload.state);
    if (!state.masterCvs.length) return Response.json({ error: "Keep at least one Master CV in your account." }, { status: 400 });
    const stored = await getUserState(identity.userId);
    const importingExistingData = new URL(request.url).searchParams.get("migration") === "1" && !stored;
    const previous = cleanState(stored?.state);
    if (!importingExistingData) {
      const limits = planResourceLimits(account.plan);
      const planName = account.plan === "free" ? "Free" : account.plan === "basic" ? "Basic" : "Standard";
      if (account.applicationCreationLocked && state.apps.length > previous.apps.length) {
        return Response.json({ error: "Your paid subscription is no longer active. All existing applications remain available, but renew Basic or Standard to add another." }, { status: 403 });
      }
      if (limits.applications !== null && state.apps.length > limits.applications && state.apps.length > previous.apps.length) {
        return Response.json({ error: `Your ${planName} plan includes up to ${limits.applications} applications. Delete an application or upgrade to add another.` }, { status: 403 });
      }
      if (limits.masterCvs !== null && state.masterCvs.length > limits.masterCvs && state.masterCvs.length > previous.masterCvs.length) {
        return Response.json({ error: `Your ${planName} plan includes up to ${limits.masterCvs} Master CVs. Delete a Master CV or upgrade to add another.` }, { status: 403 });
      }
    }
    if (!hasPaidPlanFeatures(account.plan)) {
      if (!importingExistingData) {
        const previousTasks = new Map(previous.apps.map((application) => [application.id, application.customTasks]));
        state.apps = state.apps.map((application) => ({ ...application, customTasks: previousTasks.get(application.id) ?? [] }));
        state.preferences = previous.preferences;
      }
    }
    await saveUserState(identity.userId, state);
    return Response.json({ saved: true, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Your account data could not be saved.";
    return Response.json({ error: message }, { status: 500 });
  }
}
