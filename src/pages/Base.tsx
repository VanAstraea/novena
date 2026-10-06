import type { ComponentChildren } from "preact";
import { useMemo, useState } from "preact/hooks";
import { Avatar, Await, CutHead, Explain, ItemIcon, itemName, Tabs, useAsync } from "../components/ui";
import { Evaluator, gameOrder, LAYOUTS, movesFrom, production, PRODUCT_LABEL, ROOM_LABEL, rotation, shiftBySlot, skillsAt, standardLayout, type BaseFile, type BaseLayout, type Room, type RoomLevels, type Team } from "../lib/base";
import { load, operators } from "../lib/data";
import { DEFAULT_DORMS, dormPlan, dormRate, drains, lasts, MAX_MORALE, type DormSettings } from "../lib/morale";
import { pref, setPref } from "../lib/storage";
import { CLASSES, hm, trainersByClass, workshopPicks } from "../lib/training";
import { duration, fmt, relative } from "../lib/format";
import { href } from "../lib/router";
import { account, dronesFullAt, hasRoster, server, type BaseRoom } from "../state";
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
  const synced = account.value.base;
  const [layout, setLayout] = useState(() => {
    // start from the layout you actually have, when Novena Sync has seen your base
    const n = (k: string) => synced?.rooms.filter((r) => r.room === k).length || 0;
    const mine = `${n("TRADING")}${n("MANUFACTURE")}${n("POWER")}`;
    return LAYOUTS[mine] ? mine : "243";
  });
  // Room levels per layout: saved once you change them, otherwise your base's own (Novena Sync), otherwise all level 3.
  // in the game's order, so Trading Post 1 is the top-left one, as on the map of your base
  const syncedLevels = (): RoomLevels => ({
    trade: gameOrder(synced?.rooms || [], data.layout).filter((r) => r.room === "TRADING").map((r) => r.level),
    mfg: gameOrder(synced?.rooms || [], data.layout).filter((r) => r.room === "MANUFACTURE").map((r) => r.level),
  });
  const [levels, setLevels] = useState<RoomLevels>(() => { try { return { ...syncedLevels(), ...JSON.parse(pref(`baseLevels.${layout}`, "{}")) }; } catch { return syncedLevels(); } });
  const changeLayout = (l: string) => {
    setLayout(l);
    try { setLevels({ ...syncedLevels(), ...JSON.parse(pref(`baseLevels.${l}`, "{}")) }); } catch { setLevels(syncedLevels()); }
  };
  const setLevel = (kind: keyof RoomLevels, i: number, v: number) => {
    const [t, m] = LAYOUTS[layout];
    const list = Array.from({ length: kind === "trade" ? t : m }, (_, j) => levels[kind][j] || 3);
    list[i] = v;
    const next = { ...levels, [kind]: list };
    setLevels(next); setPref(`baseLevels.${layout}`, JSON.stringify(next));
  };
  const [goldBy, setGoldBy] = useState<Record<string, number>>(() => { try { return JSON.parse(pref("baseGold", "{}")); } catch { return {}; } });
  const gold = Math.min(goldBy[layout] ?? LAYOUTS[layout][0], LAYOUTS[layout][1]);
  const setGold = (n: number) => { const next = { ...goldBy, [layout]: n }; setGoldBy(next); setPref("baseGold", JSON.stringify(next)); };
  const [shifts, setShifts] = useState(2);
  const [tab, setTab] = useState("A");
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState(() => pref("baseView", synced ? "now" : "teams"));
  const pick = (v: string) => { setView(v); setPref("baseView", v); };
  const roster = account.value.ops;
  const [dorms, setDorms] = useState<DormSettings>(() => { try { return { ...DEFAULT_DORMS, ...JSON.parse(pref("dorms", "{}")) }; } catch { return DEFAULT_DORMS; } });
  const saveDorms = (patch: Partial<DormSettings>) => { const next = { ...dorms, ...patch }; setDorms(next); setPref("dorms", JSON.stringify(next)); };
  const skills = useMemo(() => new Map(Object.values(roster).map((r) => [r.id, skillsAt(data, r.id, r.elite, r.level)])), [data, roster]);
  const plan = useMemo(() => {
    const rooms = standardLayout(layout, gold, levels);
    const ev = new Evaluator(data, skills, rooms);
    return rotation(rooms, ev, new Set(Object.keys(roster)), shifts);
  }, [data, skills, layout, shifts, levels, gold]);
  const names = (t: Team) => t.members.map((m) => ops.get(m)?.name || m).join(", ");
  const text = plan.map((a, i) => [`Shift ${"ABC"[i]} (${24 / shifts} h)`, ...a.map(([r, t]) => `  ${ROOM_LABEL[r.facility]} (${PRODUCT_LABEL[r.product] || r.product}): ${names(t) || "—"}`)].join("\n")).join("\n\n");
  const k = Math.max(0, "ABC".indexOf(tab));
  const shown = plan[k] || plan[0];
  const shiftHours = MAX_MORALE / shifts;
  const roomHours = drains(data, skills, shown).map(lasts);
  const rest = useMemo(() => (plan.length > 1 ? dormPlan(data, skills, plan, k, Object.keys(roster), dorms) : null), [plan, k, dorms]);
  const avg = plan.reduce((s, a) => s + production(a), 0) / plan.length;
  // base skills a promotion away: for owned operators, what E1/E2 would add to the plan (single best room)
  const unlocks = useMemo(() => unlockGains(data, roster, layout, shifts, avg, levels, gold), [data, roster, layout, shifts, levels, gold]);
  const [nTrade, nMfg] = LAYOUTS[layout];
  const levelPick = (kind: keyof RoomLevels, i: number, label: string) => (
    <label key={`${kind}${i}`} class="field lvl"><span>{label}</span>
      <select value={levels[kind][i] || 3} onChange={(e) => setLevel(kind, i, +(e.target as HTMLSelectElement).value)}>
        {[1, 2, 3].map((n) => <option key={n} value={n}>Lv {n}</option>)}
      </select>
    </label>
  );
  return (
    <>
      <section class="card">
        <div class="row" style={{ alignItems: "flex-end" }}>
          <label class="field"><span>Layout (Trading Posts, Factories, Power Plants)</span>
            <select value={layout} onChange={(e) => changeLayout((e.target as HTMLSelectElement).value)}>
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
        <div class="row room-levels" style={{ alignItems: "flex-end", marginTop: "12px" }}>
          <label class="field lvl"><span>Factories on gold</span>
            <select value={gold} onChange={(e) => setGold(+(e.target as HTMLSelectElement).value)}>
              {Array.from({ length: nMfg + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {Array.from({ length: nTrade }, (_, i) => levelPick("trade", i, `Trading Post ${i + 1}`))}
          {Array.from({ length: nMfg }, (_, i) => levelPick("mfg", i, `Factory ${i + 1}${i < gold ? " (gold)" : " (records)"}`))}
        </div>
        <Explain>A room's level is how many operators it holds: a level-2 Trading Post takes two, so the plan fills it with the best pair (for example a dedicated Proviso post). {synced ? "Levels start from your base as Novena Sync last saw it; changes are kept per layout." : "Changes are kept per layout."} The skill values themselves don't change with level in MAA's data.</Explain>
      </section>
      <CutHead eyebrow="Your rotation" art="nave" title={<>+{fmt(avg)}% production</>}
        sub={<>{shifts === 1 ? "One shift" : `${shifts} shifts of ${24 / shifts} h`} on {layout.split("").join("-")} · rooms' percent bonuses added up, over the rotation</>} />
      <Tabs label="Base sections" value={view} onChange={pick} tabs={[
        ...(synced ? [{ key: "now", label: "Your base now" }] : []),
        { key: "teams", label: "Suggested teams" }, { key: "dorms", label: "Dorms and morale" }, { key: "training", label: "Training and Workshop" },
        { key: "unlocks", label: `Skills to unlock${unlocks.length ? ` (${unlocks.length})` : ""}` },
      ]} />
      {(view === "teams" || view === "dorms") && plan.length > 1 && <Tabs label="Shifts" value={tab} onChange={setTab} tabs={plan.map((_, i) => ({ key: "ABC"[i], label: `Shift ${"ABC"[i]}` }))} />}
      {view === "now" && synced && <BaseNow data={data} ops={ops} plan={plan} layout={layout} skills={skills} dorms={dorms} />}
      {view === "teams" && <>
      <div class="table-wrap">
        <table class="cards">
          <thead><tr><th>Room</th><th>Makes</th><th>Team</th><th class="num">Bonus</th><th class="num" title="From full morale, before the first member runs out">Lasts</th></tr></thead>
          <tbody>
            {shown.map(([r, t], i) => <RoomRow key={i} room={r} team={t} ops={ops} hours={roomHours[i]} shiftHours={shiftHours} />)}
          </tbody>
        </table>
      </div>
      <Explain>Skill values from MAA's curated base data; skill combinations (like Texas + Lappland) count when all their members are placed. Each shift takes the best teams from who's left. "Lasts" is how long a team works from full morale (24) before its first member runs out, with the game's default drain and the team's own morale skills; it's flagged when that's shorter than the shift. Faction buffs and conditional effects aren't modelled.</Explain>
      </>}
      {view === "dorms" && (rest ? <DormCard plan={rest} shift={"ABC"[k]} ops={ops} dorms={dorms} save={saveDorms} />
        : <p class="note">With one shift, nobody rests: every team runs out of morale before the day is over. Two or three shifts let the others recover in the dorms.</p>)}
      {view === "training" && <TrainingCard data={data} ops={ops} />}
      {view === "unlocks" && (unlocks.length === 0 ? <p class="muted">No promotion would unlock a base skill that raises this rotation's production.</p> : (
        <section class="card">
          <h2>Base skills worth unlocking</h2>
          <ul>{unlocks.slice(0, 8).map((u) => <li key={u.id}><a href={href(`/operator/${u.id}`)}>{ops.get(u.id)?.name}</a> at E{u.elite}: +{u.gain.toFixed(1)}% average production</li>)}</ul>
          <Explain>Promoting these operators unlocks a base skill that would raise the rotation's average.</Explain>
        </section>
      ))}
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

function unlockGains(data: BaseFile, roster: Record<string, { id: string; elite: number; level: number }>, layout: string, shifts: number, base: number, levels?: RoomLevels, gold?: number) {
  const rooms = standardLayout(layout, gold, levels);
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

const ROOM_NAME: Record<string, string> = {
  CONTROL: "Control Center", TRADING: "Trading Post", MANUFACTURE: "Factory", POWER: "Power Plant", MEETING: "Reception Room",
  HIRE: "Office", WORKSHOP: "Workshop", TRAINING: "Training Room", DORMITORY: "Dormitory",
};
const ROOM_ORDER = ["CONTROL", "TRADING", "MANUFACTURE", "POWER", "MEETING", "HIRE", "TRAINING", "WORKSHOP", "DORMITORY"];
const STRATEGY: Record<string, string> = { O_GOLD: "LMD orders", O_DIAMOND: "Orundum orders" };

// short names for the map, whose rooms are narrow (the full name is in each room's tooltip)
const MAP_NAME: Record<string, string> = {
  CONTROL: "Control Center", TRADING: "Trading", MANUFACTURE: "Factory", POWER: "Power", MEETING: "Reception",
  HIRE: "Office", WORKSHOP: "Workshop", TRAINING: "Training", DORMITORY: "Dorm",
};

const until = (t: number | undefined, now: number) => (t && t > now ? `in ${duration((t - now) * 1000)}` : t && t > 0 ? "done" : "");
const moraleClass = (m: number) => (m < 6 ? "low" : m < 12 ? "mid" : "");

/** Your base as Novena Sync last saw it: every room, its team and their morale, what it's making and when it's done.
 *  Drawn as the game lays the base out when the base data has its slot grid; as a list of rooms otherwise. */
function BaseNow({ data, ops, plan, layout, skills, dorms }: {
  data: BaseFile; ops: Map<string, OpIndex>; plan: [Room, Team][][]; layout: string; skills: Map<string, Set<string>>; dorms: DormSettings;
}) {
  const b = account.value.base!;
  const now = Date.now() / 1000;
  const rooms = [...b.rooms].sort((x, y) => ROOM_ORDER.indexOf(x.room) - ROOM_ORDER.indexOf(y.room) || x.slot.localeCompare(y.slot));
  const d = b.drones;
  const dronesFull = d ? dronesFullAt(d) / 1000 : 0;
  return (
    <>
      <div class="row" style={{ justifyContent: "space-between" }}>
        <p class="muted" style={{ margin: 0 }}>As of your last sync, {relative(b.at)}. Morale is as the game counted it then.</p>
        {d && <p style={{ margin: 0 }}>Drones <strong>{d.value}</strong> / {d.max}{dronesFull > now ? <span class="muted"> · full in about {duration((dronesFull - now) * 1000)}</span> : d.value >= d.max ? <span class="warn-text"> · full: use them</span> : null}</p>}
      </div>
      {data.layout ? <BaseMap data={data} map={data.layout} ops={ops} plan={plan} layout={layout} skills={skills} dorms={dorms} />
        : <div class="rooms">{rooms.map((r) => <RoomCard key={r.slot} r={r} data={data} ops={ops} now={now} />)}</div>}
    </>
  );
}

function RoomCard({ r, data, ops, now }: { r: BaseRoom; data: BaseFile; ops: Map<string, OpIndex>; now: number }) {
  const product = r.room === "MANUFACTURE" && r.formula ? data.formulas?.[r.formula] : undefined;
  const left = until(r.done, now);
  return (
    <section class="room card">
      <div class="room-head"><strong>{ROOM_NAME[r.room] || r.room}</strong><span class="muted">Level {r.level}</span></div>
      {product && (
        <p class="room-line"><ItemIcon id={product} bare /> {itemName(product)}<span class="muted"> · {r.made ?? 0}{r.capacity ? ` / ${r.capacity}` : ""} made</span>
          {left && <span class={left === "done" ? "warn-text" : "muted"}> · {left === "done" ? "stopped: collect and restart" : `keeps running ${left.replace("in ", "for ")}`}</span>}</p>
      )}
      {r.room === "TRADING" && (
        <p class="room-line">{STRATEGY[r.strategy || ""] || "Orders"}<span class="muted"> · {r.orders ?? 0}{r.limit ? ` / ${r.limit}` : ""} ready{left && left !== "done" ? ` · next ${left}` : ""}</span>
          {r.limit && (r.orders ?? 0) >= r.limit ? <span class="warn-text"> · full</span> : null}</p>
      )}
      {r.room === "DORMITORY" && r.comfort !== undefined && <p class="room-line muted">Ambience {fmt(r.comfort)}</p>}
      {r.team.length ? (
        <ul class="room-team">
          {r.team.map((t) => {
            const op = ops.get(t.charId);
            return (
              <li key={t.charId} title={`${op?.name || t.charId}: morale ${t.morale.toFixed(1)} of 24`}>
                {op ? <Avatar op={op} size="sm" /> : null}
                <span class="morale"><i style={{ width: `${Math.min(100, (t.morale / 24) * 100)}%` }} class={t.morale < 6 ? "low" : ""} /></span>
              </li>
            );
          })}
        </ul>
      ) : <p class="muted" style={{ margin: 0 }}>Nobody assigned.</p>}
    </section>
  );
}

/** The base drawn to the game's own slot grid (after ako's base map): each room where the game puts it, top floor
 *  first, with its team and their morale. "Now" is the base at the sync; a shift lays that shift's planned teams onto
 *  your rooms (each kind's rooms in the game's order take the plan's rooms of that kind in order), rings whoever
 *  would move in from elsewhere and puts the dorm plan's resters in the dorms. */
function BaseMap({ data, map, ops, plan, layout, skills, dorms }: {
  data: BaseFile; map: BaseLayout; ops: Map<string, OpIndex>; plan: [Room, Team][][]; layout: string; skills: Map<string, Set<string>>; dorms: DormSettings;
}) {
  const b = account.value.base!;
  const now = Date.now() / 1000;
  const [show, setShow] = useState(-1); // -1: now; otherwise the shift shown
  const rooms = useMemo(() => gameOrder(b.rooms, map), [b, map]);
  const count = (k: string) => rooms.filter((r) => r.room === k).length;
  const mine = `${count("TRADING")}${count("MANUFACTURE")}${count("POWER")}`;
  const fits = mine === layout; // the plan's rooms only map onto a base with the same ones
  const k = fits && show < plan.length ? show : -1;
  const planned = useMemo(() => (k >= 0 ? shiftBySlot(plan[k], rooms) : new Map<string, [Room, Team]>()), [k, plan, rooms]);
  const dormRooms = rooms.filter((r) => r.room === "DORMITORY");
  const rest = useMemo(() => (k >= 0 && plan.length > 1
    ? dormPlan(data, skills, plan, k, Object.keys(account.value.ops), { ...dorms, dorms: dormRooms.length || dorms.dorms }) : null), [k, plan, dorms, rooms]);
  const resting = new Map<string, string[]>(); // dorm slot -> its helpers and resters
  rest?.dorms.forEach((dm, i) => { if (dormRooms[i]) resting.set(dormRooms[i].slot, [...dm.helpers.map((h) => h.id), ...dm.resting.map((x) => x.id)]); });
  const moraleNow = new Map(b.rooms.flatMap((r) => r.team.map((t) => [t.charId, t.morale] as const)));
  const moves = k >= 0 ? movesFrom(planned, rooms) : 0;
  const placed = rooms.filter((r) => map.slots[r.slot]);
  const unplaced = rooms.filter((r) => !map.slots[r.slot]);
  const annex = placed.some((r) => map.annex.includes(r.slot));
  const cols = Math.max(1, ...placed.map((r) => map.slots[r.slot][1] + map.slots[r.slot][3]));
  const at = (row: number, col: number, h: number, w: number) => ({ gridColumn: `${col + 1} / span ${w}`, gridRow: `${row + 1} / span ${h}` });
  const dash = (s: string) => s.split("").join("-");
  return (
    <>
      <div class="row bm-bar">
        <div class="seg" role="group" aria-label="Show the base">
          <button aria-pressed={k < 0} onClick={() => setShow(-1)}>Now</button>
          {fits && plan.map((_, i) => <button key={i} aria-pressed={k === i} onClick={() => setShow(i)}>Shift {"ABC"[i]}</button>)}
        </div>
        {k >= 0 && <span class="muted">{moves ? `${moves} move${moves === 1 ? "" : "s"} from now` : "Nobody moves from now"}</span>}
        {!fits && <span class="muted">The plan is for {dash(layout)} and your base is {dash(mine)}{LAYOUTS[mine] ? `: choose ${dash(mine)} as the layout above to see its shifts here.` : ", so its shifts can't be drawn here."}</span>}
      </div>
      <div class="bmap-wrap">
        <div class="bmap" style={{ "--cols": cols, "--rows": map.rows }}>
          {map.passages.filter(([, c, , w, extra]) => c + w <= cols && (!extra || annex)).map(([row, col, h, w], i) => <div key={`p${i}`} class="bm-pass" style={at(row, col, h, w)} />)}
          {placed.map((r) => {
            const [row, col, h, w, floor] = map.slots[r.slot];
            const here = new Set(r.team.map((t) => t.charId));
            const entry = planned.get(r.slot);
            const dorm = r.room === "DORMITORY";
            const left = until(r.done, now);
            const item = r.room === "MANUFACTURE" && r.formula ? data.formulas?.[r.formula] : undefined;
            let ids = r.team.map((t) => t.charId);
            let faded = false;
            let line: ComponentChildren = null;
            let status = "";
            if (k < 0) {
              if (item) {
                status = left === "done" ? "stopped: collect and restart" : left ? `keeps running ${left.replace("in ", "for ")}` : "";
                line = <><ItemIcon id={item} bare /><span class={left === "done" ? "warn-text" : ""}>{r.made ?? 0}{r.capacity ? `/${r.capacity}` : ""}</span><span class="bm-name">{itemName(item)}</span></>;
              } else if (r.room === "TRADING") {
                const full = !!r.limit && (r.orders ?? 0) >= r.limit;
                status = `${STRATEGY[r.strategy || ""] || "Orders"}${full ? ", full" : left && left !== "done" ? `, next ${left}` : ""}`;
                line = <span class={full ? "warn-text" : ""}>{r.orders ?? 0}{r.limit ? ` / ${r.limit}` : ""} ready{r.strategy === "O_DIAMOND" ? " · Orundum" : ""}</span>;
              } else if (dorm && r.comfort !== undefined) line = <>Ambience {fmt(r.comfort)}</>;
            } else if (entry) {
              ids = entry[1].members;
              line = <>{entry[1].efficiency ? <b class="bm-eff">+{fmt(entry[1].efficiency)}%</b> : null}{PRODUCT_LABEL[entry[0].product] || entry[0].product}</>;
            } else if (dorm && rest) {
              ids = resting.get(r.slot) || [];
              line = ids.length ? "Resting" : "Free";
            } else {
              faded = true;
              line = dorm ? "Nobody rests with one shift" : "Not in the plan";
            }
            const cap = Math.max(data.layout?.capacity[r.room]?.[r.level - 1] ?? 0, r.team.length, ids.length);
            return (
              <section key={r.slot} class={`bm-room bm-${r.room.toLowerCase()}${faded ? " faded" : ""}`} style={at(row, col, h, w)}
                aria-label={ROOM_NAME[r.room] || r.room} title={`${ROOM_NAME[r.room] || r.room} · ${floor || "1F"} · level ${r.level}${status ? ` · ${status}` : ""}`}>
                <div class="bm-head"><span>{MAP_NAME[r.room] || r.room}</span><span>Lv {r.level}</span></div>
                {line && <div class="bm-line">{line}</div>}
                <div class="bm-ops">
                  {ids.map((id) => {
                    const op = ops.get(id);
                    const morale = k < 0 ? r.team.find((t) => t.charId === id)?.morale : k === 0 ? moraleNow.get(id) : undefined; // shift A starts now
                    const ring = k >= 0 && !!entry && !here.has(id);
                    const name = op?.name || id;
                    return (
                      <a key={id} class={`bm-op${ring ? " moving" : ""}`} href={href(`/operator/${id}`)} data-panel={id}
                        title={`${name}${morale !== undefined ? ` · morale ${morale.toFixed(1)} of 24` : ""}${ring ? " · moves in" : ""}`}>
                        {op ? <Avatar op={op} size="sm" /> : <span class="avatar sm">{name.slice(0, 2)}</span>}
                        {morale !== undefined && <i class={`bm-morale ${moraleClass(morale)}`}><i style={{ width: `${Math.max(0, Math.min(100, (morale / 24) * 100))}%` }} /></i>}
                      </a>
                    );
                  })}
                  {Array.from({ length: Math.max(0, cap - ids.length) }, (_, i) => <span key={`e${i}`} class="bm-empty" aria-hidden="true" />)}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {unplaced.length > 0 && <div class="rooms">{unplaced.map((r) => <RoomCard key={r.slot} r={r} data={data} ops={ops} now={now} />)}</div>}
      <Explain>Your rooms where the game puts them, top floor first. The bar under each operator is their morale at the sync (of 24): green from 12, amber from 6, red below. {fits
        ? "In a shift, each kind of room takes the plan's rooms of that kind in the game's order (top floor first, then left to right); a gold ring marks an operator who'd move in from elsewhere, and the dorms hold who should rest while that shift works (going to rest isn't counted as a move)."
        : "Choose the layout your base has to see the plan's shifts on the map."}</Explain>
    </>
  );
}
