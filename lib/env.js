// Returns the WebExtension API root. Firefox exposes `browser`; the future
// Chrome port picks up `chrome`. When neither exists (opening popup.html
// directly in a normal tab during development) a small in-page shim backed by
// localStorage is returned so the UI can be exercised with sample data.

export function getApi() {
  if (globalThis.browser?.storage) return globalThis.browser;
  if (globalThis.chrome?.storage) return globalThis.chrome;
  return makeDevShim();
}

function makeDevShim() {
  const KEY = "talent-ledger-dev";
  const read = () => JSON.parse(localStorage.getItem(KEY) || "{}");
  if (!localStorage.getItem(KEY)) {
    localStorage.setItem(KEY, JSON.stringify(demoDb()));
  }

  // People a bulk "Pull" would surface on a search results page.
  const searchSamples = [
    { name: "Elena Vasquez", headline: "Threat Intelligence Analyst", location: "London, UK", company: "", url: "https://www.linkedin.com/in/sample-elena-vasquez" },
    { name: "Marcus Chen", headline: "Detection Engineer | Sigma, KQL", location: "Bristol, UK", company: "", url: "https://www.linkedin.com/in/sample-marcus-chen" },
    { name: "Priya Natarajan", headline: "Security Engineer, Detection and Response", location: "Leeds, UK", company: "", url: "https://www.linkedin.com/in/sample-priya-natarajan" },
    { name: "Yusuf Ahmed", headline: "SOC Team Lead | GCIA", location: "Manchester, UK", company: "", url: "https://www.linkedin.com/in/sample-yusuf-ahmed" },
    { name: "Hannah Wright", headline: "Cyber Threat Hunter", location: "Remote, UK", company: "", url: "https://www.linkedin.com/in/sample-hannah-wright" },
  ];
  const profileSamples = [
    { url: "https://www.linkedin.com/in/sample-jordan-mercer", name: "Jordan Mercer", headline: "Senior SOC Analyst | SIEM, Threat Hunting, MITRE ATT&CK", company: "Northgate Cyber", location: "Manchester, England, United Kingdom" },
    { url: "https://www.linkedin.com/in/sample-tom-okafor", name: "Tom Okafor", headline: "Incident Responder | GCIH | Blue Team", company: "Harborline Ltd", location: "Remote, United Kingdom" },
  ];
  let profileIdx = 0;

  return {
    isDevShim: true,
    storage: {
      local: {
        async get(defaults) {
          const data = read();
          const out = {};
          for (const [k, dflt] of Object.entries(defaults)) {
            out[k] = k in data ? data[k] : dflt;
          }
          return out;
        },
        async set(obj) {
          localStorage.setItem(KEY, JSON.stringify({ ...read(), ...obj }));
        },
      },
      onChanged: { addListener() {} },
    },
    permissions: {
      async request() {
        return true;
      },
      async contains() {
        return true;
      },
    },
    tabs: {
      async query() {
        return [
          {
            id: 1,
            active: true,
            lastAccessed: Date.now(),
            url: "https://www.linkedin.com/in/sample-jordan-mercer",
          },
        ];
      },
    },
    scripting: {
      async executeScript({ func }) {
        if (func && func.name === "scrapeSearchResults") {
          return [{ result: searchSamples }];
        }
        return [{ result: profileSamples[profileIdx++ % profileSamples.length] }];
      },
    },
    downloads: {
      async download({ url, filename }) {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
      },
    },
    windows: {
      async create({ url }) {
        window.open(url, "_blank", "popup,width=900,height=680");
      },
    },
    runtime: {
      getURL: (p) => p,
    },
  };
}

