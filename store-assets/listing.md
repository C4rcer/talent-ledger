# TalentLedger AMO listing copy

Draft for the first public (listed) submission to addons.mozilla.org.
Add-on ID: `talent-ledger@spikespegal`. Account: C4rcer. Channel: listed.

## Name

TalentLedger: Candidate Tracker

## Summary (max 250 characters)

A private candidate tracker for recruiters, beside LinkedIn. Capture profiles
in one click, track outreach per job on a board with reminders and snippets,
see reply-rate analytics, and export to Excel, CSV or your ATS. Local only,
nothing uploaded.

## Description

TalentLedger is a free, fully unlocked recruiting sidekick that lives next to
LinkedIn. It keeps your candidate pipeline in the browser, on your machine, with
no account and no tracking.

Capture and track
- One-click capture of the profile you are viewing (name, headline, company,
  location, URL), fully editable before you save. Works on regular profiles
  plus Recruiter and Sales Navigator pages.
- Bulk capture: pick several people off a search results page at once.
- Organise contacts by job, with per-contact notes and a full status history.

Work your pipeline
- List, Board (drag between stages) and Analytics views.
- Custom statuses and colour tags you define.
- Follow-up reminders: contacts left waiting past your chosen window are flagged
  on the row, a Due pill, and a toolbar badge.
- Message snippets with variables like {firstName} and {jobTitle} that fill from
  the contact and job, copied in one click.
- A per-contact outreach log (channel, date, which template you used).
- Cross-job insight: someone you already contacted for another role is flagged,
  with when and how they were last seen.

Get data in and out
- Import a CSV into a job; export to CSV, Excel (one tab per job plus a summary),
  or ATS-ready templates for Greenhouse, Workable and Teamtailor.
- Back up and restore everything as JSON, or as an encrypted file you carry
  between machines yourself.

Private by design
- 100% local storage. No account, no servers, no telemetry. Nothing is uploaded;
  the only data that ever leaves your machine is a file you choose to export.
- The extension only reads a page when you actively click Pull or Bulk on it.

TalentLedger is free and stays free. If it saves you time, there is an optional
Support link to Ko-fi in the popup, but donations unlock nothing: every feature
is available to everyone.

Not affiliated with, or endorsed by, LinkedIn.

## Categories (AMO allows up to 3)

- Primary: Social & Communication
- Secondary (optional): Other

## Tags (suggested)

recruiting, candidate-tracker, sourcing, hiring, ats, crm, productivity

## Data collection disclosure

This add-on does not collect any data. (manifest declares
`data_collection_permissions.required = ["none"]`.) No privacy policy is
required because no data is collected or transmitted.

## Permissions and why (for the review notes field)

- storage: save your jobs, contacts and settings locally.
- scripting + host permission for linkedin.com: read the profile/search page you
  are actively viewing when you click Pull or Bulk. Requested on first use.
- downloads: save the exports and backups you generate.
- alarms: periodically recompute the follow-up count for the toolbar badge.
- clipboardWrite: copy a filled-in message snippet to your clipboard.

No remote code, no analytics, no network requests of any kind.
