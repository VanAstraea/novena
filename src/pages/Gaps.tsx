// Gaps: archetypes community clears lean on that the roster covers poorly, what you have in each, and the quickest
// ways to fill it (raise one you own to its community build, or get one).
import { useMemo, useState } from "preact/hooks";
import { CommunityMarks } from "../components/Marks";
import { toast } from "../components/Toast";
import { WeightsChip } from "../components/Weights";
import { Avatar, Await, Explain, GIcon, metaSig, SortTh, useAsync } from "../components/ui";
import { loadSample } from "../lib/accountImport";
import { parse } from "../lib/build";
import { art, operators, usage as loadUsage } from "../lib/data";
import { CLASS_NAMES, pct } from "../lib/format";
import { analyse, todoText, type Gap, type GapOption } from "../lib/gaps";
import { href, route, setQuery } from "../lib/router";
import { contentLevels, customised, weightedScore } from "../lib/weights";
import { account, hasRoster, saveTargets, server, targets } from "../state";
import type { OpIndex, UsageFile } from "../types";

export default function Gaps() {
  const s = server.value;
  const st = useAsync(() => Promise.all([operators(s), loadUsage()]), [s]);
  return (
    <div class="stack fade-in">
      <h1>Roster gaps</h1>
      <p class="muted" style={{ marginTop: "-6px" }}>Archetypes community clears lean on that your roster covers poorly, and the quickest ways to fill each one.</p>
      <Await state={st} what="usage data">
        {([ops, usage]) => hasRoster.value ? <Table ops={ops} usage={usage} /> : (
          <div class="card"><p>Import your roster under <a href={href("/roster")}>My roster</a> to see which archetypes your clears would struggle with.
            Just looking? <button class="linkish" onClick={() => void loadSample(ops)}>Try it with a sample roster</button> <span class="muted">(made up; clear it any time)</span></p></div>
        )}
      </Await>
    </div>
  );
}

type Key = "gap" | "demand" | "coverage" | "name";

