// The roster's Import / export tab: Novena Sync, a file, Krooster, and exporting.
import { useState } from "preact/hooks";
import { Explain, GuideLink } from "../../components/ui";
import { date } from "../../lib/format";
import { applyImport, importFile, importText } from "../../lib/accountImport";
import { exportRoster, parseRoster } from "../../lib/importers";
import { pref, setPref } from "../../lib/storage";
import { BridgeError, forget, hello, isPaired, pair, SYNC_SERVERS, syncNow } from "../../lib/syncBridge";
import { REPO_URL } from "../../config";
import { href } from "../../lib/router";
import { account, server } from "../../state";
import type { OpIndex } from "../../types";
import { DepotPaste, type Msg } from "./Depot";

const apply = applyImport;

export function Import({ ops }: { ops: OpIndex[] }) {
  const [msg, setMsg] = useState<Msg>(null);
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [over, setOver] = useState(false);
  const s = server.value;
  const onFile = async (f: File) => {
    try {
      setMsg({ ok: true, text: await importFile(f, ops, s, mode) });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  const exportIt = () => {
    const blob = new Blob([JSON.stringify(exportRoster(account.value, s), null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `novena-roster-${s}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  return (
    <div class="grid two">
      <SyncCard ops={ops} />
      <section class="card">
        <div class="card-head"><h2>Import a file</h2><GuideLink m="file" /></div>
        <p>Accepted: a Novena roster file, a Novena Sync file, game sync data (syncData JSON), a saved Krooster profile page, or a depot export from Krooster or Penguin Statistics.</p>
        <p class="muted">For your depot, the easiest way is screenshots: <a href={href("/roster", { tab: "depot" })}>Depot → Import from screenshots</a>.</p>
        <div class="row" style={{ marginBottom: "10px" }}>
          <div class="seg" role="group" aria-label="Import mode">
            <button aria-pressed={mode === "replace"} onClick={() => setMode("replace")}>Replace roster</button>
            <button aria-pressed={mode === "merge"} onClick={() => setMode("merge")}>Merge</button>
          </div>
        </div>
        <label class={`dropzone${over ? " over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer?.files?.[0]; if (f) void onFile(f); }}>
          <span>Drop a file here, or <u>choose one</u></span>
          <input type="file" class="sr-only"
            onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void onFile(f); }} />
        </label>
        {msg && <p role="status" class={msg.ok ? "good-text" : "bad-text"} style={{ marginTop: "8px" }}>{msg.text}</p>}
        <Explain>The file is read in your browser; nothing is uploaded.</Explain>
      </section>
      <KroosterImport ops={ops} mode={mode} />
      <section class="card">
        <div class="card-head"><h2>Export</h2><GuideLink m="move" /></div>
        <p>Download this server's roster and depot as a file you can import elsewhere or keep.</p>
        <button onClick={exportIt} disabled={!Object.keys(account.value.ops).length}>Export roster</button>
      </section>
    </div>
  );
}

/** From Krooster: it has no roster export, but every profile is public. Browsers won't let this page read Krooster
 *  directly, so you bring it over yourself: save your profile page and give Novena the file (the roster is inside it),
 *  or open the profile as text and paste it. */
function KroosterImport({ ops, mode }: { ops: OpIndex[]; mode: "replace" | "merge" }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const user = encodeURIComponent(name.trim().toLowerCase());
  const s = server.value;
  const link = (url: string, label: string) => (
    <a class={`btn small${user ? "" : " disabled"}`} href={user ? url : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!user}>{label}</a>
  );
  const done = (f: () => string | Promise<string>) => async () => {
    try { setMsg({ ok: true, text: await f() }); setText(""); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  return (
    <section class="card krooster">
      <div class="card-head"><h2>From Krooster</h2><GuideLink m="krooster" /></div>
      <label class="field"><span>Your Krooster username</span>
        <input type="text" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="username" autocomplete="off" spellcheck={false} />
      </label>
      <h3>Save your profile page</h3>
      <ol class="steps">
        <li>{link(`https://www.krooster.com/u/${user}`, "Open my Krooster profile")}</li>
        <li>Save the page: Ctrl+S (⌘S on a Mac), then Save. Either "Webpage" type works.</li>
        <li>
          <label class="btn small">Choose the saved file
            <input type="file" class="sr-only" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void done(() => importFile(f, ops, s, mode))(); }} />
          </label>
          <span class="muted"> (the .html one; or drop it on "Import a file")</span>
        </li>
      </ol>
      <h3>Or copy and paste</h3>
      <ol class="steps">
        <li>{link(`https://www.krooster.com/api/u/${user}`, "Open my profile as text")}</li>
        <li>
          Copy all of it:
          <ul class="muted">
            <li>Chrome, Edge, Safari: Ctrl+A, then Ctrl+C (⌘A, ⌘C on a Mac). On a phone: long-press the text, Select all, Copy.</li>
            <li>Firefox: click <em>Raw Data</em> at the top, then <em>Copy</em>.</li>
          </ul>
        </li>
        <li>
          Paste it here:
          <textarea rows={3} aria-label="Paste your Krooster profile here" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder='{"data":{"account":…' spellcheck={false} style={{ marginTop: "6px" }} />
          <button class="primary" disabled={!text.trim()} onClick={done(() => importText(text, ops, s, mode, "That isn't what your Krooster profile shows"))} style={{ marginTop: "8px" }}>Import from Krooster</button>
        </li>
      </ol>
      {msg && <p role="status" class={msg.ok ? "good-text" : "bad-text"} style={{ marginTop: "8px" }}>{msg.text}</p>}
      <h3>Your depot</h3>
      <DepotPaste />
      <Explain>Krooster profiles are public, so no sign-in is needed. The pages open on Krooster's site; Novena only reads the file you choose or the text you paste, in your browser. Profiles don't include the depot, which is why it's a separate step.</Explain>
    </section>
  );
}

/** One-click sync from Novena Sync, the optional desktop app. The page only talks to it when you click. */
function SyncCard({ ops }: { ops: OpIndex[] }) {
  const s = server.value;
  const [stage, setStage] = useState<"start" | "pair" | "ready">(isPaired() ? "ready" : "start");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [asking, setAsking] = useState(false);
  const [noAsk, setNoAsk] = useState(false);
  const supported = SYNC_SERVERS.includes(s);
  const last = Number(pref(`syncedAt.${s}`, "0"));
  const run = async (step: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await step();
    } catch (e) {
      const err = e as BridgeError;
      if (err.code === "not-paired") setStage("pair");
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };
  const connect = () => run(async () => {
    const h = await hello();
    setStage(h.paired ? "ready" : "pair");
  });
  const doPair = () => run(async () => {
    await pair(code);
    setCode("");
    setStage("ready");
    setMsg({ ok: true, text: "Paired. From now on, one click syncs." });
  });
  // A sync signs the player out of the game on their other devices, so it asks first (unless told not to).
  const startSync = () => (pref("syncConfirm", "on") === "off" ? void sync() : setAsking(true));
  const confirmSync = () => {
    if (noAsk) setPref("syncConfirm", "off");
    setAsking(false);
    void sync();
  };
  const sync = () => run(async () => {
    const res = await syncNow(s);
    const r = parseRoster(res.payload, ops);
    const text = apply(r, "replace");
    setPref(`syncedAt.${s}`, String(Date.now()));
    setMsg({ ok: true, text: res.fresh ? text : `${text} That's your sync from moments ago: a fresh one is possible in ${Math.ceil(res.retryAfter / 60)} min.` });
  });
  return (
    <section class="card sync-card" style={{ gridColumn: "1 / -1" }}>
      <div class="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div class="card-head"><h2>Novena Sync <span class="badge">Optional app</span></h2><GuideLink m="sync" /></div>
          <p style={{ maxWidth: "70ch" }}>A small desktop app that signs in to your game account <strong>on your own computer</strong>, reads it, and hands Novena your operators, depot and currencies with one click. This website never sees your login.</p>
        </div>
        <a class="btn" href={`${REPO_URL}/releases/latest`} rel="noopener">Download Novena Sync</a>
      </div>
      {!supported ? <p class="muted">Novena Sync works with the EN, JP and KR servers.</p>
        : stage === "start" ? (
          <div class="row"><button class="primary" onClick={connect} disabled={busy}>{busy ? "Connecting…" : "Connect to Novena Sync"}</button>
            <span class="muted">Open the app first. Your browser may ask to allow access to devices on your network.</span></div>
        ) : stage === "pair" ? (
          <form class="row" onSubmit={(e) => { e.preventDefault(); void doPair(); }}>
            <label class="field"><span>Code shown in Novena Sync</span>
              <input type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} placeholder="000 000" style={{ width: "9em" }} /></label>
            <button class="primary" type="submit" disabled={busy || code.replace(/\D/g, "").length !== 6} style={{ alignSelf: "flex-end" }}>Pair</button>
          </form>
        ) : asking ? (
          <div class="note">
            <p style={{ margin: "0 0 8px" }}><strong>This signs you out of Arknights on your phone or PC</strong> (the game allows one session at a time). If you're in a stage, finish it first.</p>
            <div class="row">
              <button class="primary" onClick={confirmSync}>Sync now</button>
              <button onClick={() => setAsking(false)}>Cancel</button>
              <label class="row tight"><input type="checkbox" checked={noAsk} onChange={(e) => setNoAsk((e.target as HTMLInputElement).checked)} /> Don't ask again</label>
            </div>
          </div>
        ) : (
          <div class="row">
            <button class="primary" onClick={startSync} disabled={busy}>{busy ? "Syncing…" : `Sync ${s.toUpperCase()} now`}</button>
            <span class="muted">{last ? `Last synced ${date(last)}, ${new Date(last).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : "Not synced yet."} Replaces this server's roster and depot.</span>
            <button class="ghost small" onClick={() => { forget(); setStage("start"); setMsg(null); }}>Unpair</button>
          </div>
        )}
      {msg && <p role="status" class={msg.ok ? "good-text" : "bad-text"} style={{ marginTop: "8px" }}>{msg.text}</p>}
      <p class="warn-text" style={{ margin: "10px 0 0" }}>Each sync signs you out of the game on your other devices. Play, close the game, then sync: once or twice a day is plenty. Reopening the game afterwards needs no new code.</p>
      <Explain>Unofficial: the app uses the community's unofficial sign-in, at your own risk, and only reads your account. It never plays or changes the game. Every sync is a sign-in Yostar can see, so sync only as often as you need; syncs are also spaced a few minutes apart.</Explain>
    </section>
  );
}
