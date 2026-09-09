"use client";

import { useMemo, useState } from "react";

export type CrmContact = {
  id: string;
  name: string;
  role: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  notes?: string;
  lastContactedAt?: string;
};

export type InterviewRound = {
  id: string;
  type: string;
  date: string;
  time?: string;
  timeZone: string;
  format?: string;
  interviewers?: string;
  notes?: string;
  outcome?: string;
};

type CrmApplication = {
  id: number;
  company: string;
  role: string;
  stage: string;
  date: string;
  phoneDate?: string;
  phoneTime?: string;
  phoneTimeZone?: string;
  interviewDate?: string;
  interviewTime?: string;
  interviewTimeZone?: string;
  customTasks?: Array<{ id: string; title: string; date: string; time?: string; completed: boolean }>;
  contacts?: CrmContact[];
  interviewRounds?: InterviewRound[];
  checklistCompleted?: string[];
};

type TodayReminder = {
  id: string;
  label: string;
  title: string;
  detail: string;
  application: CrmApplication;
  taskId?: string;
};

const checklistByStage: Record<string, Array<{ id: string; label: string }>> = {
  Saved: [
    { id: "saved-review", label: "Review the job details" },
    { id: "saved-master", label: "Choose the right Master CV" },
    { id: "saved-cv", label: "Tailor the CV" },
    { id: "saved-cover", label: "Prepare the cover letter" },
  ],
  Applied: [
    { id: "applied-documents", label: "Confirm the submitted documents" },
    { id: "applied-contact", label: "Identify a recruiter or hiring contact" },
    { id: "applied-followup", label: "Set a follow-up reminder" },
  ],
  "No response after application": [
    { id: "waiting-followup", label: "Send a polite application follow-up" },
    { id: "waiting-contact", label: "Check for a recruiter or referral contact" },
    { id: "waiting-update", label: "Update the stage when you receive a response" },
  ],
  "Phone screen": [
    { id: "phone-brief", label: "Review the phone-screen brief" },
    { id: "phone-research", label: "Research the company and role" },
    { id: "phone-questions", label: "Prepare questions for the recruiter" },
    { id: "phone-thanks", label: "Send a thank-you message afterwards" },
  ],
  Interview: [
    { id: "interview-confirm", label: "Confirm the meeting details" },
    { id: "interview-prep", label: "Review interview preparation" },
    { id: "interview-star", label: "Practice relevant STAR examples" },
    { id: "interview-questions", label: "Prepare questions to ask" },
    { id: "interview-thanks", label: "Send a thank-you message afterwards" },
  ],
  "No response after interview": [
    { id: "post-interview-followup", label: "Send an interview follow-up" },
    { id: "post-interview-notes", label: "Record what you learned from the interview" },
    { id: "post-interview-reminder", label: "Set a date for one final follow-up" },
  ],
  Assessment: [
    { id: "assessment-deadline", label: "Confirm the deadline and instructions" },
    { id: "assessment-prepare", label: "Prepare the required materials" },
    { id: "assessment-submit", label: "Submit and record completion" },
  ],
  Offer: [
    { id: "offer-review", label: "Review the full offer" },
    { id: "offer-compare", label: "Compare salary and benefits" },
    { id: "offer-deadline", label: "Record the decision deadline" },
    { id: "offer-response", label: "Prepare your response" },
  ],
  Rejected: [
    { id: "rejected-feedback", label: "Record any feedback received" },
    { id: "rejected-learning", label: "Capture lessons for future applications" },
    { id: "rejected-close", label: "Close outstanding reminders" },
  ],
};

export function checklistFor(application: CrmApplication) {
  return checklistByStage[application.stage] ?? checklistByStage.Saved;
}

function roundTimestamp(round: InterviewRound) {
  return `${round.date}T${round.time || "23:59"}`;
}

