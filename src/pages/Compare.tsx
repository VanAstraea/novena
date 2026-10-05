// Compare 2-4 operators side by side. Each column has its own build; everything is in the URL:
//   /compare?ops=char_a,char_b&e=2&lv=90       defaults for every column
//   &c1e=1&c1m=X2                              column 2's own choices (c0 = first column)
import { Fragment, type ComponentChildren } from "preact";
import { CommunityMarks } from "../components/Marks";
import { useMemo } from "preact/hooks";
import { BuildControls, specFromQuery, specToQuery } from "../components/OpParts";
import { OpPicker } from "../components/OpPicker";
import { Art, Avatar, Await, Explain, GIcon, Items, itemsSig, metaSig, Range, Rich, Stars, useAsync } from "../components/ui";
import { reach, stateLabel } from "../lib/build";
import { fresh, sanity, stateCost, type OpState } from "../lib/costs";
import { art, integrated, operator, operators, usage as loadUsage } from "../lib/data";
import { CATEGORY_NAMES, CLASS_NAMES, fmt, pct } from "../lib/format";
import { href, route, setQuery } from "../lib/router";
import { statsAt, type BuildSpec } from "../lib/stats";
import { account, server } from "../state";
import type { ISFile, OpDetail, OpIndex, UsageFile } from "../types";

const MAX = 4;

interface Col {
  op: OpIndex;
  d: OpDetail;
  spec: BuildSpec;
}

function colGet(q: URLSearchParams, i: number) {
  return (k: string) => q.get(`c${i}${k}`) ?? q.get(k);
}

export default function Compare() {
  const s = server.value;
  const q = route.value.query;
  const ids = (q.get("ops") || "").split(",").filter(Boolean).slice(0, MAX);
  const base = useAsync(() => Promise.all([operators(s), loadUsage(), integrated(s)]), [s]);
  const details = useAsync(() => Promise.all(ids.map((id) => operator(s, id).catch(() => null))), [s, ids.join()]);
  return (
    <div class="stack fade-in">
      <h1>Compare operators</h1>
      <Await state={base} what="operators">
        {([ops, usage, is]) => (
          <>
            <div class="card">
              <div class="row" style={{ alignItems: "flex-end" }}>
                {ids.length < MAX
                  ? <OpPicker ops={ops} exclude={ids} label={ids.length ? "Add another operator" : "Pick operators to compare"}
                    onPick={(op) => setQuery({ ops: [...ids, op.id].join(",") })} />
                  : <p class="muted">Four is the most at once. Remove one to add another.</p>}
                {ids.length > 0 && <button class="ghost" onClick={() => setQuery({ ops: "" })}>Clear</button>}
                {ids.length > 0 && <button class="ghost" onClick={() => navigator.clipboard?.writeText(location.href)}
                  title="Copy this comparison's address">Copy link</button>}
              </div>
              {!ids.length && <Suggestions ops={ops} usage={usage} />}
            </div>
            {ids.length > 0 && (
              <Await state={details} what="operator details">
                {(ds) => {
                  const cols: Col[] = ds.map((d, i) => {
                    const op = ops.find((o) => o.id === ids[i]);
                    return d && op ? { op, d, spec: specFromQuery(d, colGet(q, i)) } : null;
                  }).filter(Boolean) as Col[];
                  return <Table cols={cols} usage={usage} is={is} ids={ids} />;
                }}
              </Await>
            )}
          </>
        )}
      </Await>
    </div>
  );
}

function Suggestions({ ops, usage }: { ops: OpIndex[]; usage: UsageFile }) {
  // a few same-branch pairs among the most used operators, as one-click examples
  const top = ops.filter((o) => o.rarity === 6 && !o.src).sort((a, b) => (usage.ops[b.id]?.score || 0) - (usage.ops[a.id]?.score || 0));
  const pairs: [OpIndex, OpIndex][] = [];
  for (const a of top) {
    const b = top.find((x) => x !== a && x.branch === a.branch && !pairs.some((p) => p.includes(x) || p.includes(a)));
    if (b) pairs.push([a, b]);
    if (pairs.length >= 4) break;
  }
  return (
    <div style={{ marginTop: "12px" }}>
      <p class="muted">Or try:</p>
      <div class="chips">
        {pairs.map(([a, b]) => <a key={a.id} class="chip" href={href("/compare", { ops: `${a.id},${b.id}` })}>{a.name} vs {b.name}</a>)}
      </div>
    </div>
  );
}

