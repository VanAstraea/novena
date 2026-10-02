// Pieces of an operator's data, shared by the operator page and Compare.
import { Fragment, type ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { add, LMD, masteryCost, moduleCost, promotionCost, sanity, skillLevelCost, levelCost, type Cost } from "../lib/costs";
import { art } from "../lib/data";
import { CATEGORY_NAMES, fmt, pct, ROOM_NAMES } from "../lib/format";
import { clampSpec, statsAt, type BuildSpec } from "../lib/stats";
import type { Category, ISFile, OpDetail, Skill, UsageRow } from "../types";
import { Explain, Items, itemsSig, metaSig, Range, Rich } from "./ui";

export const STAT_LABELS: [keyof ReturnType<typeof statsAt>["total"], string, string][] = [
  ["hp", "HP", ""], ["atk", "ATK", ""], ["def", "DEF", ""], ["res", "RES", ""], ["cost", "DP cost", ""],
  ["block", "Block", ""], ["interval", "Attack interval", "s"], ["respawn", "Redeploy", "s"],
];

export function defaultSpec(d: OpDetail): BuildSpec {
  const elite = d.phases.length - 1;
  return { elite, level: d.phases[elite].max, pot: 1, trust: 100, module: null, skill: Math.max(0, d.skills.length - 1), skillLevel: d.skills[0]?.levels.length || 7 };
}

export function specToQuery(s: BuildSpec, prefix = ""): Record<string, string> {
  return {
    [`${prefix}e`]: String(s.elite), [`${prefix}lv`]: String(s.level), [`${prefix}p`]: String(s.pot), [`${prefix}t`]: String(s.trust),
    [`${prefix}m`]: s.module ? `${s.module.letter}${s.module.stage}` : "", [`${prefix}s`]: s.skill !== undefined ? String(s.skill + 1) : "",
    [`${prefix}sl`]: s.skillLevel ? String(s.skillLevel) : "",
  };
}

export function specFromQuery(d: OpDetail, get: (k: string) => string | null, prefix = ""): BuildSpec {
  const base = defaultSpec(d);
  const n = (k: string, f: number) => {
    const v = get(prefix + k);
    return v !== null && v !== "" && !Number.isNaN(+v) ? +v : f;
  };
  const m = get(`${prefix}m`);
  const spec: BuildSpec = {
    elite: n("e", base.elite), level: n("lv", NaN), pot: n("p", 1), trust: n("t", 100),
    module: m && /^[A-Z][1-3]$/.test(m) ? { letter: m[0], stage: +m[1] } : null,
    skill: n("s", (base.skill ?? 0) + 1) - 1, skillLevel: n("sl", base.skillLevel!),
  };
  if (Number.isNaN(spec.level)) spec.level = d.phases[Math.min(spec.elite, d.phases.length - 1)].max;
  return clampSpec(d, spec);
}

const levelLabel = (n: number) => (n <= 7 ? `Lv ${n}` : `M${n - 7}`);

export function BuildControls({ d, spec, onChange, compact = false }: {
  d: OpDetail; spec: BuildSpec; onChange: (s: BuildSpec) => void; compact?: boolean;
}) {
  const set = (patch: Partial<BuildSpec>) => {
    const next = { ...spec, ...patch };
    if (patch.elite !== undefined && patch.level === undefined) next.level = d.phases[Math.min(patch.elite, d.phases.length - 1)].max;
    onChange(clampSpec(d, next));
  };
  const maxSl = d.skills[spec.skill ?? 0]?.levels.length || 7;
  return (
    <div class="row" style={{ alignItems: "flex-end" }}>
      <label class="field"><span>Elite</span>
        <select value={spec.elite} onChange={(e) => set({ elite: +(e.target as HTMLSelectElement).value })}>
          {d.phases.map((_, i) => <option key={i} value={i}>E{i}</option>)}
        </select>
      </label>
      <label class="field"><span>Level (max {d.phases[spec.elite].max})</span>
        <input type="number" min={1} max={d.phases[spec.elite].max} value={spec.level}
          onChange={(e) => set({ level: +(e.target as HTMLInputElement).value || 1 })} />
      </label>
      <label class="field"><span>Potential</span>
        <select value={spec.pot} onChange={(e) => set({ pot: +(e.target as HTMLSelectElement).value })}>
          {[1, 2, 3, 4, 5, 6].map((p) => <option key={p} value={p}>P{p}</option>)}
        </select>
      </label>
      <label class="field"><span>Trust %</span>
        <input type="number" min={0} max={200} step={10} value={spec.trust} onChange={(e) => set({ trust: +(e.target as HTMLInputElement).value || 0 })} />
      </label>
      {d.modules.length > 0 && (
        <label class="field"><span>Module</span>
          <select value={spec.module ? `${spec.module.letter}${spec.module.stage}` : ""} disabled={spec.elite < 2}
            title={spec.elite < 2 ? "Modules need E2" : ""}
            onChange={(e) => { const v = (e.target as HTMLSelectElement).value; set({ module: v ? { letter: v[0], stage: +v[1] } : null }); }}>
            <option value="">None</option>
            {d.modules.flatMap((m) => [1, 2, 3].filter((s) => m.stages[s - 1]).map((s) => <option key={`${m.letter}${s}`} value={`${m.letter}${s}`}>{m.icon} stage {s}</option>))}
          </select>
        </label>
      )}
      {!compact && d.skills.length > 0 && (
        <>
          <label class="field"><span>Skill</span>
            <select value={spec.skill ?? 0} onChange={(e) => set({ skill: +(e.target as HTMLSelectElement).value })}>
              {d.skills.map((s, i) => <option key={s.id} value={i}>S{i + 1} {s.name}</option>)}
            </select>
          </label>
          <label class="field"><span>Skill level</span>
            <select value={Math.min(spec.skillLevel || maxSl, maxSl)} onChange={(e) => set({ skillLevel: +(e.target as HTMLSelectElement).value })}>
              {Array.from({ length: maxSl }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{levelLabel(n)}</option>)}
            </select>
          </label>
        </>
      )}
    </div>
  );
}

export function StatsView({ d, spec }: { d: OpDetail; spec: BuildSpec }) {
  const s = statsAt(d, spec);
  const bonus = (k: keyof typeof s.total) => {
    const parts = [["trust", s.trust[k as never]], ["potential", s.pot[k as never]], ["module", s.module[k as never]]]
      .filter(([, v]) => v) as [string, number][];
    return parts.length ? parts.map(([n, v]) => `${v > 0 ? "+" : ""}${v} ${n}`).join(", ") : "";
  };
  return (
    <>
      <div class="statgrid">
        {STAT_LABELS.map(([k, label, unit]) => (
          <div key={k} class="stat">
            <div class="k">{label}</div>
            <div class="v">{k === "interval" ? s.total.interval.toFixed(2) : k === "res" ? s.total.res : fmt(s.total[k])}{unit}</div>
            {bonus(k) && <div class="d">{bonus(k)}</div>}
          </div>
        ))}
        <div class="stat"><div class="k">Range</div><div class="v"><Range id={d.phases[spec.elite].range} size={10} /></div></div>
        <div class="stat" title="Estimate: ATK divided by the time between attacks, before enemy DEF/RES, talents and skills">
          <div class="k">ATK / second <span class="badge est">estimate</span></div><div class="v">{fmt(s.atkPerSec)}</div>
        </div>
      </div>
      {s.total.aspd !== 100 && <p class="muted">Attack speed {s.total.aspd} (attacks every {s.attackTime.toFixed(2)} s).</p>}
      <Explain>Stats at E{spec.elite} Lv {spec.level}, P{spec.pot}, {spec.trust}% trust (trust bonuses stop at 100%){spec.module ? `, module ${spec.module.letter}${spec.module.stage}` : ""}. ATK/second is a rough comparison number, not DPS.</Explain>
    </>
  );
}

const SP_NAMES = { auto: "Auto recovery", offensive: "Offensive recovery", defensive: "Defensive recovery", passive: "No SP" };

export function SkillView({ skill, index, level, onLevel }: { skill: Skill; index: number; level: number; onLevel?: (n: number) => void }) {
  const [failed, setFailed] = useState(false);
  const lv = skill.levels[Math.min(level, skill.levels.length) - 1];
  if (!lv) return null;
  return (
    <div class="skill">
      <div class="skill-head">
        {failed ? <span class="ph" aria-hidden="true" /> : <img src={art.skill(skill.icon)} alt="" loading="lazy" onError={() => setFailed(true)} />}
        <div>
          <h3 style={{ margin: 0 }}>S{index + 1} · {skill.name}</h3>
          <small>{SP_NAMES[skill.sp] || skill.sp} · {skill.type === "manual" ? "Manual trigger" : skill.type === "auto" ? "Auto trigger" : "Passive"}{skill.ammo ? " · ammo" : ""}</small>
        </div>
      </div>
      {onLevel && (
        <div class="seg" role="group" aria-label={`S${index + 1} level`} style={{ marginBottom: "8px", flexWrap: "wrap" }}>
          {skill.levels.map((_, i) => (
            <button key={i} aria-pressed={i + 1 === level} class="small" onClick={() => onLevel(i + 1)}>{levelLabel(i + 1)}</button>
          ))}
        </div>
      )}
      <dl class="kv" style={{ marginBottom: "8px" }}>
        {skill.sp !== "passive" && <><dt>SP</dt><dd>{lv.sp} cost · {lv.init} initial</dd></>}
        {lv.dur > 0 && <><dt>Duration</dt><dd>{lv.dur} s</dd></>}
        {lv.range && <><dt>Range</dt><dd><Range id={lv.range} size={10} /></dd></>}
      </dl>
      <p><Rich html={lv.desc} /></p>
    </div>
  );
}

export function TalentsView({ d }: { d: OpDetail }) {
  if (!d.talents.length) return <p class="muted">No talents.</p>;
  return (
    <div class="stack">
      {d.talents.map((cands, i) => (
        <div key={i} class="card">
          <h3>{cands[cands.length - 1].name || `Talent ${i + 1}`}</h3>
          <div class="table-wrap">
            <table class="cards">
              <thead><tr><th>Unlocks at</th><th>Effect</th><th>Range</th></tr></thead>
              <tbody>
                {cands.map((c, j) => (
                  <tr key={j}>
                    <td data-label="Unlocks at">E{c.elite} Lv {c.level}{c.pot ? `, P${c.pot + 1}` : ""}</td>
                    <td data-label="Effect"><Rich html={c.desc} /></td>
                    <td data-label="Range">{c.range ? <Range id={c.range} size={8} /> : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ModulesView({ d }: { d: OpDetail }) {
  if (!d.modules.length) return <p class="muted">No modules on this server.</p>;
  return (
    <div class="stack">
      {d.modules.map((m) => (
        <div key={m.id} class="card">
          <h3>{m.icon} · {m.name}</h3>
          <p class="muted">Unlocks at E{m.unlock.elite} Lv {m.unlock.level}</p>
          <div class="table-wrap">
            <table class="cards">
              <thead><tr><th>Stage</th><th>Stats</th><th>Trait / talent</th><th>Cost</th></tr></thead>
              <tbody>
                {m.stages.map((s, i) => (
                  <tr key={i}>
                    <td data-label="Stage">{i + 1}</td>
                    <td data-label="Stats">{Object.entries(s.attrs).map(([k, v]) => `${k.toUpperCase()} ${v > 0 ? "+" : ""}${v}`).join(", ") || "–"}</td>
                    <td data-label="Trait / talent">
                      {s.trait.map((t, j) => <p key={j}><Rich html={t} /></p>)}
                      {s.talents.map((t, j) => <p key={`t${j}`}><strong>{t.name}</strong>: <Rich html={t.desc} /></p>)}
                    </td>
                    <td data-label="Cost"><Items cost={m.cost[i] || []} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RiicView({ d }: { d: OpDetail }) {
  if (!d.riic.length) return <p class="muted">No base skills.</p>;
  return (
    <div class="table-wrap">
      <table class="cards">
        <thead><tr><th>Skill</th><th>Room</th><th>Unlocks</th><th>Effect</th></tr></thead>
        <tbody>
          {d.riic.map((r, i) => (
            <tr key={i}>
              <td data-label="Skill"><span class="row tight"><img src={art.riic(r.icon)} alt="" width={28} height={28} loading="lazy" style={{ borderRadius: "4px", background: "var(--surface-3)" }} onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} /> {r.name}</span></td>
              <td data-label="Room">{ROOM_NAMES[r.room] || r.room}</td>
              <td data-label="Unlocks">E{r.elite}{r.level > 1 ? ` Lv ${r.level}` : ""}</td>
              <td data-label="Effect"><Rich html={r.desc} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function costRows(d: OpDetail): { label: string; cost: Cost }[] {
  const c = metaSig.value?.const;
  const rows: { label: string; cost: Cost }[] = [];
  for (let e = 1; e < d.phases.length; e++) {
    const lv = c ? levelCost(c, e - 1, 1, d.phases[e - 1].max) : {};
    rows.push({ label: `Level E${e - 1} 1→${d.phases[e - 1].max}`, cost: lv });
    rows.push({ label: `Promote to E${e}`, cost: promotionCost(d, e) });
  }
  const top = d.phases.length - 1;
  if (c) rows.push({ label: `Level E${top} 1→${d.phases[top].max}`, cost: levelCost(c, top, 1, d.phases[top].max) });
  d.skillUp.forEach((_, i) => rows.push({ label: `Skill level ${i + 1}→${i + 2}`, cost: skillLevelCost(d, i + 1, i + 2) }));
  d.skills.forEach((s, i) => s.mastery.forEach((m, j) => rows.push({ label: `S${i + 1} M${j}→M${j + 1} (${m.hours} h)`, cost: masteryCost(d, i, j, j + 1) })));
  d.modules.forEach((m) => [1, 2, 3].forEach((st) => m.cost[st - 1]?.length && rows.push({ label: `Module ${m.icon} stage ${st}`, cost: moduleCost(d, m.letter, st - 1, st) })));
  return rows;
}

export function CostsView({ d }: { d: OpDetail }) {
  const values = itemsSig.value?.values || {};
  const rows = costRows(d);
  const total = rows.reduce<Cost>((acc, r) => add(acc, r.cost), {});
  const onlyLmd = Object.keys(total).every((k) => k === LMD || k === "EXP");
  return (
    <>
      {onlyLmd && d.skills.length > 0 && <p class="note">The game tables list no materials for this operator's skills and modules: it's upgraded another way (for example through Integrated Strategies).</p>}
      <div class="table-wrap">
        <table class="cards">
          <thead><tr><th>Upgrade</th><th>Materials</th><th class="num">Sanity value</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}><td data-label="Upgrade">{r.label}</td><td data-label="Materials"><Items cost={r.cost} /></td>
                <td data-label="Sanity value" class="num">{fmt(sanity(r.cost, values))}</td></tr>
            ))}
            <tr><td data-label=""><strong>Everything</strong></td><td data-label="Materials"><Items cost={total} /></td><td class="num" data-label="Sanity value"><strong>{fmt(sanity(total, values))}</strong></td></tr>
          </tbody>
        </table>
      </div>
      <Explain>Sanity value: each material priced at what it costs to farm, from Yituliu's values (corrected for this server's drop rates where they differ). LMD is {LMD in values ? `${(values[LMD] * 1000).toFixed(2)} sanity per 1,000` : "valued"}; EXP via Battle Records.</Explain>
    </>
  );
}

export function CommunityView({ id, rarity, u, is, modules }: { id: string; rarity: number; u?: UsageRow; is?: ISFile; modules: string[] }) {
  const cats: Category[] = ["main", "event", "annihilation", "cc", "supply"];
  const isRows = (is?.themes || []).map((t) => ({ theme: t, pick: t.picks.find((p) => p.id === id) })).filter((r) => r.pick);
  const b = u?.build || {};
  const buildText = [b.elite ? `E${b.elite}` : null, b.skill ? `S${b.skill}${b.mastery ? ` M${b.mastery}` : ""}` : null,
    b.module ? `Mod ${b.module}` : null].filter(Boolean).join(", ");
  if (!u && !isRows.length) return <p class="muted">No community data for this operator yet (CN guides and surveys haven't covered it).</p>;
  return (
    <div class="stack">
      <div class="card">
        <h3>Usage by content</h3>
        <div class="table-wrap">
          <table class="cards">
            <thead><tr><th>Content</th><th class="num">Usage</th><th>Share</th></tr></thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c}><td data-label="Content">{CATEGORY_NAMES[c]}</td><td data-label="Usage" class="num">{pct(u?.u?.[c] || 0)}</td>
                  <td data-label="Share"><div class="bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (u?.u?.[c] || 0) * 250)}%` }} /></div></td></tr>
              ))}
              <tr><td data-label="Content">{CATEGORY_NAMES.is}</td><td data-label="Usage" class="num" colSpan={2}>
                {isRows.length ? isRows.map((r) => `${r.theme.name}: priority ${r.pick!.recruit}${r.pick!.key ? " (key)" : ""}`).join(" · ") : "Not ranked"}
              </td></tr>
            </tbody>
          </table>
        </div>
        <Explain>Usage: share of community clear guides (MAA Copilot, CN) for that content that use the operator, each stage counted equally. IS: MAA's recruit priority for the theme (higher recruits earlier).</Explain>
      </div>
      <div class="card">
        <h3>Community build</h3>
        <p><strong>{buildText || (rarity <= 3 ? "Usually used as is" : "No clear consensus")}</strong></p>
        {u?.inv && (
          <dl class="kv">
            <dt>Owned by</dt><dd>{pct(u.inv.own)} of surveyed accounts</dd>
            <dt>E2</dt><dd>{pct(u.inv.e2)} of owners</dd>
            {Object.entries(u.inv.m3).map(([k, v]) => <Fragment key={`m${k}`}><dt>S{k} M3</dt><dd>{pct(v)} of E2 owners</dd></Fragment>)}
            {Object.entries(u.inv.mod).map(([k, v]) => <Fragment key={`d${k}`}><dt>Mod {k}{modules.includes(k) ? "" : " (not here yet)"}</dt><dd>{pct(v)} of E2 owners (stage 3: {pct(u.inv!.mod3[k] || 0)})</dd></Fragment>)}
          </dl>
        )}
        {u?.skill && Object.keys(u.skill).length > 0 && (
          <p class="muted">Guides use {Object.entries(u.skill).sort((a, b) => b[1] - a[1]).map(([k, v]) => `S${k} ${pct(v, 0)}`).join(", ")}{u.e2 ? `; ${pct(u.e2, 0)} of guides stating a promotion ask for E2` : ""}.</p>
        )}
        {u?.lift !== undefined && <p>Lift: <strong>{u.lift.toFixed(2)}×</strong> <span class="muted">(usage ÷ ownership; above 1 means clears pick it more than its ownership rate suggests)</span></p>}
        <Explain>The build at least half of clear guides or owners use: promotion and mastery from guides and Yituliu's survey of ~100k CN accounts, module from both. Guides state requirements only about 29% of the time.</Explain>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return <section class="card"><h2>{title}</h2>{children}</section>;
}
