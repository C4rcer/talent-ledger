import { getApi } from "./lib/env.js";
import { buildXlsx, XLSX_MIME } from "./lib/xlsx.js";
import { parseCsv, toCsvBytes, splitName, ATS_TEMPLATES } from "./lib/csv.js";
import { encodePlain, encodeEncrypted, decodeBackup } from "./lib/backup.js";
import {
  normalizeDb,
  statusHex,
  statusMeta,
  isOverdue,
  TAG_COLORS,
} from "./lib/model.js";

const B = getApi();

const LI_ORIGINS = { origins: ["*://*.linkedin.com/*"] };
const CONTACT_HEADER = [
  "Name",
  "Headline",
  "Company",
  "Location",
  "Profile URL",
  "Status",
  "Notes",
  "Added",
  "Updated",
];

const $ = (sel) => document.querySelector(sel);

let db = { jobs: [], contacts: [], settings: {}, ui: {} };
let editingJobId = null;
let dueOnly = false;
let pendingFile = null; // { mode: "csv" | "restore-plain" | "restore-enc" }

init();

async function init() {
  if (new URLSearchParams(location.search).get("mode") === "window") {
    document.body.classList.add("window");
    $("#btnPopout").hidden = true;
  }
  wireEvents();
  await loadDb();
  renderAll();
  B.storage.onChanged?.addListener((changes, area) => {
    if (area === "local" && !document.hasFocus()) loadDb().then(renderAll);
  });
}

// ---------- storage ----------

async function loadDb() {
  const got = await B.storage.local.get({ jobs: [], contacts: [], settings: {}, ui: {} });
  db = normalizeDb(got);
  if (!db.jobs.some((j) => j.id === db.ui.currentJobId)) {
    db.ui.currentJobId = db.jobs[0]?.id ?? null;
  }
  if (!["list", "board", "analytics"].includes(db.ui.view)) db.ui.view = "list";
}

async function persist() {
  await B.storage.local.set({
    jobs: db.jobs,
    contacts: db.contacts,
    settings: db.settings,
    ui: db.ui,
  });
}

const uid = () => crypto.randomUUID();
const currentJob = () => db.jobs.find((j) => j.id === db.ui.currentJobId) ?? null;
const contactsOf = (jobId) => db.contacts.filter((c) => c.jobId === jobId);
const statusNames = () => db.settings.statuses.map((s) => s.name);
const hexOf = (name) => statusHex(db.settings, name);

// ---------- events ----------

function wireEvents() {
  $("#btnPopout").addEventListener("click", async () => {
    await B.windows.create({
      url: B.runtime.getURL("popup.html") + "?mode=window",
      type: "popup",
      width: 900,
      height: 680,
    });
    window.close();
  });

  $("#btnSettings").addEventListener("click", openSettings);
  $("#btnCloseSettings").addEventListener("click", () =>
    $("#settingsPanel").classList.add("hidden")
  );

  for (const tab of document.querySelectorAll("#viewTabs .tab")) {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  }
  $("#dueIndicator").addEventListener("click", () => {
    dueOnly = !dueOnly;
    if (db.ui.view !== "list") setView("list");
    else {
      renderContacts();
      renderDue();
    }
  });

  $("#jobSelect").addEventListener("change", async (e) => {
    db.ui.currentJobId = e.target.value || null;
    dueOnly = false;
    await persist();
    renderView();
    renderFooter();
    renderDue();
  });

  $("#btnNewJob").addEventListener("click", () => openJobForm(null));
  $("#btnEditJob").addEventListener("click", () => {
    if (currentJob()) openJobForm(currentJob());
  });
  $("#btnCancelJob").addEventListener("click", closeJobForm);
  $("#jobForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $("#jobTitle").value.trim();
    if (!title) return;
    if (editingJobId) {
      const job = db.jobs.find((j) => j.id === editingJobId);
      if (job) job.title = title;
    } else {
      const job = { id: uid(), title, createdAt: Date.now() };
      db.jobs.push(job);
      db.ui.currentJobId = job.id;
    }
    await persist();
    closeJobForm();
    renderAll();
  });

  armedClick($("#btnDeleteJob"), "Sure?", async () => {
    const job = currentJob();
    if (!job) return;
    db.contacts = db.contacts.filter((c) => c.jobId !== job.id);
    db.jobs = db.jobs.filter((j) => j.id !== job.id);
    db.ui.currentJobId = db.jobs[0]?.id ?? null;
    await persist();
    renderAll();
    toast(`Deleted job "${job.title}"`);
  });

  $("#btnPull").addEventListener("click", pullFromPage);
  $("#btnBulk").addEventListener("click", bulkFromPage);
  $("#btnManual").addEventListener("click", () => openCapture({}));
  $("#btnCancelCapture").addEventListener("click", closeCapture);
  $("#cUrl").addEventListener("input", () => {
    delete $("#captureForm").dataset.override;
    $("#captureMsg").classList.add("hidden");
  });
  $("#captureForm").addEventListener("submit", onSaveContact);

  $("#btnCancelBulk").addEventListener("click", () =>
    $("#bulkForm").classList.add("hidden")
  );
  $("#bulkSelectAll").addEventListener("click", () => setBulkChecks(true));
  $("#bulkSelectNone").addEventListener("click", () => setBulkChecks(false));
  $("#bulkForm").addEventListener("submit", onSaveBulk);

  $("#searchInput").addEventListener("input", renderContacts);
  $("#statusFilter").addEventListener("change", renderContacts);

  $("#btnExportXlsx").addEventListener("click", exportXlsx);
  $("#btnExportCsv").addEventListener("click", exportCsv);

  // settings
  $("#btnAddStatus").addEventListener("click", addStatus);
  $("#btnAddSnippet").addEventListener("click", addSnippet);
  $("#reminderDays").addEventListener("change", async (e) => {
    const v = Math.max(0, Math.min(120, parseInt(e.target.value, 10) || 0));
    db.settings.reminderDays = v;
    e.target.value = v;
    await persist();
    renderDue();
  });

  $("#btnImportCsv").addEventListener("click", () => pickFile("csv"));
  $("#btnBackupJson").addEventListener("click", backupPlain);
  $("#btnBackupEnc").addEventListener("click", backupEncrypted);
  $("#btnRestoreJson").addEventListener("click", () => pickFile("restore-plain"));
  $("#btnRestoreEnc").addEventListener("click", () => pickFile("restore-enc"));
  $("#fileInput").addEventListener("change", onFileChosen);
}

