// A tree test of a proposed menu layout, before it's built: players get a task, tap through the menus as plain text
// and say where they'd look. Not linked from anywhere; shared by link. Nothing is sent: each participant copies a
// short code at the end and pastes it where they found the link, and /navtest?tally adds the codes up.
import { useMemo, useRef, useState } from "preact/hooks";
import { encode, findCodes, places, tally, type NavNode, type Often, type Place, type TaskResult } from "../lib/navtest";
import { route } from "../lib/router";
import { pref, setPref } from "../lib/storage";

// Bump when the tree or the tasks change, so codes from different versions aren't added up together.
const VERSION = 1;

/** The proposed menus. Top-level items with children are menus; anything under them can be chosen, and a page's
 *  children are its tabs. Text only, so the test measures the labels. */
const TREE: NavNode[] = [
  { label: "Today" },
  { label: "My account", children: [
    { label: "Roster", children: [{ label: "Operators" }, { label: "Depot" }, { label: "To use" }, { label: "History" }] },
    { label: "Base" },
  ] },
  { label: "Plan", children: [
    { label: "1 Priorities", children: [{ label: "By archetype" }] },
    { label: "2 Goals & materials" },
    { label: "3 Farming", children: [{ label: "Today's runs" }] },
  ] },
  { label: "Operators", children: [{ label: "Database" }, { label: "Compare" }, { label: "Rankings" }] },
  { label: "Events", children: [{ label: "Now & upcoming" }, { label: "Banners & pulls" }, { label: "Story & archives" }, { label: "Contingency Contract" }] },
  { label: "Tools", children: [{ label: "Recruitment" }, { label: "Integrated Strategies" }] },
  { label: "Footer", children: [{ label: "Import guide" }, { label: "Settings & backup" }, { label: "About" }, { label: "Credits" }] },
];

/** The tasks, numbered by their place here (that number is in the codes: add new ones at the end). Each right answer
 *  is a path of labels; choosing it or anything under it counts as found. */
const TASKS: { text: string; answers: string[][] }[] = [
  { text: "Find which operators you should raise next.", answers: [["Plan", "1 Priorities"]] },
  { text: "Find out what to spend today's sanity on.", answers: [["Plan", "3 Farming", "Today's runs"], ["Today"]] },
  { text: "Check when the next limited banner is expected and how much to save.", answers: [["Events", "Banners & pulls"]] },
  { text: "See which free operators from Side Stories you're still missing.", answers: [["Events", "Story & archives"]] },
  { text: "Bring your account in from Krooster.", answers: [["Footer", "Import guide"], ["My account", "Roster"]] },
  { text: "Compare two operators' skills side by side.", answers: [["Operators", "Compare"]] },
  { text: "See which kinds of operators (archetypes) your roster is weak in.", answers: [["Plan", "1 Priorities", "By archetype"]] },
  { text: "Plan who works where in your base.", answers: [["My account", "Base"]] },
];

const PLACES = places(TREE);
const PLACE_OF = new Map<NavNode, Place>(PLACES.map((p) => [p.node, p]));
const where = (p: Place) => p.path.join(" › ");

const RIGHT: Place[][] = TASKS.map((t) => t.answers.map((path) => {
  const p = PLACES.find((x) => x.path.join("\n") === path.join("\n"));
  if (!p) throw new Error(`navtest: no "${path.join(" › ")}" in the tree`);
  return p;
}));
const isRight = (task: number, p: Place) =>
  RIGHT[task - 1].some((r) => r.path.length <= p.path.length && r.path.every((label, i) => p.path[i] === label));
/** Per task number, the top-level items a right answer sits under. */
const FIRST_RIGHT: Record<number, number[]> = Object.fromEntries(RIGHT.map((rs, i) => [i + 1, [...new Set(rs.map((r) => r.top))]]));

const OFTEN: [Often, string][] = [["d", "Daily"], ["w", "Weekly"], ["r", "Rarely"]];

interface Progress {
  often: Often;
  order: number[]; // task numbers, shuffled for each participant
  results: TaskResult[];
}

// Kept in this browser only so a reload doesn't lose the answers so far.
function load(): Progress | null {
  try {
    const p = JSON.parse(pref("navtest", "")) as Progress;
    return p && Array.isArray(p.order) && Array.isArray(p.results) ? p : null;
  } catch {
    return null;
  }
}

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function NavTest() {
  if (route.value.query.has("tally")) return <TallyView />;
  return <Test />;
}

