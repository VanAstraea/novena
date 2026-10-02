// Fuzzy matching for search boxes (after ako's matchScore): exact, prefix, word starts, in-order word starts
// ("ch hol"), substring, initials, then letters in order.
import { fold } from "./format";

export function matchScore(query: string, text: string): number {
  const q = fold(query).trim();
  const t = fold(text);
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 90 - Math.min(t.length - q.length, 20) / 4;
  const words = t.split(/\s+/);
  if (words.some((w) => w.startsWith(q))) return 75;
  const qw = q.split(/\s+/);
  if (qw.length > 1) {
    let i = 0;
    for (const w of words) if (i < qw.length && w.startsWith(qw[i])) i++;
    if (i === qw.length) return 65;
  }
  if (t.includes(q)) return 55;
  const compactQ = q.replace(/\s+/g, "");
  if (words.map((w) => w[0]).join("").startsWith(compactQ) && compactQ.length > 1) return 45;
  let j = 0;
  const tt = t.replace(/\s+/g, "");
  for (const ch of tt) if (ch === compactQ[j]) j++;
  return j === compactQ.length && compactQ.length > 2 ? 20 : 0;
}

export function best<T>(query: string, list: T[], texts: (x: T) => (string | undefined)[], limit = 20): T[] {
  return list
    .map((x) => ({ x, s: Math.max(0, ...texts(x).filter(Boolean).map((t) => matchScore(query, t!))) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.x);
}