function armedClick(btn, armedLabel, fn) {
  const orig = btn.textContent;
  btn.addEventListener("click", () => {
    if (btn.dataset.armed) {
      delete btn.dataset.armed;
      btn.textContent = orig;
      fn();
    } else {
      btn.dataset.armed = "1";
      btn.textContent = armedLabel;
      setTimeout(() => {
        delete btn.dataset.armed;
        btn.textContent = orig;
      }, 3000);
    }
  });
}

// ---------- capture from LinkedIn ----------

async function pullFromPage() {
  const btn = $("#btnPull");
  btn.disabled = true;
  const origLabel = btn.textContent;
  btn.textContent = "Reading page...";
  try {
    const granted = await B.permissions.request(LI_ORIGINS).catch(() => false);
    if (!granted) {
      toast("LinkedIn access is needed to read the page.", true);
      return;
    }
    const tab = await activeLinkedInTab();
    if (!tab) {
      toast("No LinkedIn tab found. Open a profile first.", true);
      return;
    }
    const results = await B.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapePage,
    });
    const data = results?.[0]?.result;
    if (!data || (!data.name && !data.url)) {
      toast("Could not read the page. Fill the form manually.", true);
      openCapture({ url: tab.url?.split("?")[0] ?? "" });
      return;
    }
    openCapture(data);
  } catch (err) {
    toast("Capture failed: " + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = origLabel;
  }
}

async function activeLinkedInTab() {
  const tabs = await B.tabs.query({ url: "*://*.linkedin.com/*" });
  if (!tabs.length) return null;
  tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return tabs.find((t) => t.active) ?? tabs[0];
}

// Runs inside the LinkedIn tab. Self-contained: no closure references.
// Covers public/logged-in profiles plus Recruiter (/talent/) and Sales
// Navigator (/sales/) profile pages, which use different markup.
function scrapePage() {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const pick = (...sels) => {
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el && clean(el.textContent)) return clean(el.textContent);
    }
    return "";
  };
  const data = {
    url: location.origin + location.pathname,
    name: "",
    headline: "",
    company: "",
    location: "",
  };
  data.name = pick(
    "main h1",
    "h1",
    ".artdeco-entity-lockup__title",
    "[data-test-row-lockup-full-name]",
    ".profile-topcard-person-entity__name",
    ".profile-topcard__name"
  );
  data.headline = pick(
    "main div.text-body-medium.break-words",
    "main section div.text-body-medium",
    ".artdeco-entity-lockup__subtitle",
    ".profile-topcard__headline",
    "[data-test-row-lockup-headline]"
  );
  data.location = pick(
    "main span.text-body-small.inline.t-black--light.break-words",
    "main span.text-body-small.inline",
    ".profile-topcard__location-data",
    "[data-test-row-lockup-location]"
  );
  const comp = document.querySelector(
    'main button[aria-label^="Current company"], main [aria-label^="Current company"]'
  );
  if (comp) {
    const label = clean(comp.getAttribute("aria-label"));
    const m = label.match(/Current company:\s*([^.]+)/);
    data.company = m ? clean(m[1]) : clean(comp.textContent);
  }
  if (!data.company) {
    const el = document.querySelector(
      'main a[href*="/company/"] span[aria-hidden="true"], main a[href*="/company/"], .profile-topcard__current-positions .ellipsis-with-nowrap'
    );
    if (el) data.company = clean(el.textContent);
  }
  try {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      const j = JSON.parse(s.textContent);
      const nodes = j && j["@graph"] ? j["@graph"] : [j];
      for (const node of nodes) {
        if (!node || node["@type"] !== "Person") continue;
        data.name ||= clean(node.name);
        data.headline ||= clean(
          Array.isArray(node.jobTitle) ? node.jobTitle[0] : node.jobTitle
        );
        data.location ||= clean(node.address && node.address.addressLocality);
        const wf = Array.isArray(node.worksFor) ? node.worksFor[0] : node.worksFor;
        data.company ||= clean(wf && wf.name);
      }
    }
  } catch (e) {
    // ignore malformed JSON-LD
  }
  if (!data.name) {
    const t = clean(document.title).replace(/^\(\d+\)\s*/, "");
    const cut = t.indexOf(" | LinkedIn");
    if (cut > 0) data.name = t.slice(0, cut);
  }
  return data;
}

function openCapture(data) {
  closeOtherForms("captureForm");
  const form = $("#captureForm");
  form.classList.remove("hidden");
  delete form.dataset.override;
  $("#captureMsg").classList.add("hidden");
  $("#cName").value = data.name || "";
  $("#cHeadline").value = data.headline || "";
  $("#cCompany").value = data.company || "";
  $("#cLocation").value = data.location || "";
  $("#cUrl").value = data.url || "";
  fillStatusOptions($("#cStatus"));
  $("#cStatus").value = statusNames().includes("Contacted") ? "Contacted" : statusNames()[0] || "";
  $("#cNotes").value = "";
  $("#cName").focus();
}

function closeCapture() {
  $("#captureForm").classList.add("hidden");
}

async function onSaveContact(e) {
  e.preventDefault();
  const job = currentJob();
  if (!job) {
    toast("Create a job first (the + button).", true);
    return;
  }
  const name = $("#cName").value.trim();
  if (!name) {
    showCaptureMsg("Name is required.", true);
    return;
  }
  const url = normalizeUrl($("#cUrl").value);
  let crossJobNote = "";
  if (url) {
    const form = $("#captureForm");
    const sameJob = db.contacts.find(
      (c) => c.jobId === job.id && c.profileUrl === url
    );
    if (sameJob && !form.dataset.override) {
      form.dataset.override = "1";
      showCaptureMsg(
        `Already logged for this job as "${sameJob.status}". Click Save again to add anyway.`,
        true
      );
      return;
    }
    const insight = crossJobInsight(url, job.id);
    if (insight) crossJobNote = " (" + insight + ")";
  }
  const now = Date.now();
  const status = $("#cStatus").value;
  db.contacts.push({
    id: uid(),
    jobId: job.id,
    name,
    headline: $("#cHeadline").value.trim(),
    company: $("#cCompany").value.trim(),
    location: $("#cLocation").value.trim(),
    profileUrl: url,
    status,
    notes: $("#cNotes").value.trim(),
    createdAt: now,
    updatedAt: now,
    history: [{ status, at: now }],
    touches: [],
  });
  await persist();
  closeCapture();
  renderView();
  renderJobs();
  renderFooter();
  renderDue();
  toast(`Saved ${name} to "${job.title}"${crossJobNote}`);
}

