// App-wide state: the chosen server and theme, and the user's own data (roster, depot, plans), kept per server in
// this browser only.
import { computed, effect, signal } from "@preact/signals";
import type { Server } from "./types";
import { getItem, pref, setItem, setPref } from "./lib/storage";

export const SERVERS: { id: Server; label: string; long: string }[] = [
  { id: "en", label: "EN", long: "Global (EN)" },
  { id: "jp", label: "JP", long: "Japan" },
  { id: "kr", label: "KR", long: "Korea" },
  { id: "cn", label: "CN", long: "China" },
];

const urlServer = new URLSearchParams(location.search).get("s");
const initial = (SERVERS.some((s) => s.id === urlServer) ? urlServer : pref("server", "en")) as Server;
export const server = signal<Server>(SERVERS.some((s) => s.id === initial) ? initial : "en");
effect(() => setPref("server", server.value));

export type Theme = "system" | "light" | "dark";
export const theme = signal<Theme>(pref("theme", "system") as Theme);
effect(() => {
  const t = theme.value;
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  setPref("theme", t);
});

// --- the user's account data ----------------------------------------------------------------------------------

export interface RosterOp {
  id: string;
  elite: number;
  level: number;
  pot: number; // 1-6
  skillLevel: number; // 1-7
  masteries: number[]; // per skill, 0-3
  modules: Record<string, number>; // letter -> stage 0-3
}

export interface Snapshot {
  t: number;
  ops: number;
  e2: number;
  m3: number;
  mods: number;
}

export interface Account {
  ops: Record<string, RosterOp>;
  depot: Record<string, number>;
  updated: number;
  source?: string; // "manual" | "import"
  snapshots: Snapshot[];
  savings?: { orundum: number; prime: number; permits: number; card: boolean };
}

export interface PlanTarget {
  id: string; // char id
  text: string; // as typed: "E2 L90, S2 M3, Mod X2"
}

export interface Prefs {
  daily: number; // sanity a day to plan with
  excluded: string[]; // stage ids the user can't auto-deploy yet
  useDepot: boolean;
}

const emptyAccount = (): Account => ({ ops: {}, depot: {}, updated: 0, snapshots: [] });

export const account = signal<Account>(emptyAccount());
export const targets = signal<PlanTarget[]>([]);
export const prefs = signal<Prefs>({ daily: 240, excluded: [], useDepot: true });
export const loaded = signal(false);

export const hasRoster = computed(() => Object.keys(account.value.ops).length > 0);

let loadingFor: Server | null = null;
async function loadFor(s: Server) {
  loadingFor = s;
  loaded.value = false;
  const [a, t, p] = await Promise.all([
    getItem<Account>(`account.${s}`), getItem<PlanTarget[]>(`targets.${s}`), getItem<Prefs>(`prefs.${s}`),
  ]);
  if (loadingFor !== s) return;
  account.value = { ...emptyAccount(), ...(a || {}) };
  targets.value = t || [];
  prefs.value = { daily: 240, excluded: [], useDepot: true, ...(p || {}) };
  loaded.value = true;
}
effect(() => void loadFor(server.value));

export function saveAccount(a: Account): void {
  account.value = a;
  void setItem(`account.${server.value}`, a);
}

export function saveTargets(t: PlanTarget[]): void {
  targets.value = t;
  void setItem(`targets.${server.value}`, t);
}

export function savePrefs(p: Prefs): void {
  prefs.value = p;
  void setItem(`prefs.${server.value}`, p);
}

/** Add a snapshot of the roster's progress if today has none yet (or replace today's). */
export function snapshotOf(a: Account): Account {
  const ops = Object.values(a.ops);
  const snap: Snapshot = {
    t: Date.now(), ops: ops.length, e2: ops.filter((o) => o.elite >= 2).length,
    m3: ops.reduce((n, o) => n + o.masteries.filter((m) => m >= 3).length, 0),
    mods: ops.reduce((n, o) => n + Object.values(o.modules).filter((m) => m > 0).length, 0),
  };
  const day = new Date(snap.t).toDateString();
  const rest = a.snapshots.filter((s) => new Date(s.t).toDateString() !== day);
  return { ...a, snapshots: [...rest, snap].slice(-365) };
}
