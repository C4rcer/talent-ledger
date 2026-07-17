// Minimal XLSX writer: inline-string worksheets packed into a stored
// (uncompressed) ZIP. Zero dependencies so the AMO submission stays fully
// human-readable. Excel, LibreOffice and Google Sheets all open the output.

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/**
 * Build an .xlsx workbook.
 * @param {Array<{name: string, rows: Array<Array<string|number>>}>} sheets
 *   One entry per worksheet. Row 0 is treated as the header (frozen).
 * @returns {Uint8Array} the workbook file bytes
 */
export function buildXlsx(sheets) {
  const named = uniqueNames(sheets);
  const files = [];
  const overrides = [];
  const sheetRefs = [];
  const rels = [];

  named.forEach((sheet, i) => {
    const n = i + 1;
    files.push({ name: `xl/worksheets/sheet${n}.xml`, text: sheetXml(sheet.rows) });
    overrides.push(
      `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    );
    sheetRefs.push(`<sheet name="${esc(sheet.name)}" sheetId="${n}" r:id="rId${n}"/>`);
    rels.push(
      `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`
    );
  });

  files.push({
    name: "[Content_Types].xml",
    text:
      XML_HEADER +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      overrides.join("") +
      "</Types>",
  });
  files.push({
    name: "_rels/.rels",
    text:
      XML_HEADER +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>",
  });
  files.push({
    name: "xl/workbook.xml",
    text:
      XML_HEADER +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      "<sheets>" +
      sheetRefs.join("") +
      "</sheets></workbook>",
  });
  files.push({
    name: "xl/_rels/workbook.xml.rels",
    text:
      XML_HEADER +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      rels.join("") +
      "</Relationships>",
  });

  const enc = new TextEncoder();
  return zipStore(files.map((f) => ({ name: f.name, data: enc.encode(f.text) })));
}

function sheetXml(rows) {
  const widths = [];
  for (const row of rows) {
    row.forEach((v, c) => {
      const len = String(v ?? "").length;
      if (!widths[c] || len > widths[c]) widths[c] = len;
    });
  }
  let cols = "";
  if (widths.length) {
    cols =
      "<cols>" +
      widths
        .map((w, i) => {
          const width = Math.min(Math.max((w || 8) + 2, 10), 60);
          return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`;
        })
        .join("") +
      "</cols>";
  }
  const body = rows
    .map(
      (row, ri) =>
        `<row r="${ri + 1}">` + row.map((v, ci) => cell(v, ci, ri)).join("") + "</row>"
    )
    .join("");
  return (
    XML_HEADER +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    "</sheetView></sheetViews>" +
    cols +
    "<sheetData>" +
    body +
    "</sheetData></worksheet>"
  );
}

function cell(v, ci, ri) {
  const ref = colName(ci) + (ri + 1);
  if (typeof v === "number" && Number.isFinite(v)) {
    return `<c r="${ref}"><v>${v}</v></c>`;
  }
  const s = String(v ?? "");
  if (!s) return "";
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(s)}</t></is></c>`;
}

function colName(i) {
  let s = "";
  i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

// Excel sheet names: max 31 chars, no \ / ? * [ ] : and unique per workbook.
function uniqueNames(sheets) {
  const seen = new Set();
  return sheets.map((s, i) => {
    let base =
      String(s.name || "")
        .replace(/[\\/?*[\]:]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^'+|'+$/g, "")
        .slice(0, 28) || `Sheet${i + 1}`;
    let name = base;
    let n = 2;
    while (seen.has(name.toLowerCase())) name = `${base} ${n++}`;
    seen.add(name.toLowerCase());
    return { name, rows: s.rows };
  });
}

function esc(s) {
  return String(s)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Stored (method 0) ZIP with UTF-8 entry names and forward slashes only.
function zipStore(entries) {
  const te = new TextEncoder();
  const now = new Date();
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate =
    (((now.getFullYear() - 1980) & 0x7f) << 9) |
    ((now.getMonth() + 1) << 5) |
    now.getDate();

  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const e of entries) {
    const nameB = te.encode(e.name);
    const crc = crc32(e.data);

    const local = new Uint8Array(30 + nameB.length + e.data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed to extract
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // method: stored
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.data.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, nameB.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameB, 30);
    local.set(e.data, 30 + nameB.length);
    locals.push(local);

    const cent = new Uint8Array(46 + nameB.length);
    const cv = new DataView(cent.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, nameB.length, true);
    cv.setUint32(42, offset, true);
    cent.set(nameB, 46);
    centrals.push(cent);

    offset += local.length;
  }

  const centralSize = centrals.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + 22);
  let p = 0;
  for (const block of [...locals, ...centrals, eocd]) {
    out.set(block, p);
    p += block.length;
  }
  return out;
}
