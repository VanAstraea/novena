// One enemy: what it does, its abilities, its immunities and its stats at every level side by side.
import { Fragment } from "preact";
import { useState } from "preact/hooks";
import { EnemyIcon, ImmunityBadges } from "../components/EnemyParts";
import { Await, Explain, Rich, useAsync } from "../components/ui";
import { enemies as loadEnemies, enemyAbilities, enemyStages } from "../lib/data";
import { ATTACK_NAMES, damageText, LEVEL_NAMES, MOTION_NAMES, statText, STATS, varies, whereItAppears } from "../lib/enemies";
import { href } from "../lib/router";
import { server } from "../state";
import type { EnemiesFile, EnemyAbilities, EnemyRow } from "../types";

export default function Enemy({ params }: { params: Record<string, string> }) {
  const s = server.value;
  const id = params.id;
  const st = useAsync(() => Promise.all([loadEnemies(s), enemyAbilities(s)]), [s]);
  return (
    <Await state={st} what="enemy">
      {([data, abilities]) => {
        const e = data.enemies.find((x) => x.id === id);
        if (!e) return <div class="card"><h1>Unknown enemy</h1><p>This server's handbook doesn't list it. <a href={href("/enemies")}>Back to enemies</a></p></div>;
        return <View e={e} data={data} abilities={abilities[id] || []} />;
      }}
    </Await>
  );
}

function View({ e, data, abilities }: { e: EnemyRow; data: EnemiesFile; abilities: EnemyAbilities[string] }) {
  const linked = (e.link || []).map((id) => data.enemies.find((x) => x.id === id)).filter((x): x is EnemyRow => !!x);
  const stats = STATS.filter((s) => !s.optional || e.lv.some((l) => l[s.key] !== undefined));
  const sameImm = !varies(e, "imm");
  const many = e.lv.length > 1;
  return (
    <div class="stack fade-in">
      <p><a href={href("/enemies")}>← Enemies</a></p>
      <div class="enemy-head">
        <EnemyIcon e={e} size="lg" />
        <div>
          <h1>{e.name}</h1>
          <p class="chips">
            <span class={`badge level-${e.level.toLowerCase()}`}>{LEVEL_NAMES[e.level]}</span>
            <span class="badge">{e.code}</span>
            {(e.tags || []).map((t) => <span key={t} class="badge">{data.races[t] || t}</span>)}
          </p>
        </div>
      </div>

      <div class="grid two">
        <section class="card">
          <h2>At a glance</h2>
          <dl class="kv">
            <dt>Damage</dt><dd>{damageText(e.dmg)}</dd>
            <dt>Attack</dt><dd>{ATTACK_NAMES[e.atk]}</dd>
            <dt>Movement</dt><dd>{MOTION_NAMES[e.motion]}</dd>
            <dt>Immune to</dt><dd>{sameImm ? <ImmunityBadges imm={e.lv[0].imm} /> : <>Depends on the level (see the stats)</>}</dd>
            {linked.length > 0 && <><dt>Comes with</dt><dd>{linked.map((l, i) => <Fragment key={l.id}>{i > 0 && ", "}<a href={href(`/enemy/${l.id}`)}>{l.name}</a></Fragment>)}</dd></>}
          </dl>
        </section>
        <section class="card">
          <h2>Abilities</h2>
          {abilities.length ? (
            <ul class="enemy-abilities">
              {abilities.map(([text, kind], i) => kind === "title"
                ? <li key={i} class="ab-title"><Rich html={text} /></li>
                : <li key={i}><Rich html={text} />{kind === "silence" && <> <span class="badge" title="Silencing this enemy stops this ability">Silence stops this</span></>}</li>)}
            </ul>
          ) : <p class="muted">No special abilities.</p>}
        </section>
      </div>

      <section class="card">
        <h2>Stats{many ? ` at each level (${e.lv.length})` : ""}</h2>
        <div class="table-wrap">
          <table class="enemy-stats">
            <thead><tr><th scope="col">Stat</th>{e.lv.map((_, i) => <th key={i} scope="col" class="num">{many ? `Level ${i}` : "Value"}</th>)}</tr></thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.key} class={many && varies(e, s.key) ? "varies" : ""}>
                  <th scope="row" title={s.title}>{s.label}</th>
                  {e.lv.map((l, i) => <td key={i} class="num">{statText(s.key, l[s.key])}</td>)}
                </tr>
              ))}
              {!sameImm && (
                <tr class="varies">
                  <th scope="row">Immune to</th>
                  {e.lv.map((l, i) => <td key={i}><ImmunityBadges imm={l.imm} /></td>)}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {many && <Explain>Stages pick one of an enemy's levels; harder stages usually pick a higher one. Highlighted rows change between levels.</Explain>}
      </section>

      <WhereItAppears e={e} />
    </div>
  );
}

/** The stages it's in, by chapter or event; loaded on its own, so the rest of the page doesn't wait for it. */
function WhereItAppears({ e }: { e: EnemyRow }) {
  const s = server.value;
  const st = useAsync(() => enemyStages(s), [s]);
  const [all, setAll] = useState(false);
  const many = e.lv.length > 1;
  return (
    <section class="card">
      <h2>Where it appears</h2>
      <Await state={st} what="stages">
        {(file) => {
          const groups = whereItAppears(file, e.id);
          if (!groups.length) return <p class="muted">Not in any story, event, supply or Annihilation stage. It may appear in Integrated Strategies, Reclamation Algorithm, Stationary Security Service or another mode.</p>;
          const count = groups.reduce((n, g) => n + g.stages.length, 0);
          const shown = all ? groups : groups.slice(0, 6);
          return (
            <>
              <p class="muted">{count === 1 ? "1 stage" : `${count} stages`} in {groups.length === 1 ? "1 chapter or event" : `${groups.length} chapters and events`}.</p>
              <dl class="enemy-where">
                {shown.map((g) => (
                  <Fragment key={g.name}>
                    <dt>{g.name}</dt>
                    <dd class="chips">{g.stages.map((x) => (
                      <span key={`${x.code}|${x.lv}`} class="chip" title={x.name ? `${x.code} ${x.name}${many ? ` · level ${x.lv}` : ""}` : undefined}>
                        {x.code}{many && x.lv > 0 && <small> · Lv {x.lv}</small>}
                      </span>
                    ))}</dd>
                  </Fragment>
                ))}
              </dl>
              {groups.length > shown.length && <button class="ghost" onClick={() => setAll(true)}>Show all {groups.length} chapters and events</button>}
              <Explain>From each stage's level data: every enemy a stage can field, including ones other enemies summon.{many ? " Lv is the level the stage uses (see the stats above); none means level 0." : ""} Challenge Mode uses the same enemies as the normal stage.</Explain>
            </>
          );
        }}
      </Await>
    </section>
  );
}
