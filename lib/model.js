// Shared data model: default statuses/settings, a migration that upgrades
// older stored data in place, and the follow-up ("overdue") rule. Imported by
// both the popup and the background badge so they never drift apart.

export const TAG_COLORS = {
  gray: "#6b7280",
  red: "#dc2626",
  amber: "#c98a12",
  green: "#16a34a",
  blue: "#2563eb",
  teal: "#0e8f9e",
  purple: "#7c3aed",
  pink: "#db2777",
};

// name, colour tag, and whether the status means "waiting on the candidate"
// (feeds the follow-up reminder badge).
export const DEFAULT_STATUSES = [
  { name: "To Contact", color: "gray", awaiting: false },
  { name: "Contacted", color: "amber", awaiting: true },
  { name: "Replied", color: "green", awaiting: false },
  { name: "Shortlisted", color: "blue", awaiting: false },
  { name: "Interviewing", color: "purple", awaiting: false },
  { name: "Offer Made", color: "teal", awaiting: false },
  { name: "Hired", color: "green", awaiting: false },
  { name: "Not Interested", color: "red", awaiting: false },
  { name: "Ignored", color: "gray", awaiting: false },
  { name: "Withdrawn", color: "red", awaiting: false },
];

export const DEFAULT_CHANNELS = [
  "InMail",
  "Connection note",
  "Email",
  "Phone",
  "Message",
  "Other",
];

export function defaultSettings() {
  return {
    statuses: DEFAULT_STATUSES.map((s) => ({ ...s })),
    snippets: [],
    channels: [...DEFAULT_CHANNELS],
    reminderDays: 5,
  };
}

const DAY = 86400000;

// Bring any stored db up to the current shape without losing data.
export function normalizeDb(raw) {
  const db = {
    jobs: Array.isArray(raw?.jobs) ? raw.jobs : [],
    contacts: Array.isArray(raw?.contacts) ? raw.contacts : [],
    settings: raw?.settings && typeof raw.settings === "object" ? raw.settings : {},
    ui: raw?.ui && typeof raw.ui === "object" ? raw.ui : {},
  };
  const defs = defaultSettings();
  const s = db.settings;
  if (!Array.isArray(s.statuses) || !s.statuses.length) s.statuses = defs.statuses;
  else s.statuses = s.statuses.map(normStatus);
  if (!Array.isArray(s.snippets)) s.snippets = [];
  if (!Array.isArray(s.channels) || !s.channels.length) s.channels = defs.channels;
  if (typeof s.reminderDays !== "number" || s.reminderDays < 0) s.reminderDays = 5;
  for (const c of db.contacts) {
    if (!Array.isArray(c.history)) c.history = c.status ? [{ status: c.status, at: c.updatedAt || c.createdAt || Date.now() }] : [];
    if (!Array.isArray(c.touches)) c.touches = [];
  }
  return db;
}

function normStatus(s) {
  if (typeof s === "string") return { name: s, color: "gray", awaiting: false };
  return {
    name: String(s.name || "").trim(),
    color: s.color in TAG_COLORS ? s.color : "gray",
    awaiting: !!s.awaiting,
  };
}

export function statusMeta(settings, name) {
  return (
    settings.statuses.find((s) => s.name === name) || {
      name,
      color: "gray",
      awaiting: false,
    }
  );
}

export function statusHex(settings, name) {
  return TAG_COLORS[statusMeta(settings, name).color] || TAG_COLORS.gray;
}

// A contact is overdue when its status means "waiting on the candidate" and
// nothing has changed on it for longer than the reminder window.
export function isOverdue(contact, settings, now = Date.now()) {
  const meta = statusMeta(settings, contact.status);
  if (!meta.awaiting) return false;
  const last = contact.updatedAt || contact.createdAt || 0;
  return now - last >= (settings.reminderDays || 0) * DAY;
}

export function countOverdue(db, now = Date.now()) {
  const s = db.settings || defaultSettings();
  return db.contacts.filter((c) => isOverdue(c, s, now)).length;
}
