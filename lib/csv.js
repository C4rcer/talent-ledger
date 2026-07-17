// CSV helpers: a tolerant parser (quoted fields, embedded commas/newlines,
// CRLF, BOM) for import, plus builders for plain and ATS-shaped exports.
// Zero dependencies so the AMO package stays human-readable.

/**
 * Parse CSV text into an array of string rows.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const s = String(text ?? "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === ",") {
      pushField();
      i++;
    } else if (ch === "\r") {
      // handle \r\n and lone \r
      pushRow();
      if (s[i + 1] === "\n") i += 2;
      else i++;
    } else if (ch === "\n") {
      pushRow();
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  // trailing field/row (unless the file ended exactly on a newline)
  if (field !== "" || row.length) pushRow();
  // drop a single trailing empty row that a final newline can leave behind
  if (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  return rows;
}

const csvCell = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';

/**
 * Build CSV file bytes (UTF-8 with BOM, CRLF line endings) from rows.
 * @param {Array<Array<string|number>>} rows
 * @returns {Uint8Array}
 */
export function toCsvBytes(rows) {
  const csv =
    "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return new TextEncoder().encode(csv);
}

// Split "Ada Lovelace King" into { first: "Ada", last: "Lovelace King" }.
export function splitName(full) {
  const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

// ATS-ready export shapes. Each template maps a contact (+ its job) onto the
// column layout the target ATS accepts on candidate import. We only hold the
// data LinkedIn exposes, so email/phone are left blank for the recruiter to
// fill; status is carried through as the stage/source/tag where each ATS has a
// natural slot for it.
export const ATS_TEMPLATES = {
  greenhouse: {
    label: "Greenhouse",
    header: [
      "First Name",
      "Last Name",
      "Email",
      "Phone",
      "LinkedIn URL",
      "Company",
      "Title",
      "Location",
      "Source",
      "Notes",
    ],
    row(c, job) {
      const { first, last } = splitName(c.name);
      return [
        first,
        last,
        "",
        "",
        c.profileUrl || "",
        c.company || "",
        c.headline || "",
        c.location || "",
        job ? `TalentLedger: ${job.title}` : "TalentLedger",
        c.notes || "",
      ];
    },
  },
  workable: {
    label: "Workable",
    header: [
      "Name",
      "Email",
      "Phone",
      "Headline",
      "Company",
      "Location",
      "LinkedIn",
      "Stage",
      "Notes",
    ],
    row(c) {
      return [
        c.name || "",
        "",
        "",
        c.headline || "",
        c.company || "",
        c.location || "",
        c.profileUrl || "",
        c.status || "",
        c.notes || "",
      ];
    },
  },
  teamtailor: {
    label: "Teamtailor",
    header: [
      "First name",
      "Last name",
      "Email",
      "Phone",
      "LinkedIn URL",
      "Headline",
      "Location",
      "Tags",
      "Note",
    ],
    row(c, job) {
      const { first, last } = splitName(c.name);
      const tags = [c.status, job && job.title].filter(Boolean).join(", ");
      return [
        first,
        last,
        "",
        "",
        c.profileUrl || "",
        c.headline || "",
        c.location || "",
        tags,
        c.notes || "",
      ];
    },
  },
};