function showCaptureMsg(msg, isErr) {
  const el = $("#captureMsg");
  el.textContent = msg;
  el.classList.toggle("err", !!isErr);
  el.classList.remove("hidden");
}

function normalizeUrl(raw) {
  const s = (raw || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s.includes("://") ? s : "https://" + s);
    u.hash = "";
    u.search = "";
    const out = u.toString();
    return out.endsWith("/") ? out.slice(0, -1) : out;
  } catch (e) {
    return s;
  }
}

// ---------- cross-job insight ----------

function otherJobContacts(url, exceptJobId) {
  if (!url) return [];
  return db.contacts
    .filter((c) => c.profileUrl === url && c.jobId !== exceptJobId)
    .map((c) => ({ c, job: db.jobs.find((j) => j.id === c.jobId) }));
}

// "contacted 3 months ago for SOC Analyst, marked Not Interested"
function crossJobInsight(url, exceptJobId) {
  const others = otherJobContacts(url, exceptJobId);
  if (!others.length) return "";
  const first = others.sort((a, b) => (a.c.createdAt || 0) - (b.c.createdAt || 0))[0];
  const when = relTime(first.c.createdAt);
  const jt = first.job?.title ?? "another job";
  const extra = others.length > 1 ? ` (+${others.length - 1} more)` : "";
  return `seen ${when} for ${jt}, marked ${first.c.status}${extra}`;
}

// ---------- bulk capture ----------

