// Everything with a clock, from the last Novena Sync and the sanity timer: listed on Today, and (when asked for)
// announced with a browser notification while a Novena tab is open. Nothing is sent anywhere.
import { effect, signal } from "@preact/signals";
import { pref, setPref } from "./storage";
import { account, dronesFullAt, server, type Account } from "../state";

export interface TimerRow { key: string; at: number; what: string; note?: string; alert?: string }

export function timerRows(a: Account, s: string): TimerRow[] {
  const rows: TimerRow[] = [];
  for (const sl of a.recruit || []) {
    if (sl.start > 0 && sl.finish > 0) rows.push({ key: `r${sl.slot}:${sl.finish}`, at: sl.finish * 1000, what: `Recruitment, slot ${sl.slot + 1}`, alert: `Recruitment slot ${sl.slot + 1} is ready to collect.` });
  }
  for (const r of a.base?.rooms || []) {
    if (r.room === "MANUFACTURE" && r.done && r.done > 0) {
      rows.push({ key: `f${r.slot}:${r.done}`, at: r.done * 1000, what: "Factory stops", note: r.capacity ? `${r.made ?? 0} / ${r.capacity} made at sync` : undefined, alert: "A factory has stopped: collect and restart it." });
    }
    if (r.room === "TRADING" && r.limit && (r.orders ?? 0) >= r.limit) rows.push({ key: `t${r.slot}`, at: 0, what: "Trading Post is full", note: "deliver its orders" });
  }
  const d = a.base?.drones;
  if (d && d.max) rows.push({ key: `d:${d.ts}`, at: dronesFullAt(d), what: "Drones full", note: d.value < d.max ? "about" : undefined, alert: "Your drones are full: use them on a Trading Post or a Factory." });
  try {
    const sv = JSON.parse(pref(`sanity.${s}`, "{}"));
    if (sv.at && sv.cap) rows.push({ key: "sanity", at: sv.value >= sv.cap ? 0 : sv.at + (sv.cap - sv.value) * 360_000, what: "Sanity full" }); // sanity has its own notification
  } catch { /* no sanity saved */ }
  return rows.sort((x, y) => x.at - y.at);
}

/** Notify for recruitment, factories and drones (the sanity timer has its own switch). */
export const timerAlerts = signal(pref("timerAlerts", "") === "1");

export async function setTimerAlerts(on: boolean): Promise<boolean> {
  if (on) {
    if (typeof Notification === "undefined") return false;
    on = Notification.permission === "granted" || (await Notification.requestPermission()) === "granted";
  }
  timerAlerts.value = on;
  setPref("timerAlerts", on ? "1" : "");
  return on;
}

let timeouts: number[] = [];
/** Started once by the app: keeps one pending notification per future timer, redone whenever the account changes. */
export function watchTimers() {
  effect(() => {
    timeouts.forEach(clearTimeout);
    timeouts = [];
    const on = timerAlerts.value, a = account.value, s = server.value;
    if (!on || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const now = Date.now();
    for (const r of timerRows(a, s)) {
      if (!r.alert || r.at <= now || r.at - now > 2 ** 31 - 1) continue;
      timeouts.push(window.setTimeout(() => new Notification("Novena", { body: `${r.alert} (${s.toUpperCase()})`, tag: r.key, icon: `${import.meta.env.BASE_URL}novena-mark.svg` }), r.at - now));
    }
  });
}