function Test() {
  const [progress, setProgress] = useState<Progress | null>(load);
  const save = (p: Progress | null) => {
    setProgress(p);
    setPref("navtest", p ? JSON.stringify(p) : "");
  };
  if (!progress) return <Start onStart={(often) => save({ often, order: shuffled(TASKS.length), results: [] })} />;
  const step = progress.results.length;
  if (step >= progress.order.length) return <Done progress={progress} onRestart={() => save(null)} />;
  const task = progress.order[step];
  return (
    <TaskView key={`${step}-${task}`} step={step} task={task}
      onAnswer={(r) => save({ ...progress, results: [...progress.results, r] })} />
  );
}

function Start({ onStart }: { onStart: (often: Often) => void }) {
  const [often, setOften] = useState<Often>("x");
  return (
    <div class="stack fade-in">
      <h1>Help test Novena's menus</h1>
      <section class="card">
        <p>This is {TASKS.length} quick tasks, about 3 minutes. Each one asks where you'd look for something in a new menu layout, which helps decide how Novena's menus are organised. It's the menus being tested, not you.</p>
        <p><strong>Nothing is sent anywhere.</strong> At the end you'll get a short code to paste as a reply where you found the link.</p>
      </section>
      <section class="card">
        <h2>One warm-up question (optional)</h2>
        <p>How often do you use Arknights companion sites?</p>
        <div class="seg" role="group" aria-label="How often you use companion sites">
          {OFTEN.map(([id, label]) => (
            <button key={id} aria-pressed={often === id} onClick={() => setOften(often === id ? "x" : id)}>{label}</button>
          ))}
        </div>
      </section>
      <div><button class="primary" onClick={() => onStart(often)}>Start</button></div>
    </div>
  );
}

