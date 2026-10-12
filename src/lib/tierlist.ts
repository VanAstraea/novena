// Tier lists (pages/Tiers.tsx): the list itself, the ways to start one, moving operators about, and the share link.
// Nothing here touches the page or the network, so it runs the same in tests.
//
// A share link carries the whole list in its hash: #t=<mode>.<payload>. The payload is a small JSON array,
// [version, title, [[name, colour, ops, note?], ...], roster?], where `ops` names each operator by the number in its id
// in base 36 (char_202_demkni -> "5m"), joined with dots; an id without a unique number goes in whole. Mode "d" is
// that text deflated (the browser's CompressionStream) then base64url, mode "p" the plain text in base64url, for
// browsers without it or when deflating doesn't make it shorter.

/** Tier colours: the site's own tokens, so they follow the theme. */
export const COLORS = ["bad", "r6", "r5", "good", "r3", "r4", "r1", "accent", "info", "surface-3"] as const;
export type TierColor = (typeof COLORS)[number];
export const COLOR_NAMES: Record<TierColor, string> = {
  bad: "Red", r6: "Orange", r5: "Yellow", good: "Green", r3: "Blue", r4: "Purple", r1: "Silver", accent: "Gold", info: "Grey", "surface-3": "Plain",
};

export interface Tier { name: string; color: TierColor; note: string; ops: string[] }
export interface TierList {
  id: string;
  title: string;
  tiers: Tier[];
  roster: boolean; // the unranked pool holds only operators you own
  updated: number;
}

export const LIMITS = { title: 80, name: 40, note: 140, tiers: 20 };
const DEFAULT_TIERS: [string, TierColor][] = [["S", "bad"], ["A", "r6"], ["B", "r5"], ["C", "good"], ["D", "r3"]];

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function blankList(title = "My tier list", roster = false): TierList {
  return { id: newId(), title, roster, updated: Date.now(), tiers: DEFAULT_TIERS.map(([name, color]) => ({ name, color, note: "", ops: [] })) };
}

/** A tier to add after the last: the next letter after a lettered last tier, and the next colour. */
export function nextTier(tiers: Tier[]): Tier {
  const last = tiers[tiers.length - 1];
  const name = last && /^[A-Y]$/.test(last.name) ? String.fromCharCode(last.name.charCodeAt(0) + 1) : "New tier";
  const used = new Set(tiers.map((t) => t.color));
  return { name, color: COLORS.find((c) => !used.has(c)) || "surface-3", note: "", ops: [] };
}

/** Share of operators (by community usage, most used first) that goes into each tier when starting from usage. */
export const USAGE_CUTS: [string, number][] = [["S", 0.05], ["A", 0.15], ["B", 0.35], ["C", 0.6], ["D", 1]];

/** Tiers filled from usage scores: the top 5% in S, the next 10% in A, then B, C and D. Unscored operators stay out. */
export function fromUsage(scores: [string, number][]): Tier[] {
  const ranked = scores.filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
  const tiers = blankList().tiers;
  let from = 0;
  USAGE_CUTS.forEach(([, cut], i) => {
    const to = Math.round(ranked.length * cut);
    tiers[i].ops = ranked.slice(from, Math.max(from, to)).map(([id]) => id);
    from = Math.max(from, to);
  });
  return tiers;
}

/** Where an operator is: its tier's index, or -1 when unranked. */
export function tierOf(list: TierList, id: string): number {
  return list.tiers.findIndex((t) => t.ops.includes(id));
}

/** Move an operator to tier `to` (-1: back to unranked) at `index` (the end when left out). */
export function moveOp(list: TierList, id: string, to: number, index?: number): TierList {
  const tiers = list.tiers.map((t) => ({ ...t, ops: t.ops.filter((x) => x !== id) }));
  if (to >= 0 && tiers[to]) {
    const ops = tiers[to].ops;
    const at = index === undefined ? ops.length : Math.max(0, Math.min(index, ops.length));
    tiers[to] = { ...tiers[to], ops: [...ops.slice(0, at), id, ...ops.slice(at)] };
  }
  return { ...list, tiers, updated: Date.now() };
}

// --- the share link ------------------------------------------------------------------------------------------------

type Packed = [number, string, [string, number, string, string?][], 1?];

/** The short names for ids: the number in each id in base 36, when no other known id has the same number. */
function shortNames(ids: string[]) {
  const byNum = new Map<string, string[]>();
  for (const id of ids) {
    const m = /^char_(\d+)_/.exec(id);
    if (m) byNum.set(m[1], [...(byNum.get(m[1]) || []), id]);
  }
  const toShort = new Map<string, string>(), fromShort = new Map<string, string>();
  for (const [n, list] of byNum) {
    if (list.length !== 1) continue;
    const s = Number(n).toString(36);
    toShort.set(list[0], s);
    fromShort.set(s, list[0]);
  }
  return { toShort, fromShort };
}