async function bulkFromPage() {
  if (!currentJob()) {
    toast("Select or create a job first.", true);
    return;
  }
  const btn = $("#btnBulk");
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = "Reading...";
  try {
    const granted = await B.permissions.request(LI_ORIGINS).catch(() => false);
    if (!granted) {
      toast("LinkedIn access is needed to read the page.", true);
      return;
    }
    const tab = await activeLinkedInTab();
    if (!tab) {
      toast("Open a LinkedIn search results page first.", true);
      return;
    }
    const results = await B.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeSearchResults,
    });
    const people = results?.[0]?.result || [];
    if (!people.length) {
      toast("No people found on this page. Open a search results page.", true);
      return;
    }
    openBulk(people);
  } catch (err) {
    toast("Bulk capture failed: " + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// Runs inside the LinkedIn tab. Best-effort scrape of a people search results
// page (standard search and Recruiter). Everything stays editable/selectable
// in the panel before saving.
function scrapeSearchResults() {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const out = [];
  const seen = new Set();
  const containers = document.querySelectorAll(
    "li.reusable-search__result-container, div.entity-result, .search-results-container li, .artdeco-list__item, li.reusable-search__result-container div.linked-area"
  );
  const scan = containers.length
    ? containers
    : document.querySelectorAll('a[href*="/in/"]');
  for (const node of scan) {
    const link =
      node.querySelector?.('a[href*="/in/"], a[href*="/talent/profile/"]') ||
      (node.matches?.('a[href*="/in/"]') ? node : null);
    if (!link) continue;
    let url = link.href.split("?")[0].replace(/\/$/, "");
    if (seen.has(url)) continue;
    let name =
      clean(
        node.querySelector?.(
          "span[aria-hidden='true'], .entity-result__title-text a span[aria-hidden='true'], .artdeco-entity-lockup__title"
        )?.textContent
      ) || clean(link.textContent);
    name = name.replace(/^View\s+/i, "").replace(/'s profile$/i, "");
    if (!name || /^\d+(st|nd|rd|th)/.test(name)) continue;
    const headline = clean(
      node.querySelector?.(
        ".entity-result__primary-subtitle, .artdeco-entity-lockup__subtitle, div.t-14.t-black.t-normal"
      )?.textContent
    );
    const location = clean(
      node.querySelector?.(
        ".entity-result__secondary-subtitle, .artdeco-entity-lockup__caption"
      )?.textContent
    );
    seen.add(url);
    out.push({ name, headline, location, company: "", url });
  }
  return out.slice(0, 100);
}

function openBulk(people) {
  closeOtherForms("bulkForm");
  const form = $("#bulkForm");
  form.classList.remove("hidden");
  $("#bulkMsg").classList.add("hidden");
  fillStatusOptions($("#bulkStatus"));
  $("#bulkStatus").value = statusNames().includes("To Contact")
    ? "To Contact"
    : statusNames()[0] || "";
  const list = $("#bulkList");
  list.textContent = "";
  const jobId = currentJob().id;
  for (const p of people) {
    const url = normalizeUrl(p.url);
    const dupe = db.contacts.some((c) => c.jobId === jobId && c.profileUrl === url);
    const li = document.createElement("li");
    li.className = "bulk-item";
    li.dataset.person = JSON.stringify({ ...p, url });
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !dupe;
    const body = document.createElement("div");
    const nm = document.createElement("div");
    nm.className = "bi-name";
    nm.textContent = p.name + (dupe ? " (already in job)" : "");
    const mt = document.createElement("div");
    mt.className = "bi-meta";
    mt.textContent = [p.headline, p.location].filter(Boolean).join(" · ");
    body.append(nm, mt);
    li.append(cb, body);
    list.append(li);
  }
  $("#bulkCount").textContent = `${people.length} found`;
}

function setBulkChecks(on) {
  for (const cb of $("#bulkList").querySelectorAll("input[type=checkbox]")) cb.checked = on;
}

async function onSaveBulk(e) {
  e.preventDefault();
  const job = currentJob();
  if (!job) return;
  const status = $("#bulkStatus").value;
  const now = Date.now();
  let added = 0;
  for (const li of $("#bulkList").querySelectorAll(".bulk-item")) {
    if (!li.querySelector("input[type=checkbox]").checked) continue;
    const p = JSON.parse(li.dataset.person);
    const url = normalizeUrl(p.url);
    if (url && db.contacts.some((c) => c.jobId === job.id && c.profileUrl === url)) continue;
    db.contacts.push({
      id: uid(),
      jobId: job.id,
      name: p.name,
      headline: p.headline || "",
      company: p.company || "",
      location: p.location || "",
      profileUrl: url,
      status,
      notes: "",
      createdAt: now,
      updatedAt: now,
      history: [{ status, at: now }],
      touches: [],
    });
    added++;
  }
  await persist();
  $("#bulkForm").classList.add("hidden");
  renderView();
  renderJobs();
  renderFooter();
  renderDue();
  toast(added ? `Added ${added} contact${added === 1 ? "" : "s"} to "${job.title}"` : "Nothing new to add.");
}

// ---------- jobs ----------

function openJobForm(job) {
  closeOtherForms("jobForm");
  editingJobId = job?.id ?? null;
  $("#jobTitle").value = job?.title ?? "";
  $("#jobForm").classList.remove("hidden");
  $("#jobTitle").focus();
}

function closeJobForm() {
  editingJobId = null;
  $("#jobForm").classList.add("hidden");
}

function closeOtherForms(keep) {
  for (const id of ["jobForm", "captureForm", "bulkForm"]) {
    if (id !== keep) $("#" + id).classList.add("hidden");
  }
}

// ---------- views ----------

function renderAll() {
  renderJobs();
  refreshStatusSelectors();
  renderView();
  renderFooter();
  renderDue();
}

function setView(v) {
  db.ui.view = v;
  persist();
  renderView();
  renderFooter();
  renderDue();
}

function renderView() {
  const v = db.ui.view || "list";
  $("#listView").classList.toggle("hidden", v !== "list");
  $("#boardView").classList.toggle("hidden", v !== "board");
  $("#analyticsView").classList.toggle("hidden", v !== "analytics");
  for (const t of document.querySelectorAll("#viewTabs .tab")) {
    t.classList.toggle("active", t.dataset.view === v);
  }
  if (v === "list") renderContacts();
  else if (v === "board") renderBoard();
  else renderAnalytics();
}

function renderJobs() {
  const sel = $("#jobSelect");
  sel.textContent = "";
  if (!db.jobs.length) {
    sel.append(new Option("No jobs yet: click + to add one", ""));
    sel.disabled = true;
  } else {
    sel.disabled = false;
    for (const j of db.jobs) {
      sel.append(
        new Option(
          `${j.title} (${contactsOf(j.id).length})`,
          j.id,
          false,
          j.id === db.ui.currentJobId
        )
      );
    }
  }
  $("#btnEditJob").disabled = $("#btnDeleteJob").disabled = !db.jobs.length;
}

function currentItems() {
  const job = currentJob();
  const q = $("#searchInput").value.trim().toLowerCase();
  const sf = $("#statusFilter").value;
  let items = job ? contactsOf(job.id) : [];
  const total = items.length;
  if (dueOnly) items = items.filter((c) => isOverdue(c, db.settings));
  if (sf) items = items.filter((c) => c.status === sf);
  if (q) {
    items = items.filter((c) =>
      [c.name, c.headline, c.company, c.location, c.notes]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }
  items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return { items, total };
}

function renderContacts() {
  const list = $("#contactList");
  list.textContent = "";
  const { items, total } = currentItems();
  for (const c of items) list.append(contactRow(c));

  const empty = $("#emptyState");
  if (!db.jobs.length) {
    empty.textContent =
      "Create a job with the + button, then open a LinkedIn profile and click Pull.";
  } else if (!total) {
    empty.textContent = "No contacts yet. Open a LinkedIn profile and click Pull.";
  } else if (dueOnly && !items.length) {
    empty.textContent = "No contacts are due for follow-up right now.";
  } else if (!items.length) {
    empty.textContent = "No contacts match the current search or filter.";
  }
  empty.classList.toggle("hidden", !!items.length);
  renderFooter();
}

function contactRow(c) {
  const li = document.createElement("li");
  li.className = "contact";
  li.dataset.id = c.id;
  const overdue = isOverdue(c, db.settings);
  if (overdue) li.classList.add("overdue");

  const row1 = document.createElement("div");
  row1.className = "row1";
  const a = document.createElement("a");
  a.className = "name";
  a.textContent = c.name;
  if (c.profileUrl) {
    a.href = c.profileUrl;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.title = c.profileUrl;
  } else {
    a.classList.add("nolink");
  }
  const badges = document.createElement("div");
  badges.className = "badges";
  if (overdue) {
    const b = document.createElement("span");
    b.className = "badge due";
    b.textContent = "Due";
    b.title = "Awaiting a reply past your follow-up window";
    badges.append(b);
  }
  const others = otherJobContacts(c.profileUrl, c.jobId);
  if (others.length) {
    const b = document.createElement("span");
    b.className = "badge dup";
    b.textContent = "Cross-job";
    b.title = crossJobInsight(c.profileUrl, c.jobId);
    badges.append(b);
  }
  row1.append(a, badges, statusSelect(c));

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = [c.headline, c.company, c.location].filter(Boolean).join(" · ");
  meta.title = meta.textContent;

  const row2 = document.createElement("div");
  row2.className = "row2";
  const notesBtn = mkBtn(c.notes ? "Notes •" : "Notes");
  const logBtn = mkBtn(c.touches?.length ? `Log (${c.touches.length})` : "Log");
  const copyBtn = mkBtn("Copy");
  const delBtn = mkBtn("Delete");
  delBtn.classList.add("delBtn");
  const date = document.createElement("span");
  date.className = "date";
  date.textContent = fmtDate(c.updatedAt);
  row2.append(notesBtn, logBtn, copyBtn, date, delBtn);

  const notes = document.createElement("textarea");
  notes.className = "notes hidden";
  notes.rows = 2;
  notes.placeholder = "Notes";
  notes.value = c.notes || "";
  notes.addEventListener("change", async () => {
    c.notes = notes.value;
    c.updatedAt = Date.now();
    await persist();
    notesBtn.textContent = c.notes ? "Notes •" : "Notes";
  });

  const touchPanel = buildTouchPanel(c, logBtn);
  const snipPanel = buildSnippetPanel(c);

  notesBtn.addEventListener("click", () => notes.classList.toggle("hidden"));
  logBtn.addEventListener("click", () => touchPanel.classList.toggle("hidden"));
  copyBtn.addEventListener("click", () => snipPanel.classList.toggle("hidden"));
  delBtn.addEventListener("click", () => armDelete(delBtn, c, li));

  li.append(row1, meta, row2, notes, touchPanel, snipPanel);
  return li;
}

function mkBtn(label) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  return b;
}

function armDelete(btn, c, li) {
  if (btn.dataset.armed) {
    db.contacts = db.contacts.filter((x) => x.id !== c.id);
    persist().then(() => {
      renderContacts();
      renderJobs();
      renderDue();
      toast("Contact deleted");
    });
  } else {
    btn.dataset.armed = "1";
    btn.textContent = "Sure?";
    setTimeout(() => {
      delete btn.dataset.armed;
      btn.textContent = "Delete";
    }, 2500);
  }
}

function statusSelect(c) {
  const sel = document.createElement("select");
  sel.className = "status";
  fillStatusOptions(sel, c.status);
  sel.value = c.status;
  paintStatus(sel);
  sel.addEventListener("change", async () => {
    c.status = sel.value;
    c.updatedAt = Date.now();
    (c.history ??= []).push({ status: c.status, at: c.updatedAt });
    paintStatus(sel);
    await persist();
    renderFooter();
    renderDue();
    // an overdue state may have cleared; refresh the row's badges/border
    const li = sel.closest("li");
    if (li) li.classList.toggle("overdue", isOverdue(c, db.settings));
  });
  return sel;
}

function paintStatus(sel) {
  const hex = hexOf(sel.value);
  sel.style.color = hex;
  sel.style.borderColor = hex;
  sel.dataset.status = sel.value;
}

// ---------- touch log ----------

function buildTouchPanel(c, logBtn) {
  const panel = document.createElement("div");
  panel.className = "panel hidden";

  const list = document.createElement("ul");
  list.className = "touch-list";
  const renderTouches = () => {
    list.textContent = "";
    for (const t of c.touches || []) {
      const li = document.createElement("li");
      li.className = "touch-item";
      const ch = document.createElement("span");
      ch.className = "ch";
      ch.textContent = t.channel;
      const tmpl = document.createElement("span");
      tmpl.textContent = [t.template && `“${t.template}”`, t.note].filter(Boolean).join(" ");
      const date = document.createElement("span");
      date.className = "tdate";
      date.textContent = fmtDate(t.at);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "tdel";
      del.textContent = "✕";
      del.title = "Remove touch";
      del.addEventListener("click", async () => {
        c.touches = c.touches.filter((x) => x.id !== t.id);
        await persist();
        renderTouches();
        logBtn.textContent = c.touches.length ? `Log (${c.touches.length})` : "Log";
      });
      li.append(ch, tmpl, date, del);
      list.append(li);
    }
  };
  renderTouches();

  const form = document.createElement("form");
  form.className = "touch-form";
  const chSel = document.createElement("select");
  for (const ch of db.settings.channels) chSel.append(new Option(ch, ch));
  const dateIn = document.createElement("input");
  dateIn.type = "date";
  dateIn.value = new Date().toISOString().slice(0, 10);
  const tmplSel = document.createElement("select");
  tmplSel.append(new Option("No template", ""));
  for (const s of db.settings.snippets) tmplSel.append(new Option(s.title, s.title));
  const note = document.createElement("input");
  note.placeholder = "Note (optional)";
  note.className = "full";
  const add = document.createElement("button");
  add.type = "submit";
  add.className = "primary full";
  add.textContent = "Add touch";
  form.append(chSel, dateIn, tmplSel, note, add);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const at = dateIn.value ? new Date(dateIn.value + "T12:00:00").getTime() : Date.now();
    (c.touches ??= []).push({
      id: uid(),
      at,
      channel: chSel.value,
      template: tmplSel.value,
      note: note.value.trim(),
    });
    c.updatedAt = Date.now();
    await persist();
    note.value = "";
    renderTouches();
    logBtn.textContent = `Log (${c.touches.length})`;
    renderDue();
  });

  panel.append(list, form);
  return panel;
}

// ---------- snippet copy ----------

function buildSnippetPanel(c) {
  const panel = document.createElement("div");
  panel.className = "panel snip-menu hidden";
  if (!db.settings.snippets.length) {
    const p = document.createElement("p");
    p.className = "snip-empty";
    p.textContent = "No snippets yet. Add reusable messages in Settings → Message snippets.";
    panel.append(p);
    return panel;
  }
  const job = currentJob();
  for (const s of db.settings.snippets) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Copy: " + s.title;
    btn.title = fillTemplate(s.body, c, job);
    btn.addEventListener("click", async () => {
      const text = fillTemplate(s.body, c, job);
      const ok = await copyText(text);
      toast(ok ? `Copied "${s.title}"` : "Copy failed: clipboard blocked.", !ok);
    });
    panel.append(btn);
  }
  return panel;
}