type Better = "high" | "low" | null;

function Row({ label, values, better = null, render, title }: {
  label: ComponentChildren; values: (number | null)[]; better?: Better; render: (v: number, i: number) => ComponentChildren; title?: string;
}) {
  const nums = values.filter((v): v is number => v !== null);
  const bestV = better && nums.length > 1 && new Set(nums).size > 1 ? (better === "high" ? Math.max(...nums) : Math.min(...nums)) : null;
  return (
    <tr>
      <th scope="row" title={title}>{label}</th>
      {values.map((v, i) => (
        <td key={i} class={v !== null && v === bestV ? "best num" : "num"}>
          {v === null ? "–" : render(v, i)}{v !== null && v === bestV && <span class="sr-only"> (best)</span>}
        </td>
      ))}
    </tr>
  );
}

function TextRow({ label, cells }: { label: ComponentChildren; cells: ComponentChildren[] }) {
  return <tr><th scope="row">{label}</th>{cells.map((c, i) => <td key={i}>{c}</td>)}</tr>;
}

function Table({ cols, usage, is, ids }: { cols: Col[]; usage: UsageFile; is: ISFile; ids: string[] }) {
  const meta = metaSig.value;
  const values = itemsSig.value?.values || {};
  const stats = cols.map((c) => statsAt(c.d, c.spec));
  const setCol = (i: number, spec: BuildSpec) => {
    const qq = Object.fromEntries(Object.entries(specToQuery(spec)).map(([k, v]) => [`c${i}${k}`, v]));
    setQuery(qq);
  };
  const remove = (i: number) => {
    // shift later columns' settings down so they stay with their operator
    const q = route.value.query;
    const patch: Record<string, string> = { ops: ids.filter((_, j) => j !== i).join(",") };
    for (let j = i; j < MAX; j++) {
      for (const k of ["e", "lv", "p", "t", "m", "s", "sl"]) patch[`c${j}${k}`] = q.get(`c${j + 1}${k}`) || "";
    }
    setQuery(patch);
  };
  const costs = useMemo(() => cols.map((c) => {
    if (!meta) return null;
    const owned = account.value.ops[c.op.id];
    const from: OpState = owned ? { elite: owned.elite, level: owned.level, skillLevel: owned.skillLevel, masteries: owned.masteries, modules: owned.modules } : fresh(c.d);
    const sk = c.spec.skill ?? 0;
    const sl = c.spec.skillLevel || 1;
    const target = {
      elite: c.spec.elite, level: c.spec.level, skillLevel: Math.min(sl, 7),
      masteries: sl > 7 ? { [sk + 1]: sl - 7 } : {}, modules: c.spec.module ? { [c.spec.module.letter]: c.spec.module.stage } : {},
    };
    try {
      const to = reach(c.d, c.op.rarity, c.op.name, from, target);
      return { cost: stateCost(c.d, meta.const, from, to), from: owned ? stateLabel(from) : null, to };
    } catch {
      return null;
    }
  }), [cols.map((c) => JSON.stringify(c.spec) + c.op.id).join(), meta, account.value]);

  return (
    <>
      <div class="table-wrap">
        <table class="cmp-table">
          <thead>
            <tr>
              <th scope="col"><span class="sr-only">Attribute</span></th>
              {cols.map((c, i) => (
                <th key={c.op.id} scope="col" style={{ whiteSpace: "normal", textTransform: "none", letterSpacing: "normal", color: "var(--text)", fontSize: "0.92rem", padding: "10px" }}>
                  <div class="cmp-head">
                    <a class="art" href={href(`/operator/${c.op.id}`)} aria-label={c.op.name}>
                      <Art srcs={art.portraits(c.op.id, c.spec.elite)} alt="" fallback={<Avatar op={c.op} size="lg" />} />
                    </a>
                    <div class="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                      <span>
                        <a href={href(`/operator/${c.op.id}`)} class="op-name" style={{ color: "var(--text)", fontSize: "1.05rem" }}>{c.op.name}</a><br />
                        <span class="row tight"><Stars n={c.op.rarity} img /> <GIcon src={art.classIcon(c.op.cls)} alt={CLASS_NAMES[c.op.cls]} size={18} /> <small>{meta?.branches[c.op.branch] || CLASS_NAMES[c.op.cls]}</small></span>
                      </span>
                      <button class="small ghost" onClick={() => remove(i)} aria-label={`Remove ${c.op.name}`}>✕</button>
                    </div>
                    {c.op.src && <span class="badge cn">CN only</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Build</th>
              {cols.map((c, i) => <td key={i}><BuildControls d={c.d} spec={c.spec} onChange={(s) => setCol(i, s)} /></td>)}
            </tr>
            <Section n={cols.length} title="Stats" />
            <Row label="HP" better="high" values={stats.map((s) => s.total.hp)} render={fmt} />
            <Row label="ATK" better="high" values={stats.map((s) => s.total.atk)} render={fmt} />
            <Row label="DEF" better="high" values={stats.map((s) => s.total.def)} render={fmt} />
            <Row label="RES" better="high" values={stats.map((s) => s.total.res)} render={(v) => String(v)} />
            <Row label="Attack interval" better="low" values={stats.map((s) => s.attackTime)} render={(v) => `${v.toFixed(2)} s`}
              title="Seconds between attacks, after attack speed" />
            <Row label={<>ATK / second <span class="badge est">estimate</span></>} better="high" values={stats.map((s) => s.atkPerSec)} render={fmt}
              title="ATK ÷ attack interval, before enemy DEF/RES, talents and skills" />
            <Row label="Block" better="high" values={stats.map((s) => s.total.block)} render={String} />
            <Row label="DP cost" better="low" values={stats.map((s) => s.total.cost)} render={String} />
            <Row label="Redeploy" better="low" values={stats.map((s) => s.total.respawn)} render={(v) => `${v} s`} />
            <TextRow label="Range" cells={cols.map((c) => <Range id={c.d.phases[c.spec.elite].range} size={10} />)} />
            <Section n={cols.length} title="Skill" />
            <TextRow label="Chosen skill" cells={cols.map((c) => {
              const sk = c.d.skills[c.spec.skill ?? 0];
              const lv = sk?.levels[Math.min(c.spec.skillLevel || 7, sk.levels.length) - 1];
              if (!sk || !lv) return <span class="muted">None</span>;
              return (
                <div>
                  <img src={art.skill(sk.icon)} alt="" width={40} height={40} loading="lazy" style={{ float: "left", marginRight: "8px", border: "1px solid var(--line)" }} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                  <strong>S{(c.spec.skill ?? 0) + 1} {sk.name}</strong> <span class="muted">({(c.spec.skillLevel || 7) > 7 ? `M${(c.spec.skillLevel || 7) - 7}` : `Lv ${c.spec.skillLevel}`})</span>
                  <p class="muted" style={{ margin: "2px 0" }}>{sk.sp === "passive" ? (sk.type === "passive" ? "Passive" : "No SP") : `${lv.sp} SP (${lv.init} initial)${lv.dur > 0 ? ` · ${lv.dur} s` : ""}`}</p>
                  <Rich html={lv.desc} />
                </div>
              );
            })} />
            <Row label="Skill SP cost" better="low" values={cols.map((c) => {
              const sk = c.d.skills[c.spec.skill ?? 0];
              return sk && sk.sp !== "passive" ? sk.levels[Math.min(c.spec.skillLevel || 7, sk.levels.length) - 1].sp : null;
            })} render={String} />
            <Section n={cols.length} title="Talents and module" />
            <TextRow label="Talents" cells={cols.map((c) => (
              <div>
                {c.d.talents.map((cands, j) => {
                  const now = [...cands].reverse().find((t) => t.elite < c.spec.elite || (t.elite === c.spec.elite && t.level <= c.spec.level) ? t.pot <= c.spec.pot - 1 : false);
                  return now ? <p key={j} style={{ margin: "0 0 6px" }}><strong>{now.name}</strong>: <Rich html={now.desc} /></p>
                    : <p key={j} class="muted" style={{ margin: "0 0 6px" }}>{cands[0].name}: unlocks at E{cands[0].elite}</p>;
                })}
              </div>
            ))} />
            <TextRow label="Module" cells={cols.map((c) => {
              if (!c.spec.module) return <span class="muted">{c.d.modules.length ? "None chosen" : "No modules"}</span>;
              const m = c.d.modules.find((x) => x.letter === c.spec.module!.letter);
              const st = m?.stages[c.spec.module.stage - 1];
              if (!m || !st) return "–";
              return (
                <div>
                  <strong>{m.icon} stage {c.spec.module.stage}</strong>
                  {st.trait.map((t, j) => <p key={j} style={{ margin: "4px 0" }}><Rich html={t} /></p>)}
                  {st.talents.map((t, j) => <p key={`t${j}`} style={{ margin: "4px 0" }}><strong>{t.name}</strong>: <Rich html={t.desc} /></p>)}
                </div>
              );
            })} />
            <Section n={cols.length} title="Cost to reach this build" />
            <TextRow label="From" cells={costs.map((c) => c?.from ? <>your roster ({c.from})</> : "a new copy (E0 Lv 1)")} />
            <TextRow label="Materials" cells={costs.map((c) => (c ? <Items cost={Object.fromEntries(Object.entries(c.cost).filter(([k]) => k !== "4001" && k !== "EXP"))} empty="None" /> : "–"))} />
            <Row label="LMD" better="low" values={costs.map((c) => (c ? c.cost["4001"] || 0 : null))} render={fmt} />
            <Row label="EXP" better="low" values={costs.map((c) => (c ? c.cost.EXP || 0 : null))} render={fmt} />
            <Row label={<>Sanity value <span class="badge est">estimate</span></>} better="low" values={costs.map((c) => (c ? Math.round(sanity(c.cost, values)) : null))} render={fmt}
              title="Everything priced in sanity with Yituliu's material values" />
            <Section n={cols.length} title="Community" />
            {(["main", "event", "annihilation", "cc"] as const).map((cat) => (
              <Row key={cat} label={`Usage: ${CATEGORY_NAMES[cat]}`} better="high" values={cols.map((c) => usage.ops[c.op.id]?.u?.[cat] ?? 0)} render={(v) => pct(v)} />
            ))}
            <TextRow label="Usage: IS" cells={cols.map((c) => {
              const hits = is.themes.map((t) => ({ t, p: t.picks.find((p) => p.id === c.op.id) })).filter((x) => x.p);
              return hits.length ? <small>{hits.slice(0, 3).map((h) => `${h.t.name.split(" ")[0]} ${h.p!.recruit}`).join(" · ")}</small> : <span class="muted">Not ranked</span>;
            })} />
            <Row label="Lift" better="high" values={cols.map((c) => usage.ops[c.op.id]?.lift ?? null)} render={(v) => `${v.toFixed(2)}×`}
              title="Usage ÷ ownership: above 1, clears pick it more than its ownership suggests" />
            <TextRow label="Community build" cells={cols.map((c) => {
              const b = usage.ops[c.op.id]?.build || {};
              return b.elite || b.skill || b.module ? <CommunityMarks b={b} op={c.op} /> : <span class="muted">No consensus</span>;
            })} />
          </tbody>
        </table>
      </div>
      <Explain>▲ marks the best value in a row. Usage: share of community clear guides (MAA Copilot, CN) for that content that use the operator. IS: MAA's recruit priority per theme. Estimates are labelled; there is no full DPS simulation.</Explain>
    </>
  );
}

function Section({ n, title }: { n: number; title: string }) {
  return (
    <Fragment>
      <tr><th scope="rowgroup" colSpan={n + 1} style={{ background: "var(--surface-2)", position: "static" }}>{title}</th></tr>
    </Fragment>
  );
}
