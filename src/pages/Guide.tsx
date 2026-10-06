// The import guide: every way to bring an account into Novena, compared at the top and then step by step, one tab per
// way (?m=sync opens that one). The steps follow the Roster page's Import / export and Depot tabs and Novena Sync.
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { Explain, Tabs } from "../components/ui";
import { SYNC_SERVERS } from "../lib/syncBridge";
import { href, route, setQuery } from "../lib/router";
import { REPO_URL } from "../config";

type Way = "sync" | "krooster" | "planner" | "file" | "screenshots" | "hand" | "move";

const WAYS: { key: Way; tab: string; name: string; brings: string[]; effort: string; needs: string }[] = [
  { key: "sync", tab: "Novena Sync", name: "Novena Sync app", brings: ["Roster", "Depot", "Currencies", "Base", "Recruitment", "Sanity"],
    effort: "Set up once, then one click", needs: `A Windows or Mac computer, and a game account with a bound email (${SYNC_SERVERS.map((s) => s.toUpperCase()).join(", ")})` },
  { key: "krooster", tab: "Krooster", name: "Krooster profile", brings: ["Roster", "Depot (second paste)"],
    effort: "A few steps each time", needs: "Your roster kept up to date on Krooster" },
  { key: "planner", tab: "Planner depot", name: "Depot from Krooster or Penguin Statistics", brings: ["Depot"],
    effort: "Copy and paste", needs: "Your depot kept in Krooster's or Penguin Statistics' planner" },
  { key: "file", tab: "Sync data file", name: "Game sync data file", brings: ["Roster", "Depot", "Currencies", "Recruitment", "Sanity"],
    effort: "Drop a file", needs: "A syncData file saved by another community tool" },
  { key: "screenshots", tab: "Screenshots", name: "Depot screenshots", brings: ["Depot"],
    effort: "A few screenshots", needs: "The game, on any device" },
  { key: "hand", tab: "By hand", name: "By hand", brings: ["Roster", "Depot"],
    effort: "Longest the first time, then quick edits", needs: "Nothing: no sign-in, no risk" },
  { key: "move", tab: "Another device", name: "Another browser or device", brings: ["Everything saved here"],
    effort: "Export, then import", needs: "Novena open in both browsers" },
];

const isWay = (k: string | null): k is Way => WAYS.some((w) => w.key === k);

