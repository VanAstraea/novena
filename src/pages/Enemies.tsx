// The enemy database: every enemy in the game's handbook, searchable, filterable and sortable by its stats. Filters
// live in the URL.
import { useMemo, useState } from "preact/hooks";
import { EnemyIcon, ImmunityBadges } from "../components/EnemyParts";
import { Await, Explain, SortTh, useAsync } from "../components/ui";
import { enemies as loadEnemies } from "../lib/data";
import { ATTACK_NAMES, damageText, DAMAGE_NAMES, filterEnemies, IMMUNITIES, immunities, LEVEL_NAMES, MOTION_NAMES, readFilters, statText } from "../lib/enemies";
import type { SortKey } from "../lib/enemies";
import { href, route, setQuery } from "../lib/router";
import { server } from "../state";
import type { EnemiesFile } from "../types";

export default function Enemies() {
  const s = server.value;
  const st = useAsync(() => loadEnemies(s), [s]);
  return (
    <div class="stack fade-in">
      <h1>Enemy database</h1>
      <Await state={st} what="enemies">
        {(data) => <List data={data} />}
      </Await>
    </div>
  );
}

const SORT_NAMES: [SortKey, string][] = [["hp", "HP"], ["atk", "ATK"], ["def", "DEF"], ["res", "RES"], ["wt", "Weight"]];

function Filters() {
  const q = route.value.query;
  const f = readFilters(q);
  const sel = (key: string, label: string, opts: [string, string][]) => (
    <label class="field">
      <span>{label}</span>
      <select value={q.get(key) || ""} onChange={(e) => setQuery({ [key]: (e.target as HTMLSelectElement).value })}>
        <option value="">Any</option>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  return (
    <div class="card">
      <div class="row" style={{ alignItems: "flex-end" }}>
        <label class="field grow" style={{ minWidth: "min(100%, 200px)" }}>
          <span>Name</span>
          <input type="search" value={f.q} placeholder="Search enemies" onInput={(e) => setQuery({ q: (e.target as HTMLInputElement).value })} />
        </label>
        {sel("level", "Level", Object.entries(LEVEL_NAMES))}
        {sel("dmg", "Damage", [...Object.entries(DAMAGE_NAMES), ["none", "None"]])}
        {sel("atk", "Attack", Object.entries(ATTACK_NAMES).filter(([k]) => k !== "both"))}
        {sel("motion", "Movement", Object.entries(MOTION_NAMES))}
        <label class="field">
          <span>Sort</span>
          <select value={f.sort ? `${f.sort}:${f.dir}` : ""} onChange={(e) => {
            const [sort, dir] = (e.target as HTMLSelectElement).value.split(":");
            setQuery({ sort, dir: dir === "1" ? "asc" : "" });
          }}>
            <option value="">Handbook order</option>
            {SORT_NAMES.flatMap(([k, l]) => [<option key={k} value={`${k}:-1`}>{l}, highest first</option>, <option key={`${k}a`} value={`${k}:1`}>{l}, lowest first</option>])}
          </select>
        </label>
      </div>
      <div class="row" style={{ marginTop: "10px" }} role="group" aria-label="Immune to">
        <span class="muted">Immune to</span>
        {IMMUNITIES.map((i) => {
          const on = f.imm.includes(i.id);
          return (
            <button key={i.id} class="chip" aria-pressed={on}
              onClick={() => setQuery({ imm: (on ? f.imm.filter((x) => x !== i.id) : [...f.imm, i.id]).join(",") })}>
              {i.name}
            </button>
          );
        })}
        {[...q.keys()].length > 0 && <button class="small ghost" onClick={() => setQuery(Object.fromEntries([...q.keys()].map((k) => [k, ""])))}>Clear filters</button>}
      </div>
    </div>
  );
}

function List({ data }: { data: EnemiesFile }) {
  const q = route.value.query;
  const f = readFilters(q);
  const list = useMemo(() => filterEnemies(data.enemies, f), [data, q.toString()]);
  const [limit, setLimit] = useState(60);
  const sort = { key: f.sort || "", dir: f.dir };
  const setSort = (s: { key: string; dir: 1 | -1 }) => setQuery({ sort: s.key, dir: s.dir === 1 ? "asc" : "" });
  const th = (k: SortKey, label: string, title?: string) => <SortTh label={label} k={k} sort={sort} setSort={setSort} num title={title} />;
  return (
    <>
      <Filters />
      <p class="muted" role="status">{list.length} of {data.enemies.length} enemies{f.sort ? " · stats at each enemy's first level" : ""}</p>
      <div class="table-wrap">
        <table class="cards enemy-table">
          <thead><tr>
            <th scope="col">Enemy</th>
            <th scope="col">Damage</th>
            <th scope="col">Attack</th>
            {th("hp", "HP")}{th("atk", "ATK")}{th("def", "DEF")}{th("res", "RES")}{th("wt", "Weight", "Heavier enemies are harder to push, pull and lift")}
            <th scope="col">Immune to</th>
          </tr></thead>
          <tbody>
            {list.slice(0, limit).map((e) => {
              const l = e.lv[0];
              return (
                <tr key={e.id}>
                  <td data-label="">
                    <a class="op-cell" href={href(`/enemy/${e.id}`)}>
                      <EnemyIcon e={e} size="sm" />
                      <span><span class="op-name">{e.name}</span><br /><small class="muted">{e.code} · {LEVEL_NAMES[e.level]}{e.motion === "fly" ? " · Flying" : ""}</small></span>
                    </a>
                  </td>
                  <td data-label="Damage">{damageText(e.dmg)}</td>
                  <td data-label="Attack">{ATTACK_NAMES[e.atk]}</td>
                  <td data-label="HP" class="num">{statText("hp", l.hp)}</td>
                  <td data-label="ATK" class="num">{statText("atk", l.atk)}</td>
                  <td data-label="DEF" class="num">{statText("def", l.def)}</td>
                  <td data-label="RES" class="num">{statText("res", l.res)}</td>
                  <td data-label="Weight" class="num">{statText("wt", l.wt)}</td>
                  <td data-label="Immune to"><ImmunityBadges imm={immunities(e)} empty="–" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length > limit && <button onClick={() => setLimit(limit + 100)}>Show more ({list.length - limit} left)</button>}
      <Explain>Every enemy in the game's handbook on this server, from the game's own data. Many enemies have more than one level (stages pick one, and harder stages usually pick a higher one): the list shows each enemy's first, and the enemy's page shows them all side by side.</Explain>
    </>
  );
}
