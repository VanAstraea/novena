import { useMemo, useState } from "preact/hooks";
import { Avatar, Await, Explain, Tabs, useAsync } from "../components/ui";
import { Evaluator, LAYOUTS, production, PRODUCT_LABEL, ROOM_LABEL, rotation, skillsAt, standardLayout, type BaseFile, type Room, type Team } from "../lib/base";
import { load, operators } from "../lib/data";
import { fmt } from "../lib/format";
import { href } from "../lib/router";
import { account, hasRoster, server } from "../state";
import type { OpIndex } from "../types";

export default function Base() {
  const s = server.value;
  const st = useAsync(() => Promise.all([load<BaseFile>(`${s}/base.json`), operators(s)]), [s]);
  return (
    <div class="stack fade-in">
      <h1>Base (RIIC) optimizer</h1>
      {!hasRoster.value ? (
        <div class="card"><p>The base optimizer picks teams from your operators, so it needs your roster. <a href={href("/roster")}>Add it under My roster</a>.</p></div>
      ) : (
        <Await state={st} what="base data">{([data, ops]) => <View data={data} ops={new Map(ops.map((o) => [o.id, o]))} />}</Await>
      )}
    </div>
  );
}

function View({ data, ops }: { data: BaseFile; ops: Map<string, OpIndex> }) {
  const [layout, setLayout] = useState("243");
  const [shifts, setShifts] = useState(2);
  const [tab, setTab] = useState("A");
  const [copied, setCopied] = useState(false);
  const roster = account.value.ops;
  const plan = useMemo(() => {
    const rooms = standardLayout(layout);
    const skills = new Map(Object.values(roster).map((r) => [r.id, skillsAt(data, r.id, r.elite, r.level)]));
    const ev = new Evaluator(data, skills, rooms);
    return rotation(rooms, ev, new Set(Object.keys(roster)), shifts);
  }, [data, roster, layout, shifts]);
  const names = (t: Team) => t.members.map((m) => ops.get(m)?.name || m).join(", ");
  const text = plan.map((a, i) => [`Shift ${"ABC"[i]} (${24 / shifts} h)`, ...a.map(([r, t]) => `  ${ROOM_LABEL[r.facility]} (${PRODUCT_LABEL[r.product] || r.product}): ${names(t) || "—"}`)].join("\n")).join("\n\n");
  const shown = plan["ABC".indexOf(tab)] || plan[0];
  const avg = plan.reduce((s, a) => s + production(a), 0) / plan.length;
  // base skills a promotion away: for owned operators, what E1/E2 would add to the plan (single best room)
  const unlocks = useMemo(() => unlockGains(data, roster, layout, shifts, avg), [data, roster, layout, shifts]);
  return (
    <>
      <section class="card">
        <div class="row" style={{ alignItems: "flex-end" }}>
          <label class="field"><span>Layout (Trading Posts, Factories, Power Plants)</span>
            <select value={layout} onChange={(e) => setLayout((e.target as HTMLSelectElement).value)}>
              {Object.keys(LAYOUTS).map((l) => <option key={l} value={l}>{l.split("").join("-")}</option>)}
            </select>
          </label>
          <label class="field"><span>Shifts</span>
            <select value={shifts} onChange={(e) => { setShifts(+(e.target as HTMLSelectElement).value); setTab("A"); }}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n} ({24 / n} h each)</option>)}
            </select>
          </label>
          <button onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy as text"}</button>
        </div>
        <p style={{ marginTop: "10px" }}>Average production bonus: <strong>+{fmt(avg)}%</strong> <span class="muted">(rooms' percent bonuses added up, over the rotation)</span></p>
      </section>
      {plan.length > 1 && <Tabs label="Shifts" value={tab} onChange={setTab} tabs={plan.map((_, i) => ({ key: "ABC"[i], label: `Shift ${"ABC"[i]}` }))} />}
      <div class="table-wrap">
        <table class="cards">
          <thead><tr><th>Room</th><th>Makes</th><th>Team</th><th class="num">Bonus</th></tr></thead>
          <tbody>
            {shown.map(([r, t], i) => <RoomRow key={i} room={r} team={t} ops={ops} />)}
          </tbody>
        </table>
      </div>
      <Explain>Skill values from MAA's curated base data; skill combinations (like Texas + Lappland) count when all their members are placed. Each shift takes the best teams from who's left. Morale, faction buffs and dorms aren't modelled, so rest the tired ones yourself.</Explain>
      {unlocks.length > 0 && (
        <section class="card">
          <h2>Base skills worth unlocking</h2>
          <ul>{unlocks.slice(0, 8).map((u) => <li key={u.id}><a href={href(`/operator/${u.id}`)}>{ops.get(u.id)?.name}</a> at E{u.elite}: +{u.gain.toFixed(1)}% average production</li>)}</ul>
          <Explain>Promoting these operators unlocks a base skill that would raise the rotation's average.</Explain>
        </section>
      )}
    </>
  );
}

function RoomRow({ room, team, ops }: { room: Room; team: Team; ops: Map<string, OpIndex> }) {
  return (
    <tr>
      <td data-label="Room">{ROOM_LABEL[room.facility]}</td>
      <td data-label="Makes">{PRODUCT_LABEL[room.product] || room.product}</td>
      <td data-label="Team">
        <span class="row tight">
          {team.members.map((m) => { const op = ops.get(m); return op ? <a key={m} class="op-cell" href={href(`/operator/${m}`)} title={op.name}><Avatar op={op} size="sm" /><small>{op.name}</small></a> : null; })}
          {!team.members.length && <span class="muted">Anyone</span>}
        </span>
        {team.group && <small class="muted">{team.group}</small>}
        {team.boosts && Object.keys(team.boosts).length > 0 && <small class="muted">{Object.entries(team.boosts).map(([f, v]) => `${ROOM_LABEL[f as keyof typeof ROOM_LABEL]}s +${v}%`).join(", ")}</small>}
      </td>
      <td data-label="Bonus" class="num">{team.efficiency ? `+${fmt(team.efficiency)}%` : "–"}</td>
    </tr>
  );
}

function unlockGains(data: BaseFile, roster: Record<string, { id: string; elite: number; level: number }>, layout: string, shifts: number, base: number) {
  const rooms = standardLayout(layout);
  const out: { id: string; elite: number; gain: number }[] = [];
  const skills = new Map(Object.values(roster).map((r) => [r.id, skillsAt(data, r.id, r.elite, r.level)]));
  for (const r of Object.values(roster)) {
    for (const e of [1, 2]) {
      if (e <= r.elite) continue;
      const next = skillsAt(data, r.id, e, 1);
      if ([...next].every((s) => skills.get(r.id)!.has(s))) continue;
      const trial = new Map(skills);
      trial.set(r.id, next);
      const ev = new Evaluator(data, trial, rooms);
      const plan = rotation(rooms, ev, new Set(Object.keys(roster)), shifts);
      const gain = plan.reduce((s, a) => s + production(a), 0) / plan.length - base;
      if (gain > 0.5) out.push({ id: r.id, elite: e, gain });
      break;
    }
  }
  return out.sort((a, b) => b.gain - a.gain);
}
