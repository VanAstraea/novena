// Talking to Novena Sync, the optional desktop app, over 127.0.0.1 on the player's own computer. The website never
// sees a login: the app signs in and reads the account itself, then hands over a cut-down copy (operators, depot,
// currencies). Requests only start from a click (browsers may ask permission to reach this device), and syncs need a
// key the page gets once by entering the six-digit code the app shows.
import { pref, setPref } from "./storage";

const BRIDGE = "http://127.0.0.1:47615";
export const SYNC_SERVERS = ["en", "jp", "kr"];
const KEY = "syncKey";

export class BridgeError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}, timeout = 4000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const key = pref(KEY, "");
  let res: Response;
  try {
    res = await fetch(BRIDGE + path, {
      ...init, signal: ctrl.signal, cache: "no-store",
      // tells Chrome up front that this request is for the player's own computer, so it asks for "Local network access"
      // instead of failing; other browsers ignore it
      ...({ targetAddressSpace: "loopback" } as RequestInit),
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    });
  } catch {
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    throw new BridgeError(local
      ? "Couldn't reach Novena Sync. Is it open on this computer?"
      : "Couldn't reach Novena Sync. Is it open on this computer? If it is, your browser is blocking this page from reaching it: click the icon at the left of the address bar, open Site settings, set \"Local network access\" to Allow, then reload and connect again.", "unreachable");
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) setPref(KEY, "");
    throw new BridgeError(body.message || `Novena Sync answered ${res.status}.`, body.error || String(res.status));
  }
  return body as T;
}

export const isPaired = () => !!pref(KEY, "");

export function hello() {
  return call<{ app: string; version: string; paired: boolean; allow?: boolean; signedIn?: string[] }>("/v1/hello");
}

export async function pair(code: string): Promise<void> {
  const { key } = await call<{ key: string }>("/v1/pair", { method: "POST", body: JSON.stringify({ code: code.replace(/\D/g, "") }) });
  setPref(KEY, key);
}

export function syncNow(server: string) {
  return call<{ payload: unknown; fresh: boolean; retryAfter: number }>("/v1/sync", { method: "POST", body: JSON.stringify({ server }) }, 95_000);
}

export function forget(): void {
  setPref(KEY, "");
}
