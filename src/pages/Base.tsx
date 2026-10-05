import { useMemo, useState } from "preact/hooks";
import { Avatar, Await, Explain, Tabs, useAsync } from "../components/ui";
import { Evaluator, LAYOUTS, production, PRODUCT_LABEL, ROOM_LABEL, rotation, skillsAt, standardLayout, type BaseFile, type Room, type Team } from "../lib/base";
import { load, operators } from "../lib/data";
import { DEFAULT_DORMS, dormPlan, dormRate, drains, lasts, MAX_MORALE, type DormSettings } from "../lib/morale";
import { pref, setPref } from "../lib/storage";
import { CLASSES, hm, trainersByClass, workshopPicks } from "../lib/training";
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
  const [dorms, setDorms] = useState<DormSettings>(() => { try { return { ...DEFAULT_DORMS, ...JSON.parse(pref("dorms", "{}")) }; } catch { return DEFAULT_DORMS; } });
  const saveDorms = (patch: Partial<DormSettings>) => { const next = { ...dorms, ...patch }; setDorms(next); setPref("dorms", JSON.stringify(next)); };
  const skills = useMemo(() => new Map(Object.values(roster).map((r) => [r.id, skillsAt(data, r.id, r.elite, r.level)])), [data, roster]);
  const plan = useMemo(() => {
    const rooms = standardLayout(layout);
    const ev = new Evaluator(data, skills, rooms);
    return rotation(rooms, ev, new Set(Object.keys(roster)), shifts);
  }, [data, skills, layout, shifts]);
  const names = (t: Team) => t.members.map((m) => ops.get(m)?.name || m).join(", ");
  const text = plan.map((a, i) => [`Shift ${"ABC"[i]} (${24 / shifts} h)`, ...a.map(([r, t]) => `  ${ROOM_LABEL[r.facility]} (${PRODUCT_LABEL[r.product] || r.product}): ${names(t) || "—"}`)].join("\n")).join("\n\n");
  const k = Math.max(0, "ABC".indexOf(tab));
  const shown = plan[k] || plan[0];
  const shiftHours = MAX_MORALE / shifts;
  const roomHours = drains(data, skills, shown).map(lasts);
  const rest = useMemo(() => (plan.length > 1 ? dormPlan(data, skills, plan, k, Object.keys(roster), dorms) : null), [plan, k, dorms]);
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
          <thead><tr><th>Room</th><th>Makes</th><th>Team</th><th class="num">Bonus</th><th class="num" title="From full morale, before the first member runs out">Lasts</th></tr></thead>
          <tbody>
            {shown.map(([r, t], i) => <RoomRow key={i} room={r} team={t} ops={ops} hours={roomHours[i]} shiftHours={shiftHours} />)}
          </tbody>
        </table>
      </div>
      <Explain>Skill values from MAA's curated base data; skill combinations (like Texas + Lappland) count when all their members are placed. Each shift takes the best teams from who's left. "Lasts" is how long a team works from full morale (24) before its first member runs out, with the game's default drain and the team's own morale skills; it's flagged when that's shorter than the shift. Faction buffs and conditional effects aren't modelled.</Explain>
      {rest && <DormCard plan={rest} shift={"ABC"[k]} ops={ops} dorms={dorms} save={saveDorms} />}
      {shifts === 1 && <p class="note">With one shift, nobody rests: every team runs out of morale before the day is over. Two or three shifts let the others recover in the dorms.</p>}
      <TrainingCard data={data} ops={ops} />
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