function futureRounds(application: CrmApplication) {
  const today = new Date().toISOString().slice(0, 10);
  const rounds = application.interviewRounds?.length
    ? application.interviewRounds
    : application.interviewDate
      ? [{
          id: `legacy-${application.id}`,
          type: "Interview",
          date: application.interviewDate,
          time: application.interviewTime,
          timeZone: application.interviewTimeZone || "Local time",
        }]
      : [];
  return rounds.filter((round) => round.date >= today).sort((a, b) => roundTimestamp(a).localeCompare(roundTimestamp(b)));
}

function formatDate(date: string, time?: string) {
  const parsed = new Date(`${date}T${time || "12:00"}:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(time ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

export function TodayDashboard({
  applications,
  reminders,
  openApplication,
  completeTask,
}: {
  applications: CrmApplication[];
  reminders: TodayReminder[];
  openApplication: (application: CrmApplication) => void;
  completeTask: (applicationId: number, taskId: string) => void;
}) {
  const activeApplications = applications.filter((application) => !["Offer", "Rejected"].includes(application.stage));
  const urgent = reminders.filter((item) => ["Overdue", "Today", "Follow-up"].includes(item.label));
  const upcomingRounds = applications.flatMap((application) => futureRounds(application).map((round) => ({ application, round }))).sort((a, b) => roundTimestamp(a.round).localeCompare(roundTimestamp(b.round))).slice(0, 5);
  const recommended = activeApplications.map((application) => {
    const completed = new Set(application.checklistCompleted ?? []);
    const next = checklistFor(application).find((item) => !completed.has(item.id));
    return next ? { application, next } : null;
  }).filter((item): item is NonNullable<typeof item> => Boolean(item)).slice(0, 6);

  return <div className="today-dashboard">
    <section className="card today-hero">
      <div><p className="eyebrow">YOUR DAILY COMMAND CENTRE</p><h2>Know what needs attention today</h2><p>Follow-ups, interview rounds and the next practical step for every active application.</p></div>
      <div className="today-hero-count"><strong>{urgent.length}</strong><span>due or waiting</span></div>
    </section>
    <div className="today-grid">
      <section className="card today-list">
        <div className="today-section-head"><div><p className="eyebrow">DO NEXT</p><h2>Priority actions</h2></div></div>
        {urgent.length ? urgent.slice(0, 7).map((item) => <article key={item.id}>
          <button className="today-open" type="button" onClick={() => openApplication(item.application)}><span className={`today-status ${item.label.toLowerCase().replace(/\s+/g, "-")}`}>{item.label}</span><strong>{item.title}</strong><small>{item.detail}</small></button>
          {item.taskId && <button className="today-complete" type="button" onClick={() => completeTask(item.application.id, item.taskId!)}>Complete</button>}
        </article>) : <div className="today-empty"><strong>You’re caught up</strong><p>No overdue reminders or follow-ups need attention today.</p></div>}
      </section>
      <section className="card today-list">
        <div className="today-section-head"><div><p className="eyebrow">INTERVIEWS</p><h2>Upcoming rounds</h2></div></div>
        {upcomingRounds.length ? upcomingRounds.map(({ application, round }) => <button className="today-round" type="button" key={`${application.id}-${round.id}`} onClick={() => openApplication(application)}><span><b>{round.type}</b><small>{application.role} · {application.company}</small></span><strong>{formatDate(round.date, round.time)}<small>{round.timeZone}</small></strong></button>) : <div className="today-empty"><strong>No interview rounds scheduled</strong><p>Add each round to its application when an employer confirms it.</p></div>}
      </section>
    </div>
    <section className="card today-recommended">
      <div className="today-section-head"><div><p className="eyebrow">STAGE GUIDANCE</p><h2>Recommended next steps</h2><p>These suggestions change as each application moves through the pipeline.</p></div></div>
      <div>{recommended.length ? recommended.map(({ application, next }) => <button type="button" key={`${application.id}-${next.id}`} onClick={() => openApplication(application)}><span><strong>{next.label}</strong><small>{application.role} · {application.company}</small></span><b>Open →</b></button>) : <p className="today-empty">Complete actions appear here as applications progress.</p>}</div>
    </section>
  </div>;
}

const messageTemplates: Record<string, Array<{ title: string; subject: string; body: (application: CrmApplication, contact?: CrmContact) => string }>> = {
  applied: [
    { title: "Application follow-up", subject: "Following up on my application", body: (app, contact) => `Hi ${contact?.name || "there"},\n\nI’m following up on my application for the ${app.role} position at ${app.company}. I remain very interested in the opportunity and would be happy to provide any additional information.\n\nThank you for your time.\n\nBest regards,` },
  ],
  interview: [
    { title: "Interview confirmation", subject: "Interview confirmation", body: (app, contact) => `Hi ${contact?.name || "there"},\n\nThank you for arranging the interview for the ${app.role} position at ${app.company}. I’m writing to confirm that I will attend at the scheduled time. I look forward to speaking with you.\n\nBest regards,` },
    { title: "Interview thank-you", subject: "Thank you for the interview", body: (app, contact) => `Hi ${contact?.name || "there"},\n\nThank you for speaking with me about the ${app.role} position at ${app.company}. I appreciated learning more about the role and team, and I remain very interested in the opportunity.\n\nPlease let me know if I can provide anything further.\n\nBest regards,` },
  ],
  waiting: [
    { title: "Request an update", subject: "Checking in on the hiring process", body: (app, contact) => `Hi ${contact?.name || "there"},\n\nI hope you’re well. I wanted to check whether there are any updates regarding the ${app.role} position at ${app.company}. I remain interested and would be pleased to provide any further information.\n\nBest regards,` },
  ],
  closed: [
    { title: "Withdraw application", subject: "Withdrawal of my application", body: (app, contact) => `Hi ${contact?.name || "there"},\n\nThank you for considering me for the ${app.role} position at ${app.company}. I’m writing to withdraw my application at this time. I appreciate your time and consideration.\n\nBest regards,` },
  ],
};

function templatesFor(stage: string) {
  if (["Phone screen", "Interview", "Assessment"].includes(stage)) return messageTemplates.interview;
  if (["No response after application", "No response after interview"].includes(stage)) return messageTemplates.waiting;
  if (["Offer", "Rejected"].includes(stage)) return messageTemplates.closed;
  return messageTemplates.applied;
}

export function ApplicationCRMStudio({
  application,
  timeZone,
  updateApplication,
  notify,
}: {
  application: CrmApplication;
  timeZone: string;
  updateApplication: (application: CrmApplication, message: string) => void;
  notify: (message: string) => void;
}) {
  const [contactDraft, setContactDraft] = useState({ name: "", role: "Recruiter", email: "", phone: "", linkedin: "", notes: "" });
  const [roundDraft, setRoundDraft] = useState({ type: "Hiring manager interview", date: "", time: "", format: "Video", interviewers: "", notes: "" });
  const [showContactForm, setShowContactForm] = useState(false);
  const [showRoundForm, setShowRoundForm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const contacts = application.contacts ?? [];
  const rounds = application.interviewRounds?.length ? application.interviewRounds : application.interviewDate ? [{ id: `legacy-${application.id}`, type: "Interview", date: application.interviewDate, time: application.interviewTime, timeZone: application.interviewTimeZone || timeZone }] : [];
  const completed = new Set(application.checklistCompleted ?? []);
  const checklist = checklistFor(application);
  const stageCompleted = checklist.filter((item) => completed.has(item.id)).length;
  const primaryContact = contacts[0];
  const templates = useMemo(() => templatesFor(application.stage), [application.stage]);

  function saveContacts(next: CrmContact[], message: string) {
    updateApplication({ ...application, contacts: next }, message);
  }

  function addContact() {
    if (!contactDraft.name.trim()) { notify("Add the contact’s name first."); return; }
    const contact: CrmContact = { id: `contact-${Date.now()}`, name: contactDraft.name.trim(), role: contactDraft.role.trim() || "Hiring contact", email: contactDraft.email.trim() || undefined, phone: contactDraft.phone.trim() || undefined, linkedin: contactDraft.linkedin.trim() || undefined, notes: contactDraft.notes.trim() || undefined };
    saveContacts([...contacts, contact], "Contact added to this application");
    setContactDraft({ name: "", role: "Recruiter", email: "", phone: "", linkedin: "", notes: "" });
    setShowContactForm(false);
  }

  function markContacted(contact: CrmContact) {
    saveContacts(contacts.map((item) => item.id === contact.id ? { ...item, lastContactedAt: new Date().toISOString() } : item), `Contact with ${contact.name} recorded`);
  }

  function addRound() {
    if (!roundDraft.type.trim() || !roundDraft.date) { notify("Add the interview type and date first."); return; }
    const round: InterviewRound = { id: `round-${Date.now()}`, type: roundDraft.type.trim(), date: roundDraft.date, time: roundDraft.time || undefined, timeZone, format: roundDraft.format || undefined, interviewers: roundDraft.interviewers.trim() || undefined, notes: roundDraft.notes.trim() || undefined };
    const nextRounds = [...rounds, round].sort((a, b) => roundTimestamp(a).localeCompare(roundTimestamp(b)));
    const nextUpcoming = nextRounds.find((item) => item.date >= new Date().toISOString().slice(0, 10)) ?? nextRounds.at(-1);
    updateApplication({ ...application, interviewRounds: nextRounds, interviewDate: nextUpcoming?.date || application.interviewDate, interviewTime: nextUpcoming?.time || application.interviewTime, interviewTimeZone: nextUpcoming?.timeZone || application.interviewTimeZone }, "Interview round added");
    setRoundDraft({ type: "Hiring manager interview", date: "", time: "", format: "Video", interviewers: "", notes: "" });
    setShowRoundForm(false);
  }

  function updateRound(id: string, changes: Partial<InterviewRound>) {
    const nextRounds = rounds.map((round) => round.id === id ? { ...round, ...changes } : round);
    const nextUpcoming = [...nextRounds].sort((a, b) => roundTimestamp(a).localeCompare(roundTimestamp(b))).find((item) => item.date >= new Date().toISOString().slice(0, 10));
    updateApplication({ ...application, interviewRounds: nextRounds, ...(nextUpcoming ? { interviewDate: nextUpcoming.date, interviewTime: nextUpcoming.time, interviewTimeZone: nextUpcoming.timeZone } : {}) }, "Interview round updated");
  }

  function removeRound(id: string) {
    const nextRounds = rounds.filter((round) => round.id !== id);
    const nextUpcoming = [...nextRounds].sort((a, b) => roundTimestamp(a).localeCompare(roundTimestamp(b))).find((item) => item.date >= new Date().toISOString().slice(0, 10)) ?? nextRounds.at(-1);
    updateApplication({ ...application, interviewRounds: nextRounds, interviewDate: nextUpcoming?.date, interviewTime: nextUpcoming?.time, interviewTimeZone: nextUpcoming?.timeZone }, "Interview round removed");
  }

  function toggleChecklist(id: string) {
    const next = completed.has(id) ? (application.checklistCompleted ?? []).filter((item) => item !== id) : [...(application.checklistCompleted ?? []), id];
    updateApplication({ ...application, checklistCompleted: next }, completed.has(id) ? "Checklist item reopened" : "Checklist item completed");
  }

  async function copyTemplate(subject: string, body: string) {
    try { await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`); notify("Message template copied"); }
    catch { notify("Copy was blocked. Select and copy the message manually."); }
  }

  return <div className="application-crm">
    <section className="card crm-checklist">
      <div className="crm-head"><div><p className="eyebrow">NEXT ACTIONS</p><h2>{application.stage} checklist</h2><p>Keep the important steps for this stage together.</p></div><strong>{stageCompleted}/{checklist.length}</strong></div>
      <div className="crm-progress"><i style={{ width: `${checklist.length ? Math.min(100, stageCompleted / checklist.length * 100) : 0}%` }} /></div>
      <div className="crm-checklist-items">{checklist.map((item) => <label key={item.id} className={completed.has(item.id) ? "completed" : ""}><input type="checkbox" checked={completed.has(item.id)} onChange={() => toggleChecklist(item.id)} /><span>{item.label}</span></label>)}</div>
    </section>

    <section className="card crm-rounds">
      <div className="crm-head"><div><p className="eyebrow">INTERVIEW JOURNEY</p><h2>Interview rounds</h2><p>Record every conversation separately, including its people, format, notes and outcome.</p></div><span className="crm-head-actions"><b>{rounds.length} {rounds.length===1?"round":"rounds"}</b><button type="button" onClick={()=>setShowRoundForm(value=>!value)}>{showRoundForm?"Cancel":"＋ Add round"}</button></span></div>
      {rounds.length > 0 && <div className="round-list">{rounds.map((round, index) => <article key={round.id}>
        <div className="round-number">{index + 1}</div><div className="round-fields">
          <label>Round type<input value={round.type} onChange={(event) => updateRound(round.id, { type: event.target.value })} /></label>
          <label>Date<input type="date" value={round.date} onChange={(event) => updateRound(round.id, { date: event.target.value })} /></label>
          <label>Time <small>{round.timeZone}</small><input type="time" value={round.time || ""} onChange={(event) => updateRound(round.id, { time: event.target.value || undefined })} /></label>
          <label>Format<select value={round.format || ""} onChange={(event) => updateRound(round.id, { format: event.target.value })}><option value="">Not specified</option><option>Phone</option><option>Video</option><option>Onsite</option></select></label>
          <label className="wide">Interviewers<input value={round.interviewers || ""} onChange={(event) => updateRound(round.id, { interviewers: event.target.value })} placeholder="Names and roles" /></label>
          <label className="wide">Round notes<textarea rows={3} value={round.notes || ""} onChange={(event) => updateRound(round.id, { notes: event.target.value })} placeholder="Questions, impressions, feedback and follow-up points…" /></label>
          <label className="wide">Outcome<input value={round.outcome || ""} onChange={(event) => updateRound(round.id, { outcome: event.target.value })} placeholder="e.g. Advanced to technical interview" /></label>
        </div><button className="crm-remove" type="button" onClick={() => removeRound(round.id)}>Remove</button>
      </article>)}</div>}
      {showRoundForm&&<div className="crm-add-grid">
        <label>Round type<select value={roundDraft.type} onChange={(event) => setRoundDraft({ ...roundDraft, type: event.target.value })}><option>Recruiter screening</option><option>Hiring manager interview</option><option>Technical interview</option><option>Panel interview</option><option>Final interview</option><option>Other interview</option></select></label>
        <label>Date<input type="date" value={roundDraft.date} onChange={(event) => setRoundDraft({ ...roundDraft, date: event.target.value })} /></label>
        <label>Time <small>{timeZone}</small><input type="time" value={roundDraft.time} onChange={(event) => setRoundDraft({ ...roundDraft, time: event.target.value })} /></label>
        <label>Format<select value={roundDraft.format} onChange={(event) => setRoundDraft({ ...roundDraft, format: event.target.value })}><option>Phone</option><option>Video</option><option>Onsite</option></select></label>
        <label className="wide">Interviewers<input value={roundDraft.interviewers} onChange={(event) => setRoundDraft({ ...roundDraft, interviewers: event.target.value })} placeholder="Names and roles, if known" /></label>
        <label className="wide">Preparation notes<textarea rows={3} value={roundDraft.notes} onChange={(event) => setRoundDraft({ ...roundDraft, notes: event.target.value })} placeholder="What you want to prepare or remember…" /></label>
        <button type="button" className="crm-add" onClick={addRound}>＋ Add interview round</button>
      </div>}
    </section>

    <div className="crm-two-column">
      <section className="card crm-contacts">
        <div className="crm-head"><div><p className="eyebrow">PEOPLE</p><h2>Contacts</h2><p>Keep recruiters, interviewers and referrals attached to this role.</p></div><span className="crm-head-actions"><b>{contacts.length} {contacts.length===1?"contact":"contacts"}</b><button type="button" onClick={()=>setShowContactForm(value=>!value)}>{showContactForm?"Cancel":"＋ Add contact"}</button></span></div>
        {contacts.length > 0 && <div className="contact-list">{contacts.map((contact) => <article key={contact.id}><div><strong>{contact.name}</strong><span>{contact.role}</span>{contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}{contact.phone && <a href={`tel:${contact.phone}`}>{contact.phone}</a>}{contact.linkedin && <a href={contact.linkedin} target="_blank" rel="noreferrer">LinkedIn profile ↗</a>}{contact.notes && <small>{contact.notes}</small>}{contact.lastContactedAt && <em>Last contacted {new Date(contact.lastContactedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</em>}</div><div><button type="button" onClick={() => markContacted(contact)}>Log contact</button><button className="crm-remove" type="button" onClick={() => saveContacts(contacts.filter((item) => item.id !== contact.id), "Contact removed")}>Remove</button></div></article>)}</div>}
        {showContactForm&&<div className="crm-contact-form">
          <label>Name<input value={contactDraft.name} onChange={(event) => setContactDraft({ ...contactDraft, name: event.target.value })} placeholder="e.g. Jamie Chen" /></label>
          <label>Role<input value={contactDraft.role} onChange={(event) => setContactDraft({ ...contactDraft, role: event.target.value })} placeholder="Recruiter" /></label>
          <label>Email<input type="email" value={contactDraft.email} onChange={(event) => setContactDraft({ ...contactDraft, email: event.target.value })} /></label>
          <label>Phone<input type="tel" value={contactDraft.phone} onChange={(event) => setContactDraft({ ...contactDraft, phone: event.target.value })} /></label>
          <label className="wide">LinkedIn URL<input type="url" value={contactDraft.linkedin} onChange={(event) => setContactDraft({ ...contactDraft, linkedin: event.target.value })} placeholder="https://linkedin.com/in/…" /></label>
          <label className="wide">Notes<textarea rows={2} value={contactDraft.notes} onChange={(event) => setContactDraft({ ...contactDraft, notes: event.target.value })} /></label>
          <button type="button" className="crm-add" onClick={addContact}>＋ Add contact</button>
        </div>}
      </section>

      <section className="card crm-templates">
        <div className="crm-head"><div><p className="eyebrow">COMMUNICATION</p><h2>Message templates</h2><p>Copy a stage-appropriate starting point, personalize it and send it from your email.</p></div></div>
        {templates.length>1&&<label className="crm-template-picker">Choose a message<select value={Math.min(selectedTemplate,templates.length-1)} onChange={event=>setSelectedTemplate(Number(event.target.value))}>{templates.map((template,index)=><option key={template.title} value={index}>{template.title}</option>)}</select></label>}
        {templates.slice(Math.min(selectedTemplate,templates.length-1),Math.min(selectedTemplate,templates.length-1)+1).map((template) => { const body = template.body(application, primaryContact); return <article key={template.title}><div><strong>{template.title}</strong><span>Subject: {template.subject}</span></div><pre>{body}</pre><button type="button" onClick={() => copyTemplate(template.subject, body)}>Copy message</button></article>; })}
        <p className="crm-template-note">AppliTrail does not send messages automatically. Review and personalize every template before using it.</p>
      </section>
    </div>
  </div>;
}