export default function Guide() {
  const m = route.value.query.get("m");
  const way: Way = isWay(m) ? m : "sync";
  const top = useRef<HTMLDivElement>(null);
  const reveal = (smooth: boolean) => top.current?.scrollIntoView({ block: "start", behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" });
  // opened at a way (from an import card's "Step-by-step guide"): go straight to its steps
  useEffect(() => { if (isWay(m)) reveal(false); }, []);
  const open = (k: Way) => { setQuery({ m: k }); reveal(true); };
  return (
    <div class="stack fade-in">
      <div>
        <h1>Import guide</h1>
        <p class="muted">Every way to bring your account into Novena, step by step. Whichever you pick, what you bring stays in this browser: Novena has no server and no accounts.</p>
      </div>
      <section class="card">
        <h2>Which way is for you?</h2>
        <ul class="guide-ways">
          {WAYS.map((w) => (
            <li key={w.key} class={w.key === way ? "on" : ""}>
              <a href={href("/guide", { m: w.key })} aria-current={w.key === way ? "true" : undefined} onClick={(e) => { e.preventDefault(); open(w.key); }}>{w.name}</a>
              <span class="guide-brings"><span class="sr-only">Brings: </span>{w.brings.map((b) => <span key={b} class="badge">{b}</span>)}</span>
              <dl><dt>Effort</dt><dd>{w.effort}</dd><dt>You need</dt><dd>{w.needs}</dd></dl>
            </li>
          ))}
        </ul>
        <Explain>Mix them as you like: Novena Sync or a Krooster profile for operators, screenshots or a planner for the depot, and a quick edit by hand for anything that changed since. Your base comes only with Novena Sync; recruitment slots and sanity with Novena Sync or a sync data file.</Explain>
      </section>
      <div ref={top} class="guide-top">
        <Tabs label="Ways to import" value={way} onChange={(k) => setQuery({ m: k })} tabs={WAYS.map((w) => ({ key: w.key, label: w.tab }))} />
        <section class="card guide">
          {way === "sync" ? <SyncSteps /> : way === "krooster" ? <KroosterSteps /> : way === "planner" ? <PlannerSteps />
            : way === "file" ? <FileSteps /> : way === "screenshots" ? <ScreenshotSteps /> : way === "hand" ? <HandSteps /> : <MoveSteps />}
        </section>
      </div>
    </div>
  );
}

/** Where to do it: the button that ends each way's steps. */
function Go({ children }: { children: ComponentChildren }) {
  return <div class="row guide-go">{children}</div>;
}

const IMPORT = href("/roster", { tab: "import" });
const DEPOT = href("/roster", { tab: "depot" });

function SyncSteps() {
  const names = SYNC_SERVERS.map((s) => s.toUpperCase());
  const servers = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join("");
  return (
    <>
      <h2>Novena Sync</h2>
      <p>A small, optional app for your computer. It signs in to your game account <strong>on your own computer</strong>, reads it, and hands this page a copy with one click. Works with the {servers} servers (Yostar accounts).</p>
      <p class="note">Unofficial: the app uses the community's unofficial sign-in, at your own risk. It only reads your account; it never plays or changes the game. <strong>Each sync signs you out of the game on your other devices</strong>, so play, close the game, then sync.</p>

      <h3>1. Set up the app (once)</h3>
      <ol class="steps">
        <li>Download the zip for Windows or macOS from the <a href={`${REPO_URL}/releases/latest`} rel="noopener">latest release on GitHub</a>, unzip it and open <strong>Novena Sync</strong>. Windows may say it's unrecognised (it isn't code-signed yet): choose <em>More info</em>, then <em>Run anyway</em>. On a Mac: right-click the app, then <em>Open</em>.</li>
        <li>Read the notice, tick <em>I understand the risk</em> and press <em>Continue</em>.</li>
        <li>Pick your server, enter your Yostar account email and press <em>Send code</em>. Enter the code Yostar emails you, then <em>Sign in</em>.</li>
      </ol>
      <p class="note"><strong>Sign in to the game with Google, Apple, Facebook or as a guest?</strong> First bind an email in the game: User Center → <em>Bind Email</em> (the option that sends you a code). Then use only that email: with an email that isn't bound, the game makes a new, empty account for it instead of finding yours.</p>
      <p class="muted">Your email and the code are never stored. The session they create is kept in your computer's credential store (Windows Credential Manager, macOS Keychain) until you sign out. Nothing goes to a Novena server: there isn't one.</p>

      <h3>2. Pair this browser (once)</h3>
      <ol class="steps">
        <li>With the app open, open <a href={IMPORT}>My roster → Import / export</a> in a browser on the same computer and press <em>Connect to Novena Sync</em>.</li>
        <li>Chrome may ask to let this page reach devices on your local network: allow it. Said no by mistake? Click the icon at the left of the address bar, open <em>Site settings</em>, set <em>Local network access</em> to Allow, then reload and connect again.</li>
        <li>Type the six-digit code the app shows under <em>Sync from Novena in your browser</em> and press <em>Pair</em>.</li>
      </ol>

      <h3>3. Sync</h3>
      <ol class="steps">
        <li>Play, close the game, then press <em>Sync EN now</em> (or your server) on the same card. It asks first (you can turn that off), then replaces this server's roster and depot. Once or twice a day is plenty; reopening the game afterwards needs no new code.</li>
        <li>No browser link? <em>Sync now</em> in the app also saves <code>novena-sync-&lt;server&gt;.json</code> in <code>Documents/Novena Sync</code> (while <em>Also save it as a file</em> is ticked). Drop that file on <em>Import a file</em>.</li>
      </ol>
      <p><strong>Brings:</strong> your operators (level, promotion, potential, skills, masteries, modules and the outfit each one wears), the depot and LMD, Orundum, Originite Prime and permits, training vouchers and sanity potions (with when they expire), recruitment slots, the base (rooms, levels, teams, morale, production, drones) and your sanity. Not your nickname, ids, friends, mail or purchases.</p>
      <details class="explain-fold">
        <summary>If it doesn't connect</summary>
        <ul class="explain">
          <li>"Couldn't reach Novena Sync": check the app is open on this computer, then the <em>Local network access</em> setting above.</li>
          <li>"Browser syncs are switched off": in the app, tick <em>Let paired pages ask for a sync while this app is open</em>.</li>
          <li>Asked to pair again: the pairing was removed (<em>Unpair</em> here, or <em>Forget all</em> in the app). Enter the code the app shows now.</li>
          <li>A sync within three minutes of the last one returns that one; the message says when a fresh one is possible.</li>
        </ul>
      </details>
      <Go>
        <a class="btn primary" href={IMPORT}>Go to Novena Sync</a>
        <a class="btn" href={`${REPO_URL}/releases/latest`} rel="noopener">Download the app</a>
      </Go>
    </>
  );
}

/** Copying a depot out of Krooster's planner: the same steps on the Krooster card and the Depot tab. */
function KroosterDepot() {
  return (
    <ol class="steps">
      <li>On Krooster, open <a href="https://www.krooster.com/data/planner" target="_blank" rel="noopener noreferrer">Planner</a>, click the gear on the materials list, then <em>Export/Import</em>.</li>
      <li>Set <em>Export format</em> to Penguin-Stats (CSV works too) and press the copy button.</li>
      <li>Paste it in the depot box (under <em>Your depot</em> on the From Krooster card, or <em>From another planner</em> on the Depot tab) and press <em>Update my depot</em>.</li>
    </ol>
  );
}

function KroosterSteps() {
  return (
    <>
      <h2>From Krooster</h2>
      <p>Krooster has no roster export, but every profile is public, so no sign-in is needed. Browsers don't let Novena read Krooster directly, so you bring your profile over yourself, one of two ways. Both are on the <a href={IMPORT}>From Krooster</a> card: type your Krooster username there first, and its buttons open your profile on Krooster's site.</p>
      <h3>Save your profile page</h3>
      <ol class="steps">
        <li>Press <em>Open my Krooster profile</em> (krooster.com/u/&lt;username&gt;).</li>
        <li>Save the page: <kbd>Ctrl</kbd>+<kbd>S</kbd> (<kbd>⌘</kbd>+<kbd>S</kbd> on a Mac), then Save. Either "Webpage" type works.</li>
        <li>Back on Novena, press <em>Choose the saved file</em> and pick the .html one (or drop it on <em>Import a file</em>).</li>
      </ol>
      <h3>Or copy and paste</h3>
      <ol class="steps">
        <li>Press <em>Open my profile as text</em> (krooster.com/api/u/&lt;username&gt;).</li>
        <li>Copy all of it. Chrome, Edge, Safari: <kbd>Ctrl</kbd>+<kbd>A</kbd>, then <kbd>Ctrl</kbd>+<kbd>C</kbd> (<kbd>⌘</kbd>A, <kbd>⌘</kbd>C on a Mac); on a phone, long-press the text, Select all, Copy. Firefox: click <em>Raw Data</em> at the top, then <em>Copy</em>.</li>
        <li>Paste it in the box and press <em>Import from Krooster</em>.</li>
      </ol>
      <p class="muted">Either way follows the <em>Replace roster</em> or <em>Merge</em> choice on the Import a file card. Outfits don't come over from Krooster.</p>
      <h3>Your depot</h3>
      <p>Profiles don't include the depot, so it's a separate paste. Only the items it lists change; your roster stays.</p>
      <KroosterDepot />
      <Go>
        <a class="btn primary" href={IMPORT}>Go to From Krooster</a>
        <a class="btn" href={DEPOT}>Paste a depot</a>
      </Go>
    </>
  );
}

function PlannerSteps() {
  return (
    <>
      <h2>Depot from Krooster or Penguin Statistics</h2>
      <p>Kept your depot in another planner? Bring it over without screenshots. Only the items the export lists change (an item at 0 is removed); the rest of your depot and your roster stay.</p>
      <h3>From Krooster's planner</h3>
      <KroosterDepot />
      <h3>From Penguin Statistics' planner</h3>
      <ol class="steps">
        <li>Use the planner's export and copy the text. It starts with <code>{'{"@type":"@penguin-statistics/planner/config"'}</code>.</li>
        <li>Paste it under <em>From another planner</em> on the Depot tab and press <em>Update my depot</em>. Saved it as a file instead? Drop it on <em>Import a file</em>.</li>
      </ol>
      <p class="muted">A message says how many items changed, with <em>Undo</em> for a few seconds. The text is read in your browser; nothing is uploaded.</p>
      <Go><a class="btn primary" href={DEPOT}>Go to the Depot tab</a></Go>
    </>
  );
}

function FileSteps() {
  return (
    <>
      <h2>A game sync data file</h2>
      <p>Some community tools save your account's sync data (the game's <code>syncData</code>, as JSON). Novena reads that file.</p>
      <ol class="steps">
        <li>Set the server at the top right to the account's server: Novena can't tell it from this file.</li>
        <li>On <a href={IMPORT}>Import / export</a>, choose <em>Replace roster</em> (swap in the file's roster and depot) or <em>Merge</em> (add the file's operators to yours; where both have one, the file's wins).</li>
        <li>Drop the file on <em>Import a file</em>, or click to choose it. The box on the Home page takes it too.</li>
      </ol>
      <p><strong>Brings:</strong> your operators (with their outfits), the depot and LMD, currencies, training vouchers and sanity potions, recruitment slots and sanity. The base comes only with Novena Sync.</p>
      <h3>Everything Import a file reads</h3>
      <ul>
        <li>Game sync data (syncData JSON), and Novena Sync's own file.</li>
        <li>A Novena roster file, from <em>Export roster</em> in another browser (<a href={href("/guide", { m: "move" })}>moving devices</a>).</li>
        <li>A saved Krooster profile page (<a href={href("/guide", { m: "krooster" })}>Krooster</a>).</li>
        <li>A depot export from Krooster or Penguin Statistics (<a href={href("/guide", { m: "planner" })}>planner depot</a>).</li>
      </ul>
      <p class="muted">The file is read in your browser; nothing is uploaded. Operators this server doesn't have yet are skipped, and the message says how many. Replacing a roster can be undone from the message for a few seconds.</p>
      <Go><a class="btn primary" href={IMPORT}>Go to Import a file</a></Go>
    </>
  );
}

function ScreenshotSteps() {
  return (
    <>
      <h2>Depot from screenshots</h2>
      <p>Take screenshots of your in-game Depot and Novena reads the items and counts. You check them before anything changes.</p>
      <ol class="steps">
        <li>In the game, open the <strong>Depot</strong> and pick <strong>Growth Materials</strong> (or <strong>All</strong>).</li>
        <li>Take a screenshot, scroll so new items show, take another. Overlap is fine; take as many as you need.</li>
        <li>On the <a href={DEPOT}>Depot tab</a>, drop them on <em>Import from screenshots</em>, click to choose them, or paste one with <kbd>Ctrl</kbd>+<kbd>V</kbd>. On a phone, choose them from your photos. The first time, Novena takes a few seconds to prepare the item pictures.</li>
        <li>Check what was read. Items it isn't sure of come first, marked "Check the item" or "Check the count", and stay unticked until you tick them. Fix an item or count right in the list.</li>
        <li>Press <em>Update … items in my depot</em>. Only the ticked items change; <em>Undo</em> puts them back.</li>
      </ol>
      <p class="muted">Screenshots are read on your device by an image-matching library (Arknights Toolbox's open-source depot recogniser) and never uploaded. Nothing touches the game: you take the screenshots yourself.</p>
      <Go><a class="btn primary" href={DEPOT}>Go to the Depot tab</a></Go>
    </>
  );
}

function HandSteps() {
  return (
    <>
      <h2>By hand</h2>
      <p>The risk-free way: nothing to install, nothing to sign in to. Everything is saved as you go.</p>
      <ol class="steps">
        <li>Open <a href={href("/roster")}>My roster</a>. An empty roster opens straight into adding; otherwise press <em>Edit roster</em>.</li>
        <li>Type a name under <em>Add an operator</em> and pick it. <em>Add all 1–3★</em> and <em>Add all 4★</em> add every one on this server you don't have yet. Operators you add appear at the top.</li>
        <li>Set promotion, level, potential and skill level from the dropdowns. Masteries and modules: click an icon to raise it (it sets E2 and SL7 for you), <kbd>Shift</kbd>+click or right-click to lower it.</li>
        <li>To change many at once, tick them, or filter (name, rarity, class) and tick the header to take every one shown. The bar that appears sets promotion, level, potential, skill level, masteries and modules for all of them, as far as each one's rarity allows.</li>
        <li>Press <em>Done editing</em> when you're finished.</li>
      </ol>
      <p class="muted">Changes to many operators and removals can be undone from the message that appears. For the depot, type what you hold on the <a href={DEPOT}>Depot tab</a> (<em>Show every item</em> lists the rest).</p>
      <Go>
        <a class="btn primary" href={href("/roster")}>Go to My roster</a>
        <a class="btn" href={DEPOT}>Type in the depot</a>
      </Go>
    </>
  );
}

function MoveSteps() {
  return (
    <>
      <h2>Another browser or device</h2>
      <p>Novena has no accounts, so nothing moves between browsers by itself: you carry a file over (a cable, a cloud drive, an email to yourself).</p>
      <h3>One server's roster</h3>
      <ol class="steps">
        <li>On <a href={IMPORT}>Import / export</a>, press <em>Export roster</em>. It saves this server's roster, depot and currencies as <code>novena-roster-&lt;server&gt;-&lt;date&gt;.json</code>.</li>
        <li>In the other browser, open Import / export, choose <em>Replace roster</em> or <em>Merge</em>, and drop the file on <em>Import a file</em>. A file from another server asks you to switch to it first (top right).</li>
      </ol>
      <h3>Everything</h3>
      <ol class="steps">
        <li>On <a href={href("/settings")}>Settings &amp; backup</a>, press <em>Export backup</em>: one file with every server's roster, depot, planner targets and preferences.</li>
        <li>In the other browser, open Settings &amp; backup and press <em>Import backup</em>. It replaces what's saved for the servers in the file, then reloads.</li>
      </ol>
      <p class="muted">Clearing your browser's site data deletes what Novena saved, so a backup now and then is worth it.</p>
      <Go>
        <a class="btn primary" href={IMPORT}>Export or import a roster</a>
        <a class="btn" href={href("/settings")}>Settings &amp; backup</a>
      </Go>
    </>
  );
}
