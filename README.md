# TalentLedger: Candidate Tracker (Firefox)

A recruiter sidekick that lives next to LinkedIn. Capture the profile you are
viewing with one click, log the contact against the job you are hiring for,
track outreach on a board with reminders and snippets, and export to Excel,
CSV or an ATS format.

Everything is stored locally in `browser.storage.local`. No account, no
server, nothing leaves the machine except the files you save yourself.
Everything is free and fully unlocked.

## How it works

1. Click the toolbar icon (pin it first) or pop the panel out into its own
   window with the popout button, handy for side-by-side sourcing.
2. Create a job with the `+` button, e.g. "Senior SOC Analyst".
3. Open a LinkedIn profile and click **Pull from LinkedIn page**. The first
   pull asks for permission to read linkedin.com pages; grant it once.
   Name, headline, company, location and profile URL are pre-filled and fully
   editable before saving. Regular profiles plus Recruiter and Sales Navigator
   pages are supported. Use **Manual** to add someone by hand, or **Bulk** to
   pick several people off a search results page.
4. Track progress in three views (switch with the tabs):
   - **List**: status dropdown, notes, a per-contact outreach **Log** (channel,
     date, template), and **Copy** for filling a message snippet from the
     contact and job.
   - **Board**: a Kanban of your statuses; drag contacts between columns.
   - **Analytics**: reply rate, pipeline funnel, and contacts added per day.
5. Contacts left waiting past your follow-up window are flagged with a **Due**
   pill and a toolbar badge. Set the window and edit statuses, colour tags and
   snippets in **Settings** (the gear).
6. Export from the footer: **Excel** (Summary tab plus one tab per job) or
   **CSV** (selected job). Settings also has ATS templates (Greenhouse,
   Workable, Teamtailor), CSV import, and plain or encrypted backup/restore.

Duplicate protection: saving a profile URL already logged under the same job
warns first; a contact already logged under a different job is flagged on the
row and in the save confirmation, with when and how it was last seen.

Moving between machines: there is no cloud sync (nothing is uploaded). Instead,
export an encrypted `.tlbak` backup from Settings, carry the file yourself, and
restore it on the other machine with the same passphrase.

## Development

Run in a throwaway profile:

```
npx web-ext run --source-dir .
```

Or load it temporarily: `about:debugging#/runtime/this-firefox`, then
"Load Temporary Add-on" and pick `manifest.json`.

UI-only preview without Firefox APIs: serve this folder over HTTP and open
`popup.html?mode=window`. A dev shim in `lib/env.js` supplies sample
candidates and localStorage-backed storage so every flow can be exercised.

### Packaging

```
./build.ps1
```

Writes `dist/talent-ledger-<version>.zip` with forward-slash entry names
(Compress-Archive is deliberately avoided) and verifies the result.

## Notes and caveats

- LinkedIn changes its markup often. The scraper tries several selectors plus
  the JSON-LD block on public profiles, and every captured field is editable
  before saving, so a broken selector degrades to manual entry rather than
  failing. Selectors live in `scrapePage()` in `popup.js`.
- The extension only reads a page when you actively click **Pull** or **Bulk**
  on the tab you are viewing. There is no background crawling and no message
  automation. Review LinkedIn's terms of service and use it responsibly.
- You are the data controller for the candidate data you store. For GDPR
  hygiene, delete jobs (and their contacts) once a search closes.
- Chrome port is planned later in a separate sibling folder
  (`talent-ledger-chromium`), same core modules.

TalentLedger is free and fully unlocked: no Pro tier, no paywall, no feature
gating, and no cap on jobs or contacts. If it saves you time, there is an
optional **Support** link in the popup header that points to
[Ko-fi](https://ko-fi.com/carcer7378); donations never unlock anything.

See [FEATURES.md](FEATURES.md) for the full feature log.
