// "Account at a glance" on Today: what the roster adds up to, what it has cost so far, what it would cost to take every
// owned operator all the way, and a picture of the numbers to share. All worked out in this browser from the roster.
import { useEffect, useMemo, useState } from "preact/hooks";
import { Await, Explain, Items, useAsync } from "./ui";
import { costTable } from "../lib/account";
import { accountStats, BAND_NAMES, BANDS, maxRows, maxTotal, PARTS, summary, topMaterials, type Band, type Part } from "../lib/accountStats";
import type { Const, CostData } from "../lib/costs";
import { items as loadItems, meta as loadMeta, operators } from "../lib/data";
import { compact, date, fmt } from "../lib/format";
import { pref, setPref } from "../lib/storage";
import { account, server } from "../state";
import type { OpIndex } from "../types";

const PART_NAMES: Record<Part, string> = { growth: "Promotion & level", skills: "Skill level 7", masteries: "Masteries", modules: "Modules" };
const BAND_COLORS: Record<Band, string> = { 6: "#ff9b3d", 5: "#f6d04d", 4: "#c9a7ff", low: "#6cb8ff" }; // the dark theme's rarity colours

const list = <T extends string>(key: string, all: T[]): T[] => {
  try { const v = JSON.parse(pref(key, "null")); return Array.isArray(v) ? all.filter((x) => v.includes(x)) : all; } catch { return all; }
};

export function AccountGlance() {
  const s = server.value;
  const st = useAsync(() => Promise.all([operators(s), costTable(s), loadMeta(s), loadItems(s)]), [s]);
  const [open, setOpen] = useState(() => pref("glance.open", "0") === "1");
  return (
    <details class="card glance" open={open} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; setOpen(o); setPref("glance.open", o ? "1" : "0"); }}>
      <summary>
        <h2>Account at a glance</h2>
        <span class="muted">Totals, what your roster has cost so far, the cost to max everything, and a picture to share</span>
      </summary>
      {open && (
        <Await state={st} what="your account's numbers">
          {([ops, costs, meta, items]) => <Body ops={ops} costs={costs} c={meta.const} values={items.values} />}
        </Await>
      )}
    </details>
  );
}

function Body({ ops, costs, c, values }: { ops: OpIndex[]; costs: Record<string, CostData>; c: Const; values: Record<string, number> }) {
  const a = account.value;
  const byId = useMemo(() => new Map(ops.map((o) => [o.id, o])), [ops]);
  const roster = useMemo(() => Object.values(a.ops), [a.ops]);
  const st = useMemo(() => accountStats(roster, byId, costs, c), [roster, byId, costs, c]);
  const rows = useMemo(() => maxRows(roster, byId, costs, c), [roster, byId, costs, c]);
  const [parts, setParts] = useState<Part[]>(() => list("glance.parts", PARTS));
  const [bands, setBands] = useState<Band[]>(() => list("glance.bands", BANDS));
  const [all, setAll] = useState(false);
  const total = useMemo(() => maxTotal(rows, parts, bands), [rows, parts, bands]);
  const spent = summary(st.invested, values);
  const toMax = summary(total.cost, values);
  const mats = topMaterials(total.cost, values, all ? 999 : 16);
  const kinds = topMaterials(total.cost, values, 999).length;

  const flip = <T extends string>(key: string, cur: T[], set: (v: T[]) => void, x: T, order: T[]) => {
    const next = cur.includes(x) ? cur.filter((y) => y !== x) : order.filter((y) => y === x || cur.includes(y));
    set(next); setPref(key, JSON.stringify(next));
  };

  const tiles: [string, string, string?][] = [
    ["Operators", fmt(st.owned), BANDS.map((b) => `${b === "low" ? "≤3★" : BAND_NAMES[b]} ${st.byBand[b]}`).join(" · ")],
    ["Elite 2", fmt(st.e2)],
    ["Max level", fmt(st.levelMax), "At their last promotion"],
    ["Skill level 7", fmt(st.sl7)],
    ["M3 skills", fmt(st.m3), `On ${fmt(st.m3Ops)} operator${st.m3Ops === 1 ? "" : "s"}`],
    ["Modules", fmt(st.modules), `${fmt(st.modules3)} at stage 3`],
    ["Potential 6", fmt(st.pot6)],
    ["LMD spent", compact(spent.lmd), "On promotions, levels, skills and modules"],
    ["EXP spent", compact(spent.exp)],
    ["Worth in sanity", compact(spent.sanity), "Everything raised so far"],
  ];

  return (
    <div class="stack glance-body">
      <div class="tiles6">
        {tiles.map(([k, v, d]) => <div key={k} class="stat"><div class="k">{k}</div><div class="v">{v}</div>{d && <div class="d">{d}</div>}</div>)}
      </div>

      <section>
        <h3>Cost to max everything</h3>
        <p class="muted" style={{ marginTop: 0 }}>What every operator you own still needs to reach the top, from where each one is now.</p>
        <div class="glance-filters">
          <div class="chips" role="group" aria-label="What counts as max">
            {PARTS.map((p) => <button key={p} type="button" class="chip" aria-pressed={parts.includes(p)} onClick={() => flip("glance.parts", parts, setParts, p, PARTS)}>{PART_NAMES[p]}</button>)}
          </div>
          <div class="chips" role="group" aria-label="Rarity">
            {BANDS.map((b) => <button key={b} type="button" class="chip" aria-pressed={bands.includes(b)} onClick={() => flip("glance.bands", bands, setBands, b, BANDS)}>{BAND_NAMES[b]}</button>)}
          </div>
        </div>
        <div class="tiles6" style={{ marginTop: "12px" }}>
          <div class="stat"><div class="k">Operators to raise</div><div class="v">{fmt(total.toRaise)}</div><div class="d">of {fmt(total.counted)} counted</div></div>
          <div class="stat"><div class="k">LMD</div><div class="v">{compact(toMax.lmd)}</div></div>
          <div class="stat"><div class="k">EXP</div><div class="v">{compact(toMax.exp)}</div></div>
          <div class="stat"><div class="k">Worth in sanity</div><div class="v">{compact(toMax.sanity)}</div></div>
        </div>
        <h4 style={{ margin: "14px 0 8px" }}>{all ? "Materials" : "Top materials"} <small class="muted">· by sanity value</small></h4>
        <Items cost={mats} empty={parts.length && bands.length ? "Nothing left: everything counted is already maxed" : "Pick at least one part and one rarity"} />
        {kinds > 16 && <p style={{ margin: "8px 0 0" }}><button type="button" class="linkish" onClick={() => setAll(!all)}>{all ? "Show the top 16" : `Show all ${kinds} materials`}</button></p>}
        <Explain>Max means the operator's last promotion at its level cap, skill level 7, Mastery 3 on every skill and every module at stage 3; untick what you don't plan to do. Alternate forms share their base form's promotion, levels and skill levels, so those count once. Sanity values are the same as everywhere on Novena, and include LMD and EXP. Your depot isn't taken off: this is the whole bill.</Explain>
      </section>

      <Share st={st} spentSanity={spent.sanity} />
    </div>
  );
}

