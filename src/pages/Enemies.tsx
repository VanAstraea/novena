// The enemy database: every enemy in the game's handbook, searchable, filterable and sortable by its stats, or the
// enemies of one stage ("1-7"). Filters live in the URL.
import { Fragment } from "preact";
import { useMemo, useState } from "preact/hooks";
import { EnemyIcon, ImmunityBadges } from "../components/EnemyParts";
import { Await, Explain, SortTh, useAsync } from "../components/ui";
import { enemies as loadEnemies, enemyStages, stageMaps } from "../lib/data";
import { ATTACK_NAMES, damageText, DAMAGE_NAMES, filterEnemies, IMMUNITIES, immunities, LEVEL_NAMES, MOTION_NAMES, readFilters, stageHits, stageSuggestions, statText } from "../lib/enemies";
import type { SortKey, StageHit } from "../lib/enemies";
import { href, route, setQuery } from "../lib/router";
import { server } from "../state";
import type { EnemiesFile, EnemyStagesFile } from "../types";

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
        <label class="field" style={{ width: "min(100%, 130px)" }}>
          <span>Stage</span>
          <input type="search" value={f.stage} placeholder="e.g. 1-7" autocapitalize="characters" spellcheck={false} style={{ width: "100%", minWidth: 0 }}
            onInput={(e) => setQuery({ stage: (e.target as HTMLInputElement).value })} />
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

const TILE: Record<string, [string, string]> = {
  g: ["ground", "Ground: melee operators deploy here"], h: ["high", "High ground: ranged operators deploy here"],
  r: ["path", "Path: enemies walk it, nobody deploys"], x: ["block", "Blocked"], o: ["hole", "Hole"],
  S: ["start", "Enemy entry"], F: ["fly", "Flying enemy entry"], E: ["end", "Defence point"], "*": ["special", "A tile with an effect of its own (healing, volcano, teleporter…)"],
};

const COUNTED: Record<string, [string, string]> = { S: ["enemy entry", "enemy entries"], F: ["flying enemy entry", "flying enemy entries"], E: ["defence point", "defence points"] };