function fillTemplate(body, c, job) {
  const { first, last } = splitName(c.name);
  const map = {
    firstName: first,
    lastName: last,
    fullName: c.name || "",
    name: c.name || "",
    jobTitle: job?.title || "",
    company: c.company || "",
    headline: c.headline || "",
    location: c.location || "",
  };
  return String(body || "").replace(/\{(\w+)\}/g, (m, k) =>
    k in map ? map[k] : m
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e2) {
      return false;
    }
  }
}

// ---------- board (kanban) ----------

function renderBoard() {
  const board = $("#board");
  board.textContent = "";
  const job = currentJob();
  if (!job) {
    board.innerHTML = '<p class="empty">Select or create a job to see its board.</p>';
    renderFooter();
    return;
  }
  const cs = contactsOf(job.id);
  for (const st of db.settings.statuses) {
    const col = document.createElement("div");
    col.className = "board-col";
    col.dataset.status = st.name;
    const head = document.createElement("div");
    head.className = "board-col-head";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = TAG_COLORS[st.color] || TAG_COLORS.gray;
    const label = document.createElement("span");
    label.textContent = st.name;
    const cnt = document.createElement("span");
    cnt.className = "cnt";
    const inCol = cs.filter((c) => c.status === st.name);
    cnt.textContent = inCol.length;
    head.append(dot, label, cnt);

    const cards = document.createElement("ul");
    cards.className = "board-cards";
    for (const c of inCol.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))) {
      cards.append(boardCard(c, st));
    }
    wireDrop(col, cards, st.name);
    col.append(head, cards);
    board.append(col);
  }
  renderFooter();
}

