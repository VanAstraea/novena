// The menu tree test (/navtest): the places in a proposed menu tree, the short result code a participant copies at the
// end, and the tally of many codes. Nothing here is sent anywhere: people copy their code by hand, and the owner
// pastes the codes they were sent into the tally view (/navtest?tally).
//
// A code reads `NT<version>-<often>-<task>-<task>-…`, one 8-character group per task in the order it was shown:
//   task number · y found / n not found / s skipped · first top-level item · place (2) · clicks · seconds (2)
// all in base 36 (0-9 then a-z). "z" for the first item and "zz" for the place mean none; clicks stop at 35 and
// seconds at 1295. <often> is the warm-up answer: d daily, w weekly, r rarely, x not answered.
// Example: NT1-w-3y20c30i-… is task 3, found, first tapped top-level item 2, place 12, 3 clicks, 18 seconds.

export interface NavNode {
  label: string;
  children?: NavNode[];
}

/** Somewhere a participant can say "I'd find it here": a top-level item with nothing under it, a page, or a tab. */
export interface Place {
  index: number;
  top: number; // the top-level item it sits under
  path: string[];
  node: NavNode;
}

/** Every place in the tree, numbered depth first. Top-level items with children are menus, not places. */
export function places(tree: NavNode[]): Place[] {
  const out: Place[] = [];
  const walk = (nodes: NavNode[], top: number, path: string[], depth: number) => {
    nodes.forEach((node, i) => {
      const t = depth ? top : i;
      const p = [...path, node.label];
      if (depth > 0 || !node.children) out.push({ index: out.length, top: t, path: p, node });
      if (node.children) walk(node.children, t, p, depth + 1);
    });
  };
  walk(tree, 0, [], 0);
  return out;
}

export type Often = "d" | "w" | "r" | "x";

export interface TaskResult {
  task: number; // 1-based, its place in the page's task list
  first: number | null; // first top-level item tapped
  place: number | null; // the place chosen, or null when skipped
  correct: boolean;
  clicks: number;
  seconds: number;
}

export interface Response {
  version: number;
  often: Often;
  tasks: TaskResult[];
}

const b36 = (n: number, width: number) => n.toString(36).padStart(width, "0");
const clamp = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n)));

export function encode(r: Response): string {
  const groups = r.tasks.map((t) =>
    b36(clamp(t.task, 35), 1) +
    (t.place === null ? "s" : t.correct ? "y" : "n") +
    (t.first === null ? "z" : b36(clamp(t.first, 34), 1)) +
    (t.place === null ? "zz" : b36(clamp(t.place, 1294), 2)) +
    b36(clamp(t.clicks, 35), 1) +
    b36(clamp(t.seconds, 1295), 2));
  return [`NT${r.version}`, r.often, ...groups].join("-");
}

const CODE = /\bNT(\d+)-([dwrx])((?:-[0-9a-z][yns][0-9a-z]{6})+)(?![0-9a-z])/gi;

/** Every result code in a piece of text (a pasted thread, one code per line, anything), each once. */
export function findCodes(text: string): string[] {
  return [...new Set([...text.matchAll(CODE)].map((m) => m[0].toLowerCase().replace(/^nt/, "NT")))];
}

export function decode(code: string): Response | null {
  const m = new RegExp(`^${CODE.source}$`, "i").exec(code.trim());
  if (!m) return null;
  const tasks = m[3].slice(1).toLowerCase().split("-").map((g): TaskResult => {
    const skipped = g[1] === "s";
    return {
      task: parseInt(g[0], 36),
      first: g[2] === "z" ? null : parseInt(g[2], 36),
      place: skipped ? null : parseInt(g.slice(3, 5), 36),
      correct: g[1] === "y",
      clicks: parseInt(g[5], 36),
      seconds: parseInt(g.slice(6, 8), 36),
    };
  });
  return { version: Number(m[1]), often: m[2].toLowerCase() as Often, tasks };
}

export interface TaskTally {
  task: number;
  answers: number;
  found: number;
  skipped: number;
  firstRight: number | null; // answers whose first tap was a right top-level item, when those are known
  medianSeconds: number | null; // over the answers that weren't skipped
  wrong: [place: number, count: number][]; // wrong places chosen, most common first
  firsts: [top: number, count: number][]; // first top-level items tapped, most common first
}

export interface Tally {
  read: number; // codes counted
  ignored: number; // unreadable, or from another version of the test
  often: Record<Often, number>;
  tasks: TaskTally[]; // by task number
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function ranked(xs: number[]): [number, number][] {
  const counts = new Map<number, number>();
  for (const x of xs) counts.set(x, (counts.get(x) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}

/** Add up many codes. `version` skips codes from other versions of the test; `firstRight` lists, per task number,
 *  the top-level items that lead to a right answer, for the first-click score. */
export function tally(codes: string[], opts: { version?: number; firstRight?: Record<number, number[]> } = {}): Tally {
  const often: Record<Often, number> = { d: 0, w: 0, r: 0, x: 0 };
  const byTask = new Map<number, TaskResult[]>();
  let read = 0, ignored = 0;
  for (const code of new Set(codes)) {
    const r = decode(code);
    if (!r || (opts.version !== undefined && r.version !== opts.version)) { ignored++; continue; }
    read++;
    often[r.often]++;
    for (const t of r.tasks) byTask.set(t.task, [...(byTask.get(t.task) || []), t]);
  }
  const tasks = [...byTask].sort((a, b) => a[0] - b[0]).map(([task, rs]): TaskTally => {
    const right = opts.firstRight?.[task];
    return {
      task,
      answers: rs.length,
      found: rs.filter((t) => t.correct).length,
      skipped: rs.filter((t) => t.place === null).length,
      firstRight: right ? rs.filter((t) => t.first !== null && right.includes(t.first)).length : null,
      medianSeconds: median(rs.filter((t) => t.place !== null).map((t) => t.seconds)),
      wrong: ranked(rs.filter((t) => t.place !== null && !t.correct).map((t) => t.place!)),
      firsts: ranked(rs.filter((t) => t.first !== null).map((t) => t.first!)),
    };
  });
  return { read, ignored, often, tasks };
}