function DormCard({ plan, shift, ops, dorms, save }: { plan: NonNullable<ReturnType<typeof dormPlan>>; shift: string; ops: Map<string, OpIndex>; dorms: DormSettings; save: (p: Partial<DormSettings>) => void }) {
  const name = (id: string) => ops.get(id)?.name || id;
  const num = (label: string, key: keyof DormSettings, min: number, max: number, step = 1) => (
    <label class="field"><span>{label}</span><input type="number" min={min} max={max} step={step} value={dorms[key]} onChange={(e) => save({ [key]: Math.min(max, Math.max(min, Number((e.target as HTMLInputElement).value) || min)) })} /></label>
  );
  return (
    <section class="card">
      <h2>Dorms while shift {shift} works</h2>
      <div class="row" style={{ alignItems: "flex-end", marginBottom: "10px" }}>
        {num("Dorms", "dorms", 1, 4)}{num("Beds each", "beds", 1, 5)}{num("Dorm level", "level", 1, 5)}{num("Ambience", "ambience", 0, 5000, 100)}
        <span class="muted">Recovery about {dormRate(dorms).toFixed(1)} an hour before skills. Off shift: {plan.offHours} h.</span>
      </div>
      <div class="grid two">
        {plan.dorms.map((d, i) => (
          <div key={i} class="dorm">
            <strong>Dorm {i + 1}</strong> <span class="muted">{d.rate.toFixed(2)} an hour</span>
            <ul>
              {d.helpers.map((h) => <li key={h.id}><a href={href(`/operator/${h.id}`)}>{name(h.id)}</a> <span class="muted">helps {h.kind === "everyone" ? "everyone" : "the most tired"} +{h.value.toFixed(2)}/h</span></li>)}
              {d.resting.map((r) => <li key={r.id}>{name(r.id)} <span class={r.full > plan.offHours ? "warn-text" : "muted"}>used {r.used.toFixed(1)}, full in {hm(r.full)}{r.full > plan.offHours ? " (longer than the break)" : ""}</span></li>)}
            </ul>
          </div>
        ))}
      </div>
      {plan.noBed.length > 0 && <p class="warn-text" style={{ marginTop: "8px" }}>No bed for {plan.noBed.length}: {plan.noBed.map((r) => name(r.id)).join(", ")}. Outside the dorms morale doesn't recover, so they start their next shift tired; a third shift or more beds helps.</p>}
      <Explain>Who rests while this shift works: the other shifts' operators who spent the most morale, plus each dorm's best "everyone here recovers faster" and "one operator recovers faster" helper (only the strongest of each counts per dorm). Default numbers, not your base's live ones.</Explain>
    </section>
  );
}

function TrainingCard({ data, ops }: { data: BaseFile; ops: Map<string, OpIndex> }) {
  const roster = account.value.ops;
  const byClass = useMemo(() => trainersByClass(data, roster), [data, roster]);
  const shop = useMemo(() => workshopPicks(data, roster), [data, roster]);
  const name = (id: string) => ops.get(id)?.name || id;
  const hours = [8, 16, 24];
  return (
    <section class="card">
      <h2>Training Room and Workshop</h2>
      <div class="grid two">
        <div>
          <h3>Fastest trainer you own, by class</h3>
          <div class="table-wrap">
            <table class="cards">
              <thead><tr><th>Trainee's class</th><th>To M1</th><th>To M2</th><th>To M3</th></tr></thead>
              <tbody>
                {CLASSES.map(([cls, label]) => (
                  <tr key={cls}>
                    <td data-label="Class">{label}</td>
                    {byClass[cls].map((t, i) => (
                      <td key={i} data-label={`To M${i + 1}`}>{t ? <><a href={href(`/operator/${t.id}`)}>{name(t.id)}</a><br /><small class="muted">+{t.speed}% · {hm(hours[i] / (1 + t.speed / 100))}</small></> : <span class="muted">–</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Explain>A mastery normally takes 8, 16 or 24 hours (some operators' take longer); times shown are for the usual length. Branch extras ("if the trainee is a Besieger") show on each operator's Skills tab and in the Plan.</Explain>
        </div>
        <div>
          <h3>Workshop byproducts</h3>
          {shop.length ? (
            <ul>{shop.map(([scope, list]) => <li key={scope}><strong>{scope}</strong>: {list.map((p) => `${name(p.id)} +${p.pct}%`).join(", ")}</li>)}</ul>
          ) : <p class="muted">None of your operators raises the Workshop's byproduct rate yet.</p>}
          <Explain>Put the operator with the highest rate for what you're crafting in the Workshop before you craft: byproducts are free extra materials.</Explain>
        </div>
      </div>
    </section>
  );
}

function RoomRow({ room, team, ops, hours, shiftHours }: { room: Room; team: Team; ops: Map<string, OpIndex>; hours: number; shiftHours: number }) {
  return (
    <tr>
      <td data-label="Room">{ROOM_LABEL[room.facility]}</td>
      <td data-label="Makes">{PRODUCT_LABEL[room.product] || room.product}</td>
      <td data-label="Team">
        <span class="row tight">
          {team.members.map((m) => { const op = ops.get(m); return op ? <a key={m} class="op-cell" href={href(`/operator/${m}`)} title={op.name}><Avatar op={op} size="sm" /><small>{op.name}</small></a> : null; })}
          {!team.members.length && <span class="muted">Anyone</span>}
        </span>
        {team.group && <small class="muted">skill combination</small>}
        {team.boosts && Object.keys(team.boosts).length > 0 && <small class="muted">{Object.entries(team.boosts).map(([f, v]) => `${ROOM_LABEL[f as keyof typeof ROOM_LABEL]}s +${v}%`).join(", ")}</small>}
      </td>
      <td data-label="Bonus" class="num">{team.efficiency ? `+${fmt(team.efficiency)}%` : "–"}</td>
      <td data-label="Lasts" class={`num${hours < shiftHours ? " warn-text" : ""}`} title={hours < shiftHours ? "Runs out of morale before the shift ends" : undefined}>
        {!team.members.length ? "–" : hours === Infinity ? "Always" : hm(hours)}{hours < shiftHours ? " ⚠" : ""}
      </td>
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