function boardCard(c, st) {
  const li = document.createElement("li");
  li.className = "board-card";
  li.draggable = true;
  li.dataset.id = c.id;
  li.style.borderLeftColor = TAG_COLORS[st.color] || TAG_COLORS.gray;
  const name = document.createElement("div");
  name.className = "bc-name";
  name.textContent = c.name;
  const meta = document.createElement("div");
  meta.className = "bc-meta";
  meta.textContent = [c.company, c.headline].filter(Boolean).join(" · ");
  li.append(name, meta);
  li.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", c.id);
    e.dataTransfer.effectAllowed = "move";
    li.classList.add("dragging");
  });
  li.addEventListener("dragend", () => li.classList.remove("dragging"));
  return li;
}

function wireDrop(col, cards, statusName) {
  const over = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    col.classList.add("drop");
  };
  col.addEventListener("dragover", over);
  cards.addEventListener("dragover", over);
  col.addEventListener("dragleave", (e) => {
    if (!col.contains(e.relatedTarget)) col.classList.remove("drop");
  });
  const drop = async (e) => {
    e.preventDefault();
    col.classList.remove("drop");
    const id = e.dataTransfer.getData("text/plain");
    const c = db.contacts.find((x) => x.id === id);
    if (!c || c.status === statusName) return;
    c.status = statusName;
    c.updatedAt = Date.now();
    (c.history ??= []).push({ status: statusName, at: c.updatedAt });
    await persist();
    renderBoard();
    renderDue();
  };
  col.addEventListener("drop", drop);
  cards.addEventListener("drop", drop);
}

// ---------- analytics ----------

function renderAnalytics() {
  const root = $("#analytics");
  root.textContent = "";
  const job = currentJob();
  if (!job) {
    root.innerHTML = '<p class="empty">Select or create a job to see its analytics.</p>';
    renderFooter();
    return;
  }
  const cs = contactsOf(job.id);
  const repliedSet = ["Replied", "Shortlisted", "Interviewing", "Offer Made", "Hired"];
  const replied = cs.filter((c) => repliedSet.includes(c.status)).length;
  const contacted = cs.filter((c) => c.history?.some((h) => h.status === "Contacted")).length
    || cs.filter((c) => c.status !== "To Contact").length;
  const overdue = cs.filter((c) => isOverdue(c, db.settings)).length;
  const rate = contacted ? Math.round((replied / contacted) * 100) : 0;

  const stats = document.createElement("div");
  stats.className = "stat-row";
  stats.append(
    statTile(cs.length, "Contacts"),
    statTile(rate + "%", "Reply rate"),
    statTile(overdue, "Due")
  );
  root.append(stats);

  // funnel by status
  const h1 = document.createElement("div");
  h1.className = "an-h";
  h1.textContent = "Pipeline by status";
  root.append(h1);
  const funnel = document.createElement("div");
  funnel.className = "funnel";
  const max = Math.max(1, ...db.settings.statuses.map((s) => cs.filter((c) => c.status === s.name).length));
  for (const st of db.settings.statuses) {
    const n = cs.filter((c) => c.status === st.name).length;
    const rowEl = document.createElement("div");
    rowEl.className = "funnel-row";
    const fl = document.createElement("span");
    fl.className = "fl";
    fl.textContent = st.name;
    fl.title = st.name;
    const wrap = document.createElement("div");
    wrap.className = "fbar-wrap";
    const bar = document.createElement("div");
    bar.className = "fbar";
    bar.style.width = Math.round((n / max) * 100) + "%";
    bar.style.background = TAG_COLORS[st.color] || TAG_COLORS.gray;
    wrap.append(bar);
    const fn = document.createElement("span");
    fn.className = "fn";
    fn.textContent = n;
    rowEl.append(fl, wrap, fn);
    funnel.append(rowEl);
  }
  root.append(funnel);

  // contacts added per day, last 14 days
  const h2 = document.createElement("div");
  h2.className = "an-h";
  h2.textContent = "Contacts added (last 14 days)";
  root.append(h2);
  root.append(sparkline(cs));
  renderFooter();
}

function statTile(big, lbl) {
  const el = document.createElement("div");
  el.className = "stat";
  const b = document.createElement("div");
  b.className = "big";
  b.textContent = big;
  const l = document.createElement("div");
  l.className = "lbl";
  l.textContent = lbl;
  el.append(b, l);
  return el;
}

function sparkline(cs) {
  const days = 14;
  const buckets = new Array(days).fill(0);
  const startOfDay = (ts) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const today = startOfDay(Date.now());
  for (const c of cs) {
    const d = startOfDay(c.createdAt || 0);
    const idx = days - 1 - Math.round((today - d) / 86400000);
    if (idx >= 0 && idx < days) buckets[idx]++;
  }
  const max = Math.max(1, ...buckets);
  const spark = document.createElement("div");
  spark.className = "spark";
  buckets.forEach((n, i) => {
    const col = document.createElement("div");
    col.className = "spark-col";
    const bar = document.createElement("div");
    bar.className = "spark-bar";
    bar.style.height = Math.round((n / max) * 100) + "%";
    bar.title = `${n} on ${new Date(today - (days - 1 - i) * 86400000).toLocaleDateString()}`;
    const lbl = document.createElement("div");
    lbl.className = "spark-lbl";
    lbl.textContent = i % 2 === 0 ? new Date(today - (days - 1 - i) * 86400000).getDate() : "";
    col.append(bar, lbl);
    spark.append(col);
  });
  return spark;
}

// ---------- status selectors ----------

function fillStatusOptions(sel, ensure) {
  sel.textContent = "";
  const names = statusNames();
  const list = ensure && !names.includes(ensure) ? [ensure, ...names] : names;
  for (const s of list) sel.append(new Option(s, s));
}

