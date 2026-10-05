// Recruitment calculator: pick the five tags, see every combination and what it guarantees.
import { useMemo, useState } from "preact/hooks";
import { Avatar, Await, Explain, Stars, useAsync } from "../components/ui";
import { duration } from "../lib/format";
import { opMap, recruit as loadRecruit } from "../lib/data";
import { href, route, setQuery } from "../lib/router";
import { combos, TAG, worthPicking, type Combo } from "../lib/recruit";
import { account, server } from "../state";
import type { OpIndex, RecruitFile } from "../types";

const GROUPS: { label: string; ids: number[] }[] = [
  { label: "Qualification", ids: [17, 14, 11] },
  { label: "Position", ids: [9, 10] },
  { label: "Class", ids: [8, 1, 3, 2, 6, 4, 5, 7] },
];

export default function Recruit() {
  const s = server.value;
  const st = useAsync(() => Promise.all([loadRecruit(s), opMap(s)]), [s]);
  return (
    <div class="stack fade-in">
      <h1>Recruitment calculator</h1>
      <Await state={st} what="recruitment data">{([rec, ops]) => <View rec={rec} ops={ops} />}</Await>
    </div>
  );
}

function View({ rec, ops }: { rec: RecruitFile; ops: Map<string, OpIndex> }) {
  const q = route.value.query;
  const picked = (q.get("tags") || "").split(",").filter(Boolean).map(Number).filter((t) => rec.tags.some((x) => x.id === t)).slice(0, 5);
  const [all, setAll] = useState(false);
  const name = (id: number) => rec.tags.find((t) => t.id === id)?.name || String(id);
  const grouped = new Set(GROUPS.flatMap((g) => g.ids));
  const groups = [...GROUPS, { label: "Specialization", ids: rec.tags.filter((t) => !grouped.has(t.id)).map((t) => t.id) }];
  const toggle = (id: number) => {
    const next = picked.includes(id) ? picked.filter((t) => t !== id) : picked.length < 5 ? [...picked, id] : picked;
    setQuery({ tags: next.join(",") });
  };
  const found = useMemo(() => (picked.length ? combos(picked, rec) : []), [picked.join(), rec]);
  const worth = useMemo(() => worthPicking(found), [found]);
  const shown = all ? found : worth;
  return (
    <>
      {account.value.recruit?.length ? <Slots rec={rec} name={name} /> : null}
      <section class="card">
        <div class="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Your tags <span class="muted">({picked.length} of 5)</span></h2>
          {picked.length > 0 && <button class="small ghost" onClick={() => setQuery({ tags: "" })}>Clear</button>}
        </div>
        {groups.map((g) => (
          <div key={g.label} style={{ marginTop: "10px" }}>
            <h3 style={{ fontSize: "0.9rem", color: "var(--muted)" }}>{g.label}</h3>
            <div class="chips" role="group" aria-label={g.label}>
              {g.ids.map((id) => (
                <button key={id} class="chip" aria-pressed={picked.includes(id)} onClick={() => toggle(id)}
                  disabled={!picked.includes(id) && picked.length >= 5}>{name(id)}</button>
              ))}
            </div>
          </div>
        ))}
        <Explain>The game's own rules: you get an operator with every tag you pick; a 6★ needs Top Operator; at 9:00 the 1★ and 2★ are left out (set 3:50 or less for a Robot).</Explain>
      </section>
      {picked.length > 0 && (
        <section class="card">
          <div class="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>{all ? `Every combination (${found.length})` : worth.length ? "Worth picking" : "Nothing above 3★"}</h2>
            <label class="row tight"><input type="checkbox" checked={all} onChange={(e) => setAll((e.target as HTMLInputElement).checked)} /> Show every combination</label>
          </div>
          {!all && !worth.length && <p class="muted" style={{ marginTop: "8px" }}>No combination guarantees 4★ or better. Pick tags for the most common class you need, or refresh the tags.</p>}
          <div class="stack" style={{ marginTop: "10px" }}>
            {shown.map((c) => <ComboCard key={c.tags.join()} c={c} name={name} ops={ops} />)}
          </div>
          <Explain>Guaranteed rarity: the lowest rarity among the operators that have every picked tag. "Worth picking" hides combinations a smaller pick already guarantees.</Explain>
        </section>
      )}
    </>
  );
}

function ComboCard({ c, name, ops }: { c: Combo; name: (id: number) => string; ops: Map<string, OpIndex> }) {
  return (
    <div class="card" style={{ padding: "10px" }}>
      <div class="row" style={{ justifyContent: "space-between" }}>
        <div class="chips">{c.tags.map((t) => <span key={t} class="badge" style={{ fontSize: "0.85rem" }}>{name(t)}</span>)}</div>
        <span><strong class={`stars r${c.rarity}`}>{c.rarity}★ guaranteed</strong> · set {c.hours}{c.tags.includes(TAG.ROBOT) ? " or less" : ""}</span>
      </div>
      <div class="row" style={{ marginTop: "8px", gap: "6px" }}>
        {c.candidates.map((r) => {
          const op = ops.get(r.id);
          if (!op) return null;
          return (
            <a key={r.id} class="op-cell" href={href(`/operator/${r.id}`)} title={`${op.name} (${r.rarity}★)${account.value.ops[r.id] ? ", owned" : ""}`}
              style={{ padding: "2px 6px 2px 2px", border: "1px solid var(--border)", borderRadius: "8px" }}>
              <Avatar op={op} size="sm" /><span><small>{op.name}</small> <Stars n={r.rarity} /></span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

/** Your four recruitment slots as of the last Novena Sync: what each offers or is recruiting, and one click to check it. */
function Slots({ rec, name }: { rec: RecruitFile; name: (id: number) => string }) {
  const slots = account.value.recruit || [];
  const now = Date.now() / 1000;
  return (
    <section class="card">
      <h2 class="label">Your recruitment slots</h2>
      <div class="slots">
        {slots.map((sl) => {
          const locked = sl.state === 0 && !sl.tags.length;
          const running = sl.start > 0 && sl.finish > now, ready = sl.start > 0 && sl.finish > 0 && sl.finish <= now;
          const best = sl.tags.length ? Math.max(0, ...worthPicking(combos(sl.tags, rec)).map((c) => c.rarity)) : 0;
          return (
            <div key={sl.slot} class={`slot${running ? " running" : ready ? " ready" : ""}`}>
              <div class="slot-head"><strong>Slot {sl.slot + 1}</strong>
                <span class={ready ? "good-text" : "muted"}>{locked ? "Locked" : running ? `Done in ${duration((sl.finish - now) * 1000)}` : ready ? "Ready to collect" : "Tags waiting"}</span>
              </div>
              {!locked && (
                <>
                  <div class="chips">{sl.tags.map((t) => <span key={t} class={`chip${sl.picked.includes(t) ? " picked" : ""}`}>{name(t)}</span>)}</div>
                  {!running && !ready && sl.tags.length > 0 && (
                    <div class="row" style={{ marginTop: "8px", justifyContent: "space-between" }}>
                      <span class="muted">{best >= 4 ? <strong class="good-text">{best}★ guaranteed</strong> : best ? `Best: ${best}★` : "Nothing guaranteed"}</span>
                      <button class="small" onClick={() => setQuery({ tags: sl.tags.join(",") })}>Check these tags</button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <Explain>As of your last Novena Sync. Picked tags are outlined. Times count down from the sync, so they stay right until you change something in the game.</Explain>
    </section>
  );
}