/** A stage's grid as the game lays it out, drawn from its level data (no game art): what each tile lets you do. */
export function StageMap({ map, label }: { map: string; label: string }) {
  const rows = map.split("/").filter(Boolean);
  if (!rows.length) return null;
  const cols = Math.max(...rows.map((r) => r.length));
  const used = new Set(map.replace(/\//g, ""));
  return (
    <figure class="stage-map">
      <div class="stage-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="img"
        aria-label={`Map of ${label}: ${rows.length} rows by ${cols} columns, ${[...used].filter((c) => "SFE".includes(c)).map((c) => { const n = map.split(c).length - 1; return `${n} ${COUNTED[c][n === 1 ? 0 : 1]}`; }).join(", ")}`}>
        {rows.flatMap((r, i) => [...r.padEnd(cols, "x")].map((c, j) => <span key={`${i}.${j}`} class={`tile t-${(TILE[c] || TILE.x)[0]}`} title={(TILE[c] || TILE.x)[1]} />))}
      </div>
      <figcaption class="stage-legend">
        {Object.entries(TILE).filter(([c]) => used.has(c) && c !== "x").map(([c, [cls, text]]) => <span key={c}><i class={`tile t-${cls}`} aria-hidden="true" /> {text.split(":")[0]}</span>)}
      </figcaption>
    </figure>
  );
}

/** The stage (or stages, when a code repeats) the Stage box found, or what to try when it found none. */
function StageNote({ file, code, hits }: { file: EnemyStagesFile; code: string; hits: StageHit[] }) {
  const s = server.value;
  const maps = useAsync(() => (hits.length ? stageMaps(s) : Promise.resolve(null)), [s, hits.length > 0]);
  if (!hits.length) {
    const near = stageSuggestions(file, code);
    return (
      <p class="muted" role="status">
        No story, event, supply or Annihilation stage is called “{code}” on this server.
        {near.length > 0 && <> Did you mean {near.map((c, i) => <Fragment key={c}>{i > 0 && " "}<button class="chip" onClick={() => setQuery({ stage: c })}>{c}</button></Fragment>)}</>}
      </p>
    );
  }
  return (
    <ul class="stage-hits">
      {hits.map((h, i) => (
        <li key={i}>
          <strong>{h.code}</strong>{h.name && <> {h.name}</>} <span class="muted">· {h.group} · {h.enemies.size === 1 ? "1 enemy" : `${h.enemies.size} enemies`}</span>
          {maps.data?.maps[h.index] && <StageMap map={maps.data.maps[h.index]} label={`${h.code}${h.name ? ` ${h.name}` : ""}`} />}
        </li>
      ))}
    </ul>
  );
}

function List({ data }: { data: EnemiesFile }) {
  const s = server.value;
  const q = route.value.query;
  const f = readFilters(q);
  const wantStage = !!f.stage.trim();
  const stagesSt = useAsync(() => (wantStage ? enemyStages(s) : Promise.resolve(null)), [s, wantStage]);
  const hits = useMemo(() => (wantStage && stagesSt.data ? stageHits(stagesSt.data, f.stage) : null), [stagesSt.data, f.stage, wantStage]);
  // the stage's enemies, merged when the code names several stages: id -> the levels used
  const only = useMemo(() => {
    if (!hits) return undefined;
    const m = new Map<string, number[]>();
    for (const h of hits) for (const [id, lvs] of h.enemies) m.set(id, [...new Set([...(m.get(id) || []), ...lvs])].sort((a, b) => a - b));
    return m;
  }, [hits]);
  const list = useMemo(() => (wantStage && !only ? [] : filterEnemies(data.enemies, f, only)), [data, q.toString(), only]);
  const [limit, setLimit] = useState(60);
  const sort = { key: f.sort || "", dir: f.dir };
  const setSort = (s: { key: string; dir: 1 | -1 }) => setQuery({ sort: s.key, dir: s.dir === 1 ? "asc" : "" });
  const th = (k: SortKey, label: string, title?: string) => <SortTh label={label} k={k} sort={sort} setSort={setSort} num title={title} />;
  return (
    <>
      <Filters />
      {wantStage && stagesSt.error && <p class="bad-text" role="status">Couldn't load the stage list: {stagesSt.error.message}</p>}
      {wantStage && !stagesSt.error && !stagesSt.data && <p class="muted" role="status">Loading stages…</p>}
      {wantStage && stagesSt.data && hits && <StageNote file={stagesSt.data} code={f.stage.trim()} hits={hits} />}
      {(!wantStage || (hits && hits.length > 0)) && (
        <p class="muted" role="status">{list.length} of {only ? `${only.size} enemies in ${hits!.length > 1 ? "these stages" : "this stage"}` : `${data.enemies.length} enemies`}
          {only ? " · stats at the level the stage uses" : f.sort ? " · stats at each enemy's first level" : ""}</p>
      )}
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
              const lvs = only?.get(e.id) || [];
              const l = e.lv[lvs[0] ?? 0] || e.lv[0];
              const lvText = only && e.lv.length > 1 ? ` · Lv ${lvs.join(" and ")}` : "";
              return (
                <tr key={e.id}>
                  <td data-label="">
                    <a class="op-cell" href={href(`/enemy/${e.id}`)}>
                      <EnemyIcon e={e} size="sm" />
                      <span><span class="op-name">{e.name}</span><br /><small class="muted">{e.code} · {LEVEL_NAMES[e.level]}{e.motion === "fly" ? " · Flying" : ""}{lvText}</small></span>
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
      <Explain>Every enemy in the game's handbook on this server, from the game's own data. Many enemies have more than one level (stages pick one, and harder stages usually pick a higher one): the list shows each enemy's first, and the enemy's page shows them all side by side. Type a stage code in Stage (1-7, CE-5, DM-EX-2) to see only that stage's enemies, at the levels it uses, including ones other enemies summon; story, event, supply and Annihilation stages are covered. Each stage comes with its map, drawn from the game's level data: where melee and ranged operators deploy, where enemies come in (flying ones too) and the defence point. Enemy routes and waves aren't shown.</Explain>
    </>
  );
}
