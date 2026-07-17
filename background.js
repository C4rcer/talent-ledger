// Keeps the toolbar badge showing how many contacts are awaiting a reply past
// the follow-up window. Recomputes on startup, when storage changes, and on a
// slow alarm (so the count still advances as days pass with the popup closed).

import { normalizeDb, countOverdue } from "./lib/model.js";

const B = globalThis.browser ?? globalThis.chrome;
const ALARM = "tl-followups";

async function refreshBadge() {
  try {
    const raw = await B.storage.local.get({ jobs: [], contacts: [], ui: {}, settings: {} });
    const db = normalizeDb(raw);
    const n = countOverdue(db);
    const action = B.action ?? B.browserAction;
    await action.setBadgeText({ text: n ? String(n) : "" });
    if (action.setBadgeBackgroundColor) {
      await action.setBadgeBackgroundColor({ color: "#c98a12" });
    }
    if (action.setBadgeTextColor) {
      await action.setBadgeTextColor({ color: "#ffffff" });
    }
    if (action.setTitle) {
      await action.setTitle({
        title: n
          ? `TalentLedger: ${n} contact${n === 1 ? "" : "s"} due for follow-up`
          : "TalentLedger",
      });
    }
  } catch (e) {
    // storage not ready or API missing; the next trigger will retry
  }
}

B.runtime.onInstalled.addListener(refreshBadge);
B.runtime.onStartup?.addListener(refreshBadge);
B.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") refreshBadge();
});
B.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) refreshBadge();
});

B.alarms.create(ALARM, { periodInMinutes: 180 });
refreshBadge();
