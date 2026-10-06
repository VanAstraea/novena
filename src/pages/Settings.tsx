// Settings and the single-file backup. Everything here works on this browser's storage only.
import { useState } from "preact/hooks";
import { Explain, GuideLink } from "../components/ui";
import { clearAll, getItem, keys, setItem, setPref } from "../lib/storage";
import { href, navigate } from "../lib/router";
import { SERVERS, server, theme, type Theme } from "../state";
import type { Server } from "../types";

export const BACKUP_APP = "novena";
const OLD_BACKUP_APPS = ["doctors-toolkit"]; // the working title, before the name Novena

export async function makeBackup() {
  const data: Record<string, unknown> = {};
  for (const k of await keys()) data[k] = await getItem(k);
  return { app: BACKUP_APP, version: 1, exported: new Date().toISOString(), data };
}

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Settings() {
  const [msg, setMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const exportAll = async () => {
    const b = await makeBackup();
    download(`novena-backup-${b.exported.slice(0, 10)}.json`, JSON.stringify(b, null, 1));
    setMsg(`Saved a backup with ${Object.keys(b.data).length} entries.`);
  };

  const importFile = async (file: File) => {
    try {
      const b = JSON.parse(await file.text());
      if ((b?.app !== BACKUP_APP && !OLD_BACKUP_APPS.includes(b?.app)) || typeof b.data !== "object") throw new Error("That isn't a Novena backup file.");
      for (const [k, v] of Object.entries(b.data as Record<string, unknown>)) {
        if (/^(account|targets|prefs)\.(en|jp|kr|cn)$/.test(k)) await setItem(k, v);
      }
      setMsg("Backup restored. Reloading…");
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div class="stack fade-in">
      <h1>Settings & backup</h1>
      <section class="card">
        <div class="card-head"><h2>Your data stays in this browser</h2><GuideLink m="move" label="Moving to another device" /></div>
        <p>Your roster, depot, plans and settings are saved in this browser's storage (local storage and IndexedDB) and nowhere else. There are no accounts, no analytics, no tracking and no cookies. Clearing your browser's site data deletes them, so keep a backup.</p>
        <div class="row">
          <button class="primary" onClick={exportAll}>Export backup</button>
          <label class="btn">Import backup<input type="file" accept="application/json,.json" class="sr-only"
            onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void importFile(f); }} /></label>
          {!confirmDelete
            ? <button onClick={() => setConfirmDelete(true)}>Delete all my data…</button>
            : <><button class="primary" style={{ background: "var(--bad)", borderColor: "var(--bad)" }}
              onClick={async () => { await clearAll(); setMsg("Deleted. Reloading…"); setTimeout(() => location.reload(), 600); }}>Yes, delete everything</button>
              <button class="ghost" onClick={() => setConfirmDelete(false)}>Cancel</button></>}
        </div>
        {msg && <p role="status" style={{ marginTop: "8px" }}>{msg}</p>}
        <Explain>The backup is one JSON file with every server's roster, depot, planner targets and preferences. Importing replaces what's saved for the servers it contains.</Explain>
      </section>
      <section class="card">
        <h2>Display</h2>
        <div class="row">
          <label class="field"><span>Server</span>
            <select value={server.value} onChange={(e) => (server.value = (e.target as HTMLSelectElement).value as Server)}>
              {SERVERS.map((s) => <option key={s.id} value={s.id}>{s.long}</option>)}
            </select>
          </label>
          <label class="field"><span>Theme</span>
            <select value={theme.value} onChange={(e) => (theme.value = (e.target as HTMLSelectElement).value as Theme)}>
              <option value="system">Follow my device</option><option value="dark">Dark</option><option value="light">Light</option>
            </select>
          </label>
        </div>
        <Explain>The server sets operator names, what's available, drop rates, reset times and upcoming dates. Each server keeps its own roster.</Explain>
        <p style={{ marginTop: "12px" }}>
          <button onClick={() => { setPref("introSeen", ""); navigate(href("/", { intro: 1 })); }}>Play the intro again</button>
        </p>
      </section>
    </div>
  );
}
