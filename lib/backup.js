// Backup and restore. A plain JSON export for quick backups, plus an
// AES-GCM encrypted variant (passphrase-derived key via PBKDF2) that the user
// moves between machines themselves. This is the local-only substitute for
// cloud sync: nothing leaves the machine except the file you save and carry.

const APP = "talent-ledger";
const PBKDF2_ITER = 210000;

// Only the durable data travels in a backup, never the transient `ui` state.
export function makeBackup(db) {
  return {
    app: APP,
    kind: "backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      jobs: db.jobs || [],
      contacts: db.contacts || [],
      settings: db.settings || {},
    },
  };
}

export function encodePlain(db) {
  return new TextEncoder().encode(JSON.stringify(makeBackup(db), null, 2));
}

// Accepts either a plain backup or an encrypted envelope. For encrypted
// files a passphrase is required. Returns { jobs, contacts, settings }.
export async function decodeBackup(text, passphrase) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    throw new Error("Not a valid TalentLedger backup file.");
  }
  if (obj && obj.enc === "AES-GCM") {
    if (!passphrase) throw new Error("This backup is encrypted. Enter its passphrase.");
    obj = await decrypt(obj, passphrase);
  }
  if (!obj || obj.app !== APP || !obj.data) {
    throw new Error("This file is not a TalentLedger backup.");
  }
  const d = obj.data;
  return {
    jobs: Array.isArray(d.jobs) ? d.jobs : [],
    contacts: Array.isArray(d.contacts) ? d.contacts : [],
    settings: d.settings && typeof d.settings === "object" ? d.settings : {},
  };
}

export async function encodeEncrypted(db, passphrase) {
  if (!passphrase) throw new Error("A passphrase is required to encrypt a backup.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const plain = new TextEncoder().encode(JSON.stringify(makeBackup(db)));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain)
  );
  const envelope = {
    app: APP,
    kind: "backup",
    enc: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iter: PBKDF2_ITER,
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(ct),
    exportedAt: new Date().toISOString(),
  };
  return new TextEncoder().encode(JSON.stringify(envelope, null, 2));
}

async function decrypt(env, passphrase) {
  const salt = fromB64(env.salt);
  const iv = fromB64(env.iv);
  const ct = fromB64(env.ct);
  const key = await deriveKey(passphrase, salt, env.iter || PBKDF2_ITER);
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  } catch (e) {
    throw new Error("Wrong passphrase, or the backup file is corrupt.");
  }
  return JSON.parse(new TextDecoder().decode(plain));
}

async function deriveKey(passphrase, salt, iter = PBKDF2_ITER) {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toB64(bytes) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function fromB64(b64) {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