/** The list as compact text. `ids`: every operator id the site knows, for the short names. */
export function pack(list: TierList, ids: string[]): string {
  const { toShort } = shortNames(ids);
  const tiers = list.tiers.map((t) => {
    const row: [string, number, string, string?] = [t.name, Math.max(0, COLORS.indexOf(t.color)), t.ops.map((id) => toShort.get(id) || id).join(".")];
    if (t.note) row.push(t.note);
    return row;
  });
  const out: Packed = [1, list.title, tiers];
  if (list.roster) out.push(1);
  return JSON.stringify(out);
}

/** Read packed text back. Operators this site doesn't know are left out and counted. */
export function unpack(text: string, ids: string[]): { list: TierList; missing: number } {
  const p = JSON.parse(text) as Packed;
  if (!Array.isArray(p) || p[0] !== 1 || !Array.isArray(p[2])) throw new Error("bad tier list");
  const { fromShort } = shortNames(ids);
  const known = new Set(ids);
  const seen = new Set<string>();
  let missing = 0;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const tiers: Tier[] = p[2].slice(0, LIMITS.tiers).map((row) => {
    const ops: string[] = [];
    for (const tok of str(row?.[2], 20000).split(".").filter(Boolean)) {
      const id = tok.includes("_") ? tok : fromShort.get(tok);
      if (!id || !known.has(id)) { missing++; continue; }
      if (!seen.has(id)) { seen.add(id); ops.push(id); }
    }
    const c = typeof row?.[1] === "number" ? COLORS[row[1]] : undefined;
    return { name: str(row?.[0], LIMITS.name), color: c || "surface-3", note: str(row?.[3], LIMITS.note), ops };
  });
  return { list: { id: newId(), title: str(p[1], LIMITS.title) || "Tier list", tiers, roster: p[3] === 1, updated: Date.now() }, missing };
}

function toB64u(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64u(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const canDeflate = () => {
  try { return typeof CompressionStream === "function" && !!new CompressionStream("deflate-raw"); } catch { return false; }
};

/** The share code for the hash (`#t=` + this). `compress: false` forces the plain form. */
export async function encodeShare(list: TierList, ids: string[], compress = true): Promise<string> {
  const raw = new TextEncoder().encode(pack(list, ids));
  const plain = `p.${toB64u(raw)}`;
  if (!compress || !canDeflate()) return plain;
  try {
    const d = `d.${toB64u(await pipe(raw, new CompressionStream("deflate-raw")))}`;
    return d.length < plain.length ? d : plain;
  } catch {
    return plain;
  }
}

export async function decodeShare(code: string, ids: string[]): Promise<{ list: TierList; missing: number }> {
  const [mode, payload] = [code.slice(0, 2), code.slice(2)];
  let bytes = fromB64u(decodeURIComponent(payload));
  if (mode === "d.") {
    if (typeof DecompressionStream !== "function") throw new Error("This browser can't open compressed links. Try a newer one.");
    bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
  } else if (mode !== "p.") throw new Error("bad tier list");
  return unpack(new TextDecoder().decode(bytes), ids);
}

// --- files ---------------------------------------------------------------------------------------------------------

export const FILE_KIND = "novena-tierlist";

export function toFile(list: TierList) {
  return { app: "novena", kind: FILE_KIND, version: 1, title: list.title, roster: list.roster || undefined,
    tiers: list.tiers.map((t) => ({ name: t.name, color: t.color, note: t.note || undefined, ops: t.ops })) };
}

/** A list from an exported file, checked; operators this site doesn't know are left out. */
export function fromFile(data: unknown, ids: string[]): { list: TierList; missing: number } {
  const d = data as ReturnType<typeof toFile>;
  if (!d || d.kind !== FILE_KIND || !Array.isArray(d.tiers)) throw new Error("That isn't a Novena tier list file.");
  const known = new Set(ids), seen = new Set<string>();
  let missing = 0;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const tiers: Tier[] = d.tiers.slice(0, LIMITS.tiers).map((t) => ({
    name: str(t?.name, LIMITS.name), color: COLORS.includes(t?.color) ? t.color : "surface-3", note: str(t?.note, LIMITS.note),
    ops: (Array.isArray(t?.ops) ? t.ops : []).filter((id: unknown) => {
      if (typeof id !== "string" || !known.has(id)) { missing++; return false; }
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  }));
  return { list: { id: newId(), title: str(d.title, LIMITS.title) || "Tier list", tiers, roster: !!d.roster, updated: Date.now() }, missing };
}