function TaskView({ step, task, onAnswer }: { step: number; task: number; onAnswer: (r: TaskResult) => void }) {
  const [open, setOpen] = useState<NavNode[]>([]); // the expanded path, one node per level
  const [picked, setPicked] = useState<Place | null>(null);
  const [clicks, setClicks] = useState(0);
  const [first, setFirst] = useState<number | null>(null);
  const started = useRef(Date.now());
  const finish = (place: Place | null) => onAnswer({
    task, first, place: place ? place.index : null, correct: !!place && isRight(task, place),
    clicks, seconds: Math.round((Date.now() - started.current) / 1000),
  });

  const tap = (node: NavNode, depth: number, top: number) => {
    setClicks((c) => c + 1);
    if (first === null) setFirst(top);
    const closing = open[depth] === node;
    // tapping an open item closes it; tapping anything else closes its open siblings
    setOpen(node.children && !closing ? [...open.slice(0, depth), node] : open.slice(0, depth));
    const place = PLACE_OF.get(node);
    setPicked(place && !closing ? place : null);
  };

  const list = (nodes: NavNode[], depth: number, top: number) => (
    <ul style={{ listStyle: "none", margin: 0, padding: depth ? "4px 0 0 18px" : 0, display: "grid", gap: "4px" }}>
      {nodes.map((node, i) => {
        const t = depth ? top : i;
        const isOpen = open[depth] === node;
        const isPicked = picked?.node === node;
        return (
          <li key={node.label}>
            <button class={isPicked ? undefined : "ghost"} aria-expanded={node.children ? isOpen : undefined} aria-pressed={isPicked}
              style={{ width: "100%", justifyContent: "flex-start", textAlign: "left", fontWeight: depth ? 500 : 600 }}
              onClick={() => tap(node, depth, t)}>
              {/* a hidden arrow on items without children keeps every label at one level lined up */}
              <span aria-hidden="true" style={node.children ? undefined : { visibility: "hidden" }}>{isOpen ? "▾" : "▸"}</span>{node.label}
            </button>
            {isPicked && (
              <div class="note" style={{ margin: "4px 0 0 18px" }} role="group" aria-label="Confirm your choice">
                <p style={{ margin: "0 0 6px" }}>Is this where you'd find it?</p>
                <div class="row">
                  <button class="primary small" onClick={() => finish(picked)}>I'd find it here</button>
                  <button class="small" onClick={() => setPicked(null)}>Keep looking</button>
                </div>
              </div>
            )}
            {isOpen && node.children && list(node.children, depth + 1, t)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div class="stack fade-in">
      <h1>Help test Novena's menus</h1>
      <section class="card">
        <p style={{ margin: 0 }}><small>Task {step + 1} of {TASKS.length}</small></p>
        <h2 style={{ margin: "4px 0 6px" }}>{TASKS[task - 1].text}</h2>
        <p class="explain">Tap through the menus to where you'd look first. If nothing fits, that's useful to know too.</p>
      </section>
      <nav class="card" aria-label="Menus to test">
        {list(TREE, 0, 0)}
      </nav>
      <div><button class="ghost small" onClick={() => finish(null)}>Skip this task</button></div>
    </div>
  );
}

function Done({ progress, onRestart }: { progress: Progress; onRestart: () => void }) {
  const code = encode({ version: VERSION, often: progress.often, tasks: progress.results });
  const found = progress.results.filter((r) => r.correct).length;
  const box = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState<"" | "yes" | "select">("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied("yes");
    } catch {
      // no clipboard access (an old browser, or not allowed here): select it so it can be copied by hand
      box.current?.focus();
      box.current?.select();
      setCopied("select");
    }
  };
  return (
    <div class="stack fade-in">
      <h1>Help test Novena's menus</h1>
      <section class="card">
        <h2>Thank you!</h2>
        <p>{found} of {progress.results.length} found. Every answer helps, the misses most of all: they show where the menus need work.</p>
        <p>Please paste this code as a reply where you found the link:</p>
        <label class="sr-only" for="navtest-code">Your result code</label>
        <textarea id="navtest-code" ref={box} readOnly rows={3} value={code} onFocus={(e) => (e.target as HTMLTextAreaElement).select()}
          style={{ minHeight: 0, fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }} />
        <div class="row" style={{ marginTop: "8px" }}>
          <button class="primary" onClick={copy}>{copied === "yes" ? "Copied" : "Copy"}</button>
          {copied === "select" && <small>Selected: press Ctrl+C, or long-press and Copy.</small>}
        </div>
        <p class="explain">The code only holds where you tapped, how many taps and how long each task took, plus your warm-up answer. It stays on this page until you paste it somewhere.</p>
      </section>
      <div><button class="ghost small" onClick={onRestart}>Clear and start over</button></div>
    </div>
  );
}

/** For the owner: paste the replies, codes and all, and see how each task went. */
function TallyView() {
  const [text, setText] = useState("");
  const t = useMemo(() => tally(findCodes(text), { version: VERSION, firstRight: FIRST_RIGHT }), [text]);
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "–");
  const placeName = (i: number) => (PLACES[i] ? where(PLACES[i]) : `place ${i}`);
  return (
    <div class="stack fade-in">
      <h1>Menu test tally</h1>
      <section class="card">
        <label for="navtest-paste">Paste the replies</label>
        <p class="explain">One code per line, or whole threads: the codes are picked out of any text, and the same code pasted twice counts once.</p>
        <textarea id="navtest-paste" rows={6} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
        <p class="muted">
          {t.read} code{t.read === 1 ? "" : "s"} read{t.ignored ? `, ${t.ignored} from another version of the test or unreadable (left out)` : ""}.
          {t.read > 0 && ` Daily ${t.often.d} · Weekly ${t.often.w} · Rarely ${t.often.r} · No answer ${t.often.x}.`}
        </p>
      </section>
      {t.read > 0 && (
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Task</th><th class="num">Found</th><th class="num">First click right</th><th class="num">Skipped</th><th class="num">Median time</th><th>Most common wrong places</th><th>First clicks</th></tr>
            </thead>
            <tbody>
              {t.tasks.map((r) => (
                <tr key={r.task}>
                  <td>{r.task}. {TASKS[r.task - 1]?.text || "(not in this version)"}</td>
                  <td class="num">{pct(r.found, r.answers)}<br /><small class="muted">{r.found} of {r.answers}</small></td>
                  <td class="num">{r.firstRight === null ? "–" : pct(r.firstRight, r.answers)}</td>
                  <td class="num">{r.skipped}</td>
                  <td class="num">{r.medianSeconds === null ? "–" : `${Math.round(r.medianSeconds)} s`}</td>
                  <td>{r.wrong.length ? r.wrong.slice(0, 3).map(([p, n]) => <div key={p}>{placeName(p)} <span class="muted">({n})</span></div>) : <span class="muted">none</span>}</td>
                  <td>{r.firsts.map(([top, n]) => <div key={top}>{TREE[top]?.label || `item ${top}`} <span class="muted">({n})</span></div>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