// A populated demo dataset so every view (list, board, analytics, follow-up
// badge, cross-job flag) has something to show when previewing outside Firefox.
function demoDb() {
  const DAY = 86400000;
  const now = Date.now();
  const ago = (d) => now - d * DAY;
  const jobA = "demo-job-soc";
  const jobB = "demo-job-det";
  const priyaUrl = "https://www.linkedin.com/in/sample-priya-natarajan";
  const mk = (o) => ({ notes: "", touches: [], history: [{ status: o.status, at: o.updatedAt }], ...o });

  const contacts = [
    mk({ id: "c1", jobId: jobA, name: "Jordan Mercer", headline: "Senior SOC Analyst | SIEM, Threat Hunting", company: "Northgate Cyber", location: "Manchester, UK", profileUrl: "https://www.linkedin.com/in/sample-jordan-mercer", status: "Contacted", createdAt: ago(9), updatedAt: ago(9), touches: [{ id: "t1", at: ago(9), channel: "InMail", template: "First touch", note: "" }] }),
    mk({ id: "c2", jobId: jobA, name: "Priya Natarajan", headline: "Security Engineer, Detection and Response", company: "Fenwick Labs", location: "Leeds, UK", profileUrl: priyaUrl, status: "Replied", createdAt: ago(7), updatedAt: ago(2), history: [{ status: "To Contact", at: ago(7) }, { status: "Contacted", at: ago(5) }, { status: "Replied", at: ago(2) }] }),
    mk({ id: "c3", jobId: jobA, name: "Tom Okafor", headline: "Incident Responder | GCIH", company: "Harborline Ltd", location: "Remote, UK", profileUrl: "https://www.linkedin.com/in/sample-tom-okafor", status: "Contacted", createdAt: ago(1), updatedAt: ago(1) }),
    mk({ id: "c4", jobId: jobA, name: "Aisha Bello", headline: "Threat Detection Lead", company: "Cirrus Security", location: "London, UK", profileUrl: "https://www.linkedin.com/in/sample-aisha-bello", status: "Interviewing", createdAt: ago(12), updatedAt: ago(4), history: [{ status: "To Contact", at: ago(12) }, { status: "Contacted", at: ago(9) }, { status: "Interviewing", at: ago(4) }] }),
    mk({ id: "c5", jobId: jobA, name: "Sam Whitfield", headline: "SOC Analyst II", company: "Blythe Group", location: "Birmingham, UK", profileUrl: "https://www.linkedin.com/in/sample-sam-whitfield", status: "Shortlisted", createdAt: ago(6), updatedAt: ago(3), history: [{ status: "Contacted", at: ago(6) }, { status: "Shortlisted", at: ago(3) }] }),
    mk({ id: "c6", jobId: jobA, name: "Leon Park", headline: "Junior Security Analyst", company: "Vantage IT", location: "Glasgow, UK", profileUrl: "https://www.linkedin.com/in/sample-leon-park", status: "To Contact", createdAt: ago(0), updatedAt: ago(0) }),
    mk({ id: "c7", jobId: jobA, name: "Nadia Rossi", headline: "Cyber Analyst", company: "Meridian", location: "Edinburgh, UK", profileUrl: "https://www.linkedin.com/in/sample-nadia-rossi", status: "Not Interested", createdAt: ago(11), updatedAt: ago(6), history: [{ status: "Contacted", at: ago(11) }, { status: "Not Interested", at: ago(6) }] }),
    mk({ id: "c8", jobId: jobA, name: "Grace Miller", headline: "Detection & Response Engineer", company: "Orbit Labs", location: "Remote, UK", profileUrl: "https://www.linkedin.com/in/sample-grace-miller", status: "Contacted", createdAt: ago(3), updatedAt: ago(3) }),
    mk({ id: "c9", jobId: jobB, name: "Priya Natarajan", headline: "Security Engineer, Detection and Response", company: "Fenwick Labs", location: "Leeds, UK", profileUrl: priyaUrl, status: "Contacted", createdAt: ago(8), updatedAt: ago(8) }),
    mk({ id: "c10", jobId: jobB, name: "Marco Reyes", headline: "Detection Engineer | Sigma", company: "Halcyon", location: "Remote, UK", profileUrl: "https://www.linkedin.com/in/sample-marco-reyes", status: "Offer Made", createdAt: ago(13), updatedAt: ago(1) }),
    mk({ id: "c11", jobId: jobB, name: "Fiona Clarke", headline: "SIEM Content Developer", company: "Redshift", location: "Cardiff, UK", profileUrl: "https://www.linkedin.com/in/sample-fiona-clarke", status: "Hired", createdAt: ago(20), updatedAt: ago(2) }),
  ];

  return {
    jobs: [
      { id: jobA, title: "Senior SOC Analyst", createdAt: ago(14) },
      { id: jobB, title: "Detection Engineer", createdAt: ago(21) },
    ],
    contacts,
    settings: {
      statuses: [
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
      ],
      snippets: [
        { id: "s1", title: "First touch", body: "Hi {firstName}, your work at {company} caught my eye. I'm hiring for a {jobTitle} role and think it could be a strong fit. Open to a quick chat?" },
        { id: "s2", title: "Follow-up", body: "Hi {firstName}, just following up on my note about the {jobTitle} position. Still keen to connect when you have a moment." },
      ],
      channels: ["InMail", "Connection note", "Email", "Phone", "Message", "Other"],
      reminderDays: 5,
    },
    ui: { currentJobId: jobA, view: "list" },
  };
}