function Share({ st, spentSanity }: { st: ReturnType<typeof accountStats>; spentSanity: number }) {
  const [img, setImg] = useState<{ url: string; file: File } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => () => { if (img) URL.revokeObjectURL(img.url); }, [img]);

  const make = async () => {
    setBusy(true); setErr("");
    try {
      const { drawCard, toBlob } = await import("../lib/shareCard");
      const cv = await drawCard({
        server: server.value, date: date(Date.now()),
        tiles: [["Operators", fmt(st.owned)], ["Elite 2", fmt(st.e2)], ["Max level", fmt(st.levelMax)], ["Skill level 7", fmt(st.sl7)],
          ["M3 skills", fmt(st.m3)], ["Modules at stage 3", fmt(st.modules3)], ["Potential 6", fmt(st.pot6)], ["Sanity invested", compact(spentSanity)]],
        bands: BANDS.map((b) => ({ label: BAND_NAMES[b], count: st.byBand[b], color: BAND_COLORS[b] })),
        footer: "Made with Novena, a free Arknights companion",
      });
      const blob = await toBlob(cv);
      setImg({ url: URL.createObjectURL(blob), file: new File([blob], "novena-account.png", { type: "image/png" }) });
    } catch (e) {
      setErr((e as Error).message || "Couldn't make the picture");
    } finally {
      setBusy(false);
    }
  };
  const canShare = !!img && typeof navigator.canShare === "function" && navigator.canShare({ files: [img.file] });

  return (
    <section>
      <h3>Share as image</h3>
      <p class="muted" style={{ marginTop: 0 }}>A picture of these numbers, drawn in this browser. Nothing is uploaded: it only goes where you save or send it.</p>
      <div class="row">
        <button type="button" onClick={() => void make()} disabled={busy}>{busy ? "Drawing…" : img ? "Draw it again" : "Make the picture"}</button>
        {img && <a class="btn primary" href={img.url} download="novena-account.png">Save PNG</a>}
        {canShare && <button type="button" onClick={() => void navigator.share({ files: [img!.file], title: "My Arknights account" }).catch(() => {})}>Share…</button>}
      </div>
      {err && <p class="bad-text">{err}</p>}
      {img && <img class="glance-preview" src={img.url} alt="Your account at a glance, as a picture" width={1200} height={675} />}
    </section>
  );
}