function refreshStatusSelectors() {
  const filter = $("#statusFilter");
  const prev = filter.value;
  filter.textContent = "";
  filter.append(new Option("All statuses", ""));
  for (const s of statusNames()) filter.append(new Option(s, s));
  filter.value = statusNames().includes(prev) ? prev : "";
  buildAtsButtons();
}

// ---------- due indicator ----------

function renderDue() {
  const pill = $("#dueIndicator");
  const job = currentJob();
  const overdue = job
    ? contactsOf(job.id).filter((c) => isOverdue(c, db.settings)).length
    : 0;
  if (!overdue) {
    pill.classList.add("hidden");
    dueOnly = false;
  } else {
    pill.classList.remove("hidden");
    pill.textContent = `Due ${overdue}`;
    pill.classList.toggle("active", dueOnly);
  }
}

function renderFooter() {
  const job = currentJob();
  if (!job) {
    $("#footerStats").textContent = "";
    return;
  }
  const cs = contactsOf(job.id);
  const replied = cs.filter((c) =>
    ["Replied", "Shortlisted", "Interviewing", "Offer Made", "Hired"].includes(c.status)
  ).length;
  $("#footerStats").textContent = `${cs.length} contact${cs.length === 1 ? "" : "s"}, ${replied} replied`;
}

function fmtDate(ts) {
  return ts
    ? new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : "";
}

