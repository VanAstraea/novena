// The quick operator panel (after ako's operator drawer): click an operator anywhere and this opens beside the page,
// without leaving it. Your build, the next upgrades worth making (what players most often do next, priced, checked
// against your depot), one-click "Make it a goal" and "Farm what's short", the comparison list, and what other pages
// know about the operator. It lives in the address (?op=char_x), so Back closes it and a link reopens it.
import { useEffect } from "preact/hooks";
import { costTable, lastPlan } from "../lib/account";
import type { BaseFile } from "../lib/base";
import { parse } from "../lib/build";
import { EXP, LMD, sanity, stateCost, type Cost, type CostData, type OpState } from "../lib/costs";
import { Stock } from "../lib/crafting";
import { art, integrated, load, operators, recruit as loadRecruit, upcoming as loadUpcoming, usage as loadUsage } from "../lib/data";
import { date, fmt } from "../lib/format";
import { href, navigate, route, setQuery } from "../lib/router";
import { pref, setPref } from "../lib/storage";
import { bestTrainers, hm } from "../lib/training";
import { account, prefs, saveTargets, server, targets } from "../state";
import type { ItemsFile, OpIndex, UsageRow } from "../types";
import { toast } from "./Toast";
import { Art, Await, GIcon, Items, itemsSig, metaSig, Stars, useAsync } from "./ui";

const MAX_COMPARE = 4;
export const compareList = (): string[] => { try { return JSON.parse(pref("compare", "[]")); } catch { return []; } };
export function rememberOperator(id: string): void {
  try { setPref("recentOps", JSON.stringify([id, ...JSON.parse(pref("recentOps", "[]")).filter((x: string) => x !== id)].slice(0, 6))); } catch { /* ignore */ }
}

interface Option { text: string; to: OpState; cost: Cost; sanity: number; short: Cost; rate: number; trainer?: string }

/** The next upgrades worth making: the steps toward what players build this operator to, most common first. */
function options(op: OpIndex, d: CostData, u: UsageRow | undefined, from: OpState, items: ItemsFile, c: Parameters<typeof stateCost>[1]): Option[] {
  const out: Option[] = [];
  const top = d.phases.length - 1, cap = d.phases[top].max;
  const inv = u?.inv;
  const add = (text: string, patch: Partial<OpState>, rate: number) => {
    const to = { ...from, ...patch, masteries: patch.masteries || from.masteries, modules: { ...from.modules, ...patch.modules } };
    const cost = stateCost(d, c, from, to, !!op.patch);
    if (!Object.keys(cost).length) return;
    const stock = new Stock(account.value.depot, items.recipes);
    const short: Cost = {};
    for (const [id, n] of Object.entries(cost)) Object.assign(short, stock.pay({ [id]: n }));
    out.push({ text, to, cost, sanity: sanity(cost, items.values), short, rate });
  };
  if (from.elite < top) add(`E${top}`, { elite: top, level: 1, skillLevel: Math.max(from.skillLevel, 1) }, inv?.e2 ?? u?.e2 ?? 0.5);
  else if (from.level < cap) add(`Level ${cap}`, { level: cap }, inv?.e2 ?? 0.5);
  if (from.elite >= 1 && from.skillLevel < 7) add("Skill level 7", { skillLevel: 7 }, 0.95);
  if (from.elite === 2) {
    d.skills.forEach((_, i) => {
      const k = String(i + 1);
      const rate = Math.max(inv?.m3?.[k] || 0, (u?.m3?.[k] || 0) * (u?.skill?.[k] || 0));
      if ((from.masteries[i] || 0) < 3 && (rate >= 0.25 || u?.build.skill === i + 1)) {
        const masteries = [...from.masteries];
        masteries[i] = 3;
        add(`S${i + 1} M3`, { masteries, skillLevel: 7 }, rate);
      }
    });
    for (const m of d.modules) {
      const have = from.modules[m.letter] || 0;
      const rate1 = inv?.mod?.[m.letter] || (u?.mod?.[m.letter] || 0);
      if (have < 1 && (rate1 >= 0.25 || u?.build.module === m.letter)) add(`Mod ${m.letter}1`, { modules: { [m.letter]: 1 } }, rate1);
      const rate3 = inv?.mod3?.[m.letter] || 0;
      if (have < 3 && rate3 >= 0.2) add(`Mod ${m.letter}3`, { modules: { [m.letter]: 3 } }, rate3);
    }
  }
  return out.sort((a, b) => b.rate - a.rate || a.sanity - b.sanity);
}

