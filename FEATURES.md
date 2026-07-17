# TalentLedger Feature Log

Status key: **Shipped** (in the current build), **Idea** (exploratory).

TalentLedger is free and fully unlocked. There is no Pro tier, no paywall, no
licence check, and no feature gating: every feature below is available to
everyone, with no cap on the number of jobs or contacts. If the tool saves you
time, you can chip in on Ko-fi (see Support below), but that is entirely
optional and unlocks nothing extra.

## Shipped

Capture and tracking:

| Feature | Status |
|---|---|
| One-click capture of the LinkedIn profile being viewed (name, headline, company, location, URL), editable before save | Shipped |
| LinkedIn Recruiter (`/talent/`) and Sales Navigator (`/sales/`) profile support via extra scraper selectors | Shipped |
| Bulk capture from a LinkedIn people search results page, with a checklist and per-row duplicate flagging before save | Shipped |
| Jobs: create, rename, delete, with no cap on the number of active jobs | Shipped |
| Contact log per job with editable statuses and per-contact notes | Shipped |
| Status history per contact (every change timestamped) | Shipped |
| Search and status filter | Shipped |
| Pop-out window for side-by-side sourcing | Shipped |

Pipeline and workflow:

| Feature | Status |
|---|---|
| Custom statuses and colour tags: rename, recolour, reorder-by-add, and delete pipeline stages | Shipped |
| Kanban board view: drag contacts between status columns | Shipped |
| Analytics view: reply rate, pipeline funnel by status, and contacts added per day (last 14 days) | Shipped |
| Follow-up reminders: contacts in an "awaiting" status past a configurable window are flagged, counted on a Due pill, and shown on a toolbar badge | Shipped |
| Cross-job duplicate insight: a contact already logged under another job is flagged on the row and in the save confirmation ("seen 3 months ago for SOC Analyst, marked Not Interested") | Shipped |
| Outreach touch log per candidate: channel (InMail, connection note, email, ...), date, which snippet/template was used, and a note | Shipped |
| Message snippet library with variables (`{firstName}`, `{lastName}`, `{fullName}`, `{jobTitle}`, `{company}`, `{headline}`, `{location}`), one-click copy that fills from the contact and current job | Shipped |

Data in and out:

| Feature | Status |
|---|---|
| CSV import into the selected job, header-mapped, skipping in-job duplicates | Shipped |
| CSV export of the selected job | Shipped |
| Excel export: one tab per job plus a Summary tab with per-status counts | Shipped |
| ATS-ready export templates: Greenhouse, Workable and Teamtailor candidate CSV shapes | Shipped |
| Backup/restore of everything (jobs, contacts, settings) as plain JSON | Shipped |
| Encrypted `.tlbak` backup/restore (AES-GCM, passphrase-derived key) as the offline way to move data between machines | Shipped |
| 100% local storage, no account, no telemetry, nothing uploaded | Shipped |

## Not planned

Two earlier ideas needed a server we would have to run, which conflicts with
the "nothing leaves the machine" design, so they are intentionally not built:

- **Encrypted sync between machines.** Replaced by the encrypted `.tlbak`
  backup above: export on one machine, carry the file, restore on another.
  Nothing is uploaded.
- **Remote selector auto-heal** (fetching scraping selectors from a server).
  The scraper instead ships several selector fallbacks plus the JSON-LD block,
  and every captured field is editable before saving, so a LinkedIn markup
  change degrades to manual entry rather than a silent break.

## Creative / exploratory ideas

Not built yet; candidates for future versions.

| Idea |
|---|
| GDPR toolkit: per-candidate retention timer, one-click purge, consent note field |
| Candidate scorecard: rate 1 to 5 against criteria you define per job, sortable ranking |
| Job description keyword matcher: paste the JD, matching skills highlight on the profile you are viewing |
| Daily digest toast: "Yesterday: 14 contacted, 3 replies (21%)" |
| Toolbar badge counter: contacts logged today versus a daily goal you set |
| Boolean search builder with saved searches per job |
| Stale pipeline nudge: jobs untouched for 14 days prompt an archive |
| Share bundle: export a job as a single file a teammate can import (precursor to real team sync) |
| Interview scheduling link quick-insert (Calendly etc.) into copied snippets |
| "Ghost radar": surfaces contacts stuck in Contacted with no status change the longest |

## Support

TalentLedger is free and stays free. If it earns its keep, you can support
ongoing development on Ko-fi: [ko-fi.com/carcer7378](https://ko-fi.com/carcer7378).
The **Support** link in the popup header goes to the same place. Donations are
voluntary and never unlock features, remove limits, or change behaviour: there
is nothing to buy.

## Port plan

Firefox first (this repo). Chrome port afterwards in a separate sibling
folder, `talent-ledger-chromium`, per the usual convention: no build
machinery added here. `lib/env.js` already resolves `chrome` when `browser`
is absent, and the `lib/` modules are engine-agnostic, so the port is mostly
manifest and icon work (Chrome needs PNG icons, a `service_worker` background
entry instead of `scripts`, and grants host permissions at install instead of
on first use).