function relTime(ts) {
  if (!ts) return "recently";
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

// ---------- settings ----------

function openSettings() {
  $("#settingsPanel").classList.remove("hidden");
  $("#reminderDays").value = db.settings.reminderDays;
  renderStatusEditor();
  renderSnippetEditor();
  buildAtsButtons();
}

function renderStatusEditor() {
  const ul = $("#statusEditor");
  ul.textContent = "";
  db.settings.statuses.forEach((st, idx) => {
    const li = document.createElement("li");
    li.className = "status-row";

    const name = document.createElement("input");
    name.className = "sname";
    name.value = st.name;
    name.addEventListener("change", async () => {
      const newName = name.value.trim();
      if (!newName) {
        name.value = st.name;
        return;
      }
      const old = st.name;
      if (newName !== old) {
        for (const c of db.contacts) if (c.status === old) c.status = newName;
        st.name = newName;
        await persist();
        refreshStatusSelectors();
        renderView();
        renderDue();
      }
    });

    const swatches = document.createElement("div");
    swatches.className = "swatches";
    for (const key of Object.keys(TAG_COLORS)) {
      const sw = document.createElement("button");
      sw.type = "button";
      sw.className = "swatch" + (st.color === key ? " on" : "");
      sw.style.background = TAG_COLORS[key];
      sw.title = key;
      sw.addEventListener("click", async () => {
        st.color = key;
        for (const s of swatches.children) s.classList.remove("on");
        sw.classList.add("on");
        await persist();
        renderView();
      });
      swatches.append(sw);
    }

    const awaiting = document.createElement("label");
    awaiting.className = "awaiting";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!st.awaiting;
    cb.addEventListener("change", async () => {
      st.awaiting = cb.checked;
      await persist();
      renderDue();
      renderView();
    });
    awaiting.append(cb, document.createTextNode("awaiting"));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "✕";
    del.title = "Remove status";
    del.addEventListener("click", async () => {
      if (db.settings.statuses.length <= 1) {
        toast("Keep at least one status.", true);
        return;
      }
      db.settings.statuses.splice(idx, 1);
      await persist();
      renderStatusEditor();
      refreshStatusSelectors();
      renderView();
      renderDue();
    });

    li.append(name, swatches, awaiting, del);
    ul.append(li);
  });
}

async function addStatus() {
  db.settings.statuses.push({ name: "New status", color: "gray", awaiting: false });
  await persist();
  renderStatusEditor();
  refreshStatusSelectors();
  renderView();
}

function renderSnippetEditor() {
  const ul = $("#snippetEditor");
  ul.textContent = "";
  for (const s of db.settings.snippets) {
    const li = document.createElement("li");
    li.className = "snippet-row";
    const title = document.createElement("input");
    title.className = "stitle";
    title.value = s.title;
    title.placeholder = "Snippet title";
    title.addEventListener("change", async () => {
      s.title = title.value.trim() || "Untitled";
      await persist();
    });
    const body = document.createElement("textarea");
    body.rows = 3;
    body.value = s.body;
    body.placeholder = "Hi {firstName}, I'm hiring for {jobTitle}...";
    body.addEventListener("change", async () => {
      s.body = body.value;
      await persist();
    });
    const srow = document.createElement("div");
    srow.className = "srow";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "small";
    del.textContent = "Delete";
    del.addEventListener("click", async () => {
      db.settings.snippets = db.settings.snippets.filter((x) => x.id !== s.id);
      await persist();
      renderSnippetEditor();
    });
    srow.append(del);
    li.append(title, body, srow);
    ul.append(li);
  }
}

async function addSnippet() {
  db.settings.snippets.push({ id: uid(), title: "Untitled", body: "" });
  await persist();
  renderSnippetEditor();
}

// ---------- import / backup / restore ----------

function pickFile(mode) {
  pendingFile = { mode };
  const input = $("#fileInput");
  input.value = "";
  input.click();
}

async function onFileChosen(e) {
  const file = e.target.files?.[0];
  if (!file || !pendingFile) return;
  const mode = pendingFile.mode;
  pendingFile = null;
  let text;
  try {
    text = await file.text();
  } catch (err) {
    toast("Could not read the file.", true);
    return;
  }
  if (mode === "csv") importCsv(text);
  else if (mode === "restore-plain") restoreBackup(text, "");
  else if (mode === "restore-enc") restoreBackup(text, $("#backupPass").value);
}

async function importCsv(text) {
  const job = currentJob();
  if (!job) {
    toast("Select a job to import into first.", true);
    return;
  }
  const rows = parseCsv(text);
  if (rows.length < 2) {
    toast("CSV has no data rows.", true);
    return;
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };
  const iName = col("name", "full name");
  const iHead = col("headline", "title");
  const iComp = col("company");
  const iLoc = col("location");
  const iUrl = col("profile url", "linkedin url", "linkedin", "url");
  const iStatus = col("status", "stage");
  const iNotes = col("notes", "note");
  const valid = new Set(statusNames());
  const now = Date.now();
  let added = 0;
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = (iName >= 0 ? row[iName] : row[0] || "").trim();
    if (!name) continue;
    const url = normalizeUrl(iUrl >= 0 ? row[iUrl] : "");
    if (url && db.contacts.some((c) => c.jobId === job.id && c.profileUrl === url)) {
      skipped++;
      continue;
    }
    let status = iStatus >= 0 ? (row[iStatus] || "").trim() : "";
    if (!valid.has(status)) status = statusNames()[0] || "To Contact";
    db.contacts.push({
      id: uid(),
      jobId: job.id,
      name,
      headline: iHead >= 0 ? (row[iHead] || "").trim() : "",
      company: iComp >= 0 ? (row[iComp] || "").trim() : "",
      location: iLoc >= 0 ? (row[iLoc] || "").trim() : "",
      profileUrl: url,
      status,
      notes: iNotes >= 0 ? (row[iNotes] || "").trim() : "",
      createdAt: now,
      updatedAt: now,
      history: [{ status, at: now }],
      touches: [],
    });
    added++;
  }
  await persist();
  renderAll();
  toast(`Imported ${added} contact${added === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}` : ""}.`);
}

async function backupPlain() {
  await downloadBytes(encodePlain(db), `talentledger-backup-${dateStamp()}.json`, "application/json");
}

async function backupEncrypted() {
  const pass = $("#backupPass").value;
  if (!pass) {
    toast("Enter a passphrase to encrypt the backup.", true);
    return;
  }
  try {
    const bytes = await encodeEncrypted(db, pass);
    await downloadBytes(bytes, `talentledger-backup-${dateStamp()}.tlbak`, "application/json");
  } catch (err) {
    toast("Encryption failed: " + err.message, true);
  }
}

async function restoreBackup(text, passphrase) {
  let data;
  try {
    data = await decodeBackup(text, passphrase);
  } catch (err) {
    toast(err.message, true);
    return;
  }
  const replace = $("#restoreReplace").checked;
  const incoming = normalizeDb({ ...data, ui: db.ui });
  if (replace) {
    db.jobs = incoming.jobs;
    db.contacts = incoming.contacts;
    db.settings = incoming.settings;
  } else {
    mergeInto(db, incoming);
  }
  if (!db.jobs.some((j) => j.id === db.ui.currentJobId)) {
    db.ui.currentJobId = db.jobs[0]?.id ?? null;
  }
  await persist();
  renderAll();
  $("#settingsPanel").classList.add("hidden");
  toast(replace ? "Data replaced from backup." : "Backup merged in.");
}

function mergeInto(target, incoming) {
  const jobById = new Map(target.jobs.map((j) => [j.id, j]));
  for (const j of incoming.jobs) if (!jobById.has(j.id)) target.jobs.push(j);
  const key = (c) => c.jobId + "|" + (c.profileUrl || c.id);
  const seen = new Set(target.contacts.map(key));
  for (const c of incoming.contacts) {
    if (!seen.has(key(c))) {
      target.contacts.push(c);
      seen.add(key(c));
    }
  }
  // merge any custom statuses/snippets that aren't present
  const names = new Set(target.settings.statuses.map((s) => s.name));
  for (const s of incoming.settings.statuses || []) if (!names.has(s.name)) target.settings.statuses.push(s);
  const snips = new Set(target.settings.snippets.map((s) => s.title));
  for (const s of incoming.settings.snippets || []) if (!snips.has(s.title)) target.settings.snippets.push(s);
}

// ---------- export ----------

function contactRowArr(c) {
  return [
    c.name,
    c.headline,
    c.company,
    c.location,
    c.profileUrl,
    c.status,
    c.notes,
    isoDate(c.createdAt),
    isoDate(c.updatedAt),
  ];
}

const isoDate = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : "");
const dateStamp = () => new Date().toISOString().slice(0, 10);

async function exportXlsx() {
  if (!db.jobs.length) {
    toast("Nothing to export yet.", true);
    return;
  }
  const names = statusNames();
  const summary = [["Job", "Total", ...names]];
  for (const j of db.jobs) {
    const cs = contactsOf(j.id);
    summary.push([
      j.title,
      cs.length,
      ...names.map((s) => cs.filter((c) => c.status === s).length),
    ]);
  }
  const sheets = [{ name: "Summary", rows: summary }];
  for (const j of db.jobs) {
    sheets.push({
      name: j.title,
      rows: [CONTACT_HEADER, ...contactsOf(j.id).map(contactRowArr)],
    });
  }
  await downloadBytes(buildXlsx(sheets), `TalentLedger-${dateStamp()}.xlsx`, XLSX_MIME);
}

async function exportCsv() {
  const job = currentJob();
  if (!job) {
    toast("No job selected.", true);
    return;
  }
  const rows = [CONTACT_HEADER, ...contactsOf(job.id).map(contactRowArr)];
  await downloadBytes(toCsvBytes(rows), `${slug(job.title)}-${dateStamp()}.csv`, "text/csv");
}

function buildAtsButtons() {
  const wrap = $("#atsButtons");
  wrap.textContent = "";
  for (const [key, tpl] of Object.entries(ATS_TEMPLATES)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "small";
    btn.textContent = tpl.label + " CSV";
    btn.addEventListener("click", () => exportAts(key));
    wrap.append(btn);
  }
}

async function exportAts(key) {
  const job = currentJob();
  if (!job) {
    toast("Select a job to export.", true);
    return;
  }
  const tpl = ATS_TEMPLATES[key];
  const rows = [tpl.header, ...contactsOf(job.id).map((c) => tpl.row(c, job))];
  await downloadBytes(toCsvBytes(rows), `${slug(job.title)}-${key}-${dateStamp()}.csv`, "text/csv");
  toast(`Exported ${tpl.label} CSV.`);
}

function slug(s) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "job"
  );
}

async function downloadBytes(bytes, filename, mime) {
  const url = "data:" + mime + ";base64," + toBase64(bytes);
  try {
    await B.downloads.download({ url, filename, saveAs: true });
    toast("Export started.");
  } catch (err) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
    a.download = filename;
    a.click();
  }
}

function toBase64(bytes) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// ---------- toast ----------

let toastTimer;
function toast(msg, isErr) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("err", !!isErr);
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
}