export function OperatorPanel() {
  const id = route.value.query.get("op");
  useEffect(() => {
    if (!id) return;
    rememberOperator(id);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [id]);
  if (!id) return null;
  return (
    <>
      <div class="drawer-bg" onClick={close} />
      <div class="drawer" role="dialog" aria-modal="true" aria-label="Operator">
        <Body id={id} />
      </div>
    </>
  );
}

function close() {
  if (history.state?.panel) history.back();
  else setQuery({ op: null });
}

function Body({ id }: { id: string }) {
  const s = server.value;
  const st = useAsync(() => Promise.all([operators(s), costTable(s), loadUsage(), integrated(s), loadRecruit(s), loadUpcoming(s).catch(() => null), load<BaseFile>(`${s}/base.json`)]), [s]);
  return (
    <Await state={st} what="the operator">
      {([ops, costs, usage, is, rec, up, base]) => {
        const op = ops.find((o) => o.id === id);
        const items = itemsSig.value, meta = metaSig.value;
        if (!op) return <p>Unknown operator. <button onClick={close}>Close</button></p>;
        if (!items || !meta) return <p class="muted">Loading…</p>;
        const d = costs[id];
        const r = account.value.ops[id];
        const u = usage.ops[id];
        const from: OpState | null = r ? { elite: r.elite, level: r.level, skillLevel: r.skillLevel, masteries: r.masteries, modules: r.modules } : null;
        const opts = from && d ? options(op, d, u, from, items, meta.const) : [];
        const byId = new Map(ops.map((o) => [o.id, o]));
        for (const o of opts) {
          const m = /^S(\d) M3$/.exec(o.text);
          if (m && d) {
            const best = bestTrainers(base, account.value.ops, op, 3, d.skills[+m[1] - 1].mastery[2]?.hours || 24, 1)[0];
            if (best) o.trainer = `${byId.get(best.id)?.name || best.id} trains M3 in ${hm(best.hours)}`;
          }
        }
        const goal = targets.value.find((t) => t.id === id);
        const planned = (lastPlan.value?.result.steps || []).map((st, i) => ({ st, i })).filter((x) => x.st.id === id);
        const inCompare = compareList().includes(id);
        const theme = is.themes[is.themes.length - 1];
        const isPick = theme?.picks.find((p) => p.id === id);
        const banners = (up?.banners || []).filter((b) => b.featured.includes(id));
        const tags = rec.pool.find((p) => p.id === id)?.tags.map((t) => rec.tags.find((x) => x.id === t)?.name).filter(Boolean);
        const daily = prefs.value.daily || 240;

        const makeGoal = (o: Option) => {
          const step = o.text.replace(/^Level (\d+)$/, `E${o.to.elite} L$1`).replace(/^Skill level 7$/, "SL7");
          const text = goal ? `${goal.text}, ${step}` : step;
          try { parse(`${op.name} ${text}`); } catch (e) { toast((e as Error).message, { kind: "bad" }); return; }
          saveTargets([...targets.value.filter((t) => t.id !== id), { id, text }]);
          toast(`${op.name}: ${o.text} is a goal now.`, { link: { href: href("/planner"), label: "Open the planner" } });
        };
        const toggleCompare = () => {
          const list = compareList().filter((x) => x !== id);
          if (!inCompare) list.push(id);
          const kept = list.slice(-MAX_COMPARE);
          setPref("compare", JSON.stringify(kept));
          toast(inCompare ? `${op.name} left the comparison.` : `${op.name} added to the comparison (${kept.length} of ${MAX_COMPARE}).`,
            { link: kept.length ? { href: href("/compare", { ops: kept.join(",") }), label: "Compare" } : undefined });
          setQuery({ op: id }); // redraw
        };
        const farmShort = (o: Option) => Object.entries(o.short).filter(([k]) => k !== LMD && k !== EXP).map(([k, n]) => `${k}:${n}`).join(",");
        return (
          <>
            <div class="drawer-head">
              <Art srcs={art.portraits(id, r?.elite || 0)} class="portrait" alt="" />
              <div class="who">
                <div class="row" style={{ justifyContent: "flex-end" }}>
                  <button class="small" onClick={toggleCompare}>{inCompare ? "In comparison ✓" : "Compare"}</button>
                  <button class="small" onClick={() => navigate(href(`/operator/${id}`))}>Full page</button>
                  <button class="small ghost" onClick={close} aria-label="Close">✕</button>
                </div>
                <h2 class="drawer-name">{op.name}</h2>
                <div class="row tight"><Stars n={op.rarity} img /> <GIcon src={art.classIcon(op.cls)} alt={op.cls} size={20} /> <small class="muted">{op.branch}</small></div>
                <p class="muted" style={{ margin: "8px 0 0" }}>{r ? `Yours: E${r.elite} Lv ${r.level} · P${r.pot} · SL${r.skillLevel}${r.masteries.some(Boolean) ? ` · ${r.masteries.map((m, i) => m ? `S${i + 1}M${m}` : "").filter(Boolean).join(" ")}` : ""}${Object.entries(r.modules).filter(([, v]) => v).map(([k, v]) => ` · Mod ${k}${v}`).join("")}` : "Not in your roster."}</p>
              </div>
            </div>

            <h3>Next upgrades</h3>
            {planned.length > 0 && <p>In your plan: {planned.map(({ i }) => <span key={i} class="badge" style={{ marginRight: "6px" }}>#{i + 1}</span>)} <a href={href("/plan")}>Plan</a></p>}
            {!r ? <p class="muted">Add {op.name} to your roster to see what to raise next.</p>
              : !opts.length ? <p class="muted">Built as far as players usually take {op.name}.</p>
              : opts.map((o, i) => {
                const shortSanity = sanity(o.short, items.values);
                const ready = !Object.keys(o.short).filter((k) => k !== LMD && k !== EXP).length;
                return (
                  <details key={o.text} class="opt" open={i === 0}>
                    <summary>
                      <strong>{o.text}</strong>{i === 0 && <span class="badge" style={{ marginLeft: "6px" }}>most common next</span>}
                      <span class="muted"> · {Math.round(o.rate * 100)}% of players · ~{fmt(o.sanity)} sanity</span>
                      <span class={ready ? "good-text" : "warn-text"}> · {ready ? "Ready" : "Short"}</span>
                    </summary>
                    <div class="opt-body">
                      <Items cost={o.cost} />
                      {!ready && <p class="muted" style={{ margin: "6px 0 0" }}>Short of ~{fmt(shortSanity)} sanity of materials: about {Math.max(1, Math.ceil(shortSanity / daily))} day{Math.ceil(shortSanity / daily) === 1 ? "" : "s"} of sanity at {daily} a day.</p>}
                      {o.trainer && <p class="muted" style={{ margin: "6px 0 0" }}>{o.trainer}.</p>}
                      <div class="row" style={{ marginTop: "8px" }}>
                        <button class="small primary" onClick={() => makeGoal(o)}>Make it a goal</button>
                        {!ready && farmShort(o) && <a class="btn small" href={href("/farming", { items: farmShort(o) })}>Farm what's short</a>}
                      </div>
                    </div>
                  </details>
                );
              })}

            <h3>Elsewhere</h3>
            <ul class="elsewhere">
              {goal && <li><span class="lbl">Goal</span> {goal.text} <a href={href("/planner")}>planner</a></li>}
              {u?.score !== undefined && <li><span class="lbl">Community</span> used in {Math.round((u.score || 0) * 100)}% of clears{u.build.elite ? ` · usual build E${u.build.elite}${u.build.skill ? ` S${u.build.skill}${u.build.mastery ? ` M${u.build.mastery}` : ""}` : ""}${u.build.module ? ` Mod ${u.build.module}` : ""}` : ""}</li>}
              {isPick && <li><span class="lbl">IS</span> {theme.name}: recruit priority {isPick.recruit}{isPick.key ? " · key operator" : ""} <a href={href("/is")}>IS</a></li>}
              {banners.map((b) => <li key={b.id}><span class="lbl">Banner</span> ~{date(b.eta)}{b.spark ? ` · ${b.spark}-pull guarantee` : ""} <a href={href("/upcoming", { view: "banners" })}>banners</a></li>)}
              {tags && tags.length > 0 && <li><span class="lbl">Recruit</span> {tags.join(", ")} <a href={href("/recruit")}>recruit</a></li>}
            </ul>
          </>
        );
      }}
    </Await>
  );
}