function Table({ ops, usage }: { ops: OpIndex[]; usage: UsageFile }) {
  const meta = metaSig.value;
  const s = server.value;
  const here = route.value.query.get("here") === "1";
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "gap", dir: -1 });
  const [all, setAll] = useState(false);
  const demandOf = (b: string) => (customised() ? weightedScore(usage.archetypes[b]?.u) : usage.archetypes[b]?.score) || 0;
  const name = (g: Gap) => meta?.branches[g.branch] || g.branch;
  const gaps = useMemo(() => analyse(ops, usage, account.value.ops, s, demandOf), [ops, usage, account.value.ops, s, contentLevels.value]);
  const rows = useMemo(() => [...gaps].sort((a, b) => sort.key === "name" ? name(a).localeCompare(name(b)) * sort.dir
    : (a[sort.key as Exclude<Key, "name">] - b[sort.key as Exclude<Key, "name">]) * sort.dir), [gaps, sort, meta]);
  const shown = all ? rows : rows.slice(0, 20);
  return (
    <>
      <div class="card">
        <WeightsChip />
        <label class="row tight" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={here} onChange={(e) => setQuery({ here: (e.target as HTMLInputElement).checked ? "1" : "" })} /> Only suggest operators on this server
        </label>
      </div>
      <div class="table-wrap">
        <table class="cards gaps">
          <thead><tr>
            <SortTh label="Archetype" k="name" sort={sort} setSort={setSort} />
            <SortTh label="Gap" k="gap" sort={sort} setSort={setSort} num title="Demand × the share you don't cover" />
            <SortTh label="Demand" k="demand" sort={sort} setSort={setSort} num title="Share of community clears using the archetype" />
            <SortTh label="Covered" k="coverage" sort={sort} setSort={setSort} num title="Share of the archetype's usage from operators you own" />
            <th scope="col">Yours</th>
            <th scope="col">To fill it</th>
          </tr></thead>
          <tbody>
            {shown.map((g) => {
              const yours = g.options.filter((o) => o.owned);
              const raise = yours.filter((o) => o.todo).slice(0, 3);
              const get = g.options.filter((o) => !o.owned && o.share >= 0.01 && (!here || o.here)).slice(0, raise.length >= 2 ? 1 : 3 - raise.length);
              return (
                <tr key={g.branch}>
                  <td data-label="Archetype">
                    <a class="gap-name" href={href("/rankings", { branch: g.branch })}>{name(g)}</a>
                    <small class="gap-cls"><GIcon src={art.classIcon(g.cls)} alt="" size={14} />{CLASS_NAMES[g.cls] || g.cls}</small>
                  </td>
                  <td data-label="Gap" class="num"><strong>{pct(g.gap)}</strong></td>
                  <td data-label="Demand" class="num">{pct(g.demand)}</td>
                  <td data-label="Covered" class="num">
                    <span class="gap-cov">{pct(g.coverage, 0)}<span class="bar" aria-hidden="true"><i style={{ width: `${g.coverage * 100}%` }} /></span></span>
                  </td>
                  <td data-label="Yours">
                    <div class="gap-ops">{yours.length ? yours.map((o) => <Chip key={o.op.id} o={o} />) : <span class="muted">None</span>}</div>
                  </td>
                  <td data-label="To fill it">
                    <div class="gap-ops col">
                      {raise.map((o) => <Chip key={o.op.id} o={o} fill />)}
                      {get.map((o) => <Chip key={o.op.id} o={o} fill />)}
                      {!raise.length && !get.length && <span class="muted">–</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && <button onClick={() => setAll(true)}>Show all {rows.length} archetypes</button>}
      <Explain>Demand: share of community clears (MAA Copilot, CN) using at least one operator of the archetype{customised() ? ", weighted to the content you play" : ""}. Covered: share of the archetype's usage from operators you own; one below the promotion its community build needs counts 30%. Gap = demand × the share you don't cover. To fill it: raise one you own to its community build (promotion, the usual skill's mastery, the usual module), or get one; the percentage is its share of the archetype's usage.</Explain>
    </>
  );
}

/** An operator as a chip: "unbuilt" when owned below its community promotion. In "to fill it", what it lacks of its
 *  community build with a button to make that a Planner goal, or "get" with its share for one you don't own. */
function Chip({ o, fill = false }: { o: GapOption; fill?: boolean }) {
  const goal = targets.value.find((t) => t.id === o.op.id);
  return (
    <span class={`gap-op${o.owned && (fill ? o.todo : !o.built) ? " todo" : ""}`}>
      <a class="gap-op-link" href={href(`/operator/${o.op.id}`)} data-panel={o.op.id}>
        <Avatar op={o.op} size="sm" /><span class="op-name">{o.op.name}</span>
      </a>
      {!fill && o.owned && !o.built && <small>unbuilt</small>}
      {fill && o.owned && o.todo && <CommunityMarks b={{ ...o.todo, moduleStage: 1 }} op={o.op} />}
      {fill && !o.owned && <small>get · {pct(o.share, 0)}{o.here ? "" : " · CN only"}</small>}
      {fill && o.owned && o.todo && !goal && <button class="small ghost gap-goal" title="Make it a goal in the Materials planner" aria-label={`Make ${o.op.name}'s community build a goal`} onClick={() => makeGoal(o)}>+ goal</button>}
      {fill && goal && <small class="good-text" title={goal.text}>goal</small>}
    </span>
  );
}

function makeGoal(o: GapOption) {
  const step = todoText(o.todo!);
  const had = targets.value.find((t) => t.id === o.op.id);
  const text = had ? `${had.text}, ${step}` : step;
  try { parse(`${o.op.name} ${text}`); } catch (e) { toast((e as Error).message, { kind: "bad" }); return; }
  saveTargets([...targets.value.filter((t) => t.id !== o.op.id), { id: o.op.id, text }]);
  toast(`${o.op.name}: ${step} is a goal now.`, { link: { href: href("/planner"), label: "Open Materials" } });
}
