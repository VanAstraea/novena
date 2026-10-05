import { useEffect, useMemo, useState } from "preact/hooks";
import { BuildMarks } from "../components/Marks";
import { BuildControls, CommunityView, CostsView, ModulesView, RiicView, SkillView, specFromQuery, specToQuery, StatsView, TalentsView } from "../components/OpParts";
import { Art, Await, Divider, GIcon, metaSig, Rich, Stars, Tabs, useAsync } from "../components/ui";
import type { BaseFile } from "../lib/base";
import { art, integrated, load, operator, operators, recruit as loadRecruit, usage as loadUsage } from "../lib/data";
import { bestTrainers, hm } from "../lib/training";
import { CLASS_NAMES, OBTAIN_NAMES } from "../lib/format";
import { href, route, setQuery } from "../lib/router";
import { account, hasRoster, SERVERS, server } from "../state";
import type { OpDetail, OpIndex } from "../types";

type Tab = "overview" | "skills" | "talents" | "modules" | "base" | "costs" | "community";

export default function Operator({ params }: { params: Record<string, string> }) {
  const s = server.value;
  const id = params.id;
  const st = useAsync(() => Promise.all([operator(s, id), operators(s), loadUsage(), integrated(s), loadRecruit(s)]), [s, id]);
  return (
    <Await state={st} what="operator">
      {([d, ops, usage, is, rec]) => {
        const op = ops.find((o) => o.id === id);
        if (!op) return <div class="card"><h1>Unknown operator</h1><p><a href={href("/operators")}>Back to operators</a></p></div>;
        const tags = rec.pool.find((p) => p.id === id)?.tags.map((t) => rec.tags.find((x) => x.id === t)?.name).filter(Boolean) as string[] | undefined;
        return <View d={d} op={op} ops={ops} usageRow={usage.ops[id]} is={is} tags={tags} />;
      }}
    </Await>
  );
}

/** Your fastest trainer for each of this operator's masteries, with how long each would take. */
function Trainers({ d, op, ops }: { d: OpDetail; op: OpIndex; ops: OpIndex[] }) {
  const s = server.value;
  const base = useAsync(() => load<BaseFile>(`${s}/base.json`), [s]);
  const name = (id: string) => ops.find((o) => o.id === id)?.name || id;
  return (
    <section class="card" style={{ gridColumn: "1 / -1" }}>
      <h2>Training Room: your fastest trainers</h2>
      <Await state={base} what="base skills">
        {(data) => (
          <div class="table-wrap">
            <table class="cards">
              <thead><tr><th>Skill</th><th>To M1</th><th>To M2</th><th>To M3</th></tr></thead>
              <tbody>
                {d.skills.map((sk, i) => sk.mastery.length ? (
                  <tr key={sk.id}>
                    <td data-label="Skill">S{i + 1} · {sk.name}</td>
                    {sk.mastery.map((m, lv) => {
                      const best = bestTrainers(data, account.value.ops, op, lv + 1, m.hours, 1)[0];
                      return <td key={lv} data-label={`To M${lv + 1}`}>{best ? <><a href={href(`/operator/${best.id}`)}>{name(best.id)}</a><br /><small class="muted">+{best.speed}% · {hm(best.hours)} (not {hm(m.hours)})</small></> : <small class="muted">{hm(m.hours)}, no trainer</small>}</td>;
                    })}
                  </tr>
                ) : null)}
              </tbody>
            </table>
          </div>
        )}
      </Await>
    </section>
  );
}

function View({ d, op, ops, usageRow, is, tags }: {
  d: OpDetail; op: OpIndex; ops: OpIndex[]; usageRow: Parameters<typeof CommunityView>[0]["u"];
  is: Parameters<typeof CommunityView>[0]["is"]; tags?: string[];
}) {
  const q = route.value.query;
  const tab = (q.get("tab") || "overview") as Tab;
  const spec = useMemo(() => specFromQuery(d, (k) => q.get(k)), [d, q.toString()]);
  const meta = metaSig.value;
  const owned = account.value.ops[op.id];
  const alters = (op.alters || []).map((a) => ops.find((o) => o.id === a)).filter(Boolean) as OpIndex[];
  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" }, { key: "skills", label: `Skills (${d.skills.length})` },
    { key: "talents", label: "Talents" }, { key: "modules", label: `Modules (${d.modules.length})` },
    { key: "base", label: "Base skills" }, { key: "costs", label: "Upgrade costs" }, { key: "community", label: "Community" },
  ];
  const skillLevel = spec.skillLevel || 7;
  const [artChoice, setArtChoice] = useState<number | null>(null);
  useEffect(() => { // after the shell sets its generic title
    const t = setTimeout(() => (document.title = `${op.name} · Novena`), 0);
    return () => clearTimeout(t);
  }, [op.id]);
  const worn = account.value.ops[op.id]?.skin;
  const artElite = artChoice ?? (worn ? 9 : spec.elite >= 2 && d.phases.length > 2 ? 2 : 0); // 9: your outfit
  return (
    <div class="fade-in">
      <section class="ophero" aria-label={`${op.name}`}>
        <Art srcs={artElite === 9 && worn ? [art.outfitSplash(worn), ...art.splashes(op.id, 2)] : art.splashes(op.id, artElite)} class="splash" alt="" eager />
        <div class="halo" aria-hidden="true" />
        <div class="left">
          <div class="ident">
            <span class="clsbox"><img src={art.classIcon(op.cls)} alt="" /></span>
            <GIcon src={art.branchIcon(op.branch)} alt={meta?.branches[op.branch] || op.branch} size={30} />
            <span style={{ fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "0.82rem" }}>
              {CLASS_NAMES[op.cls]} · {meta?.branches[op.branch] || op.branch} · {op.pos === "MELEE" ? "Melee" : "Ranged"}
            </span>
          </div>
          <div>
            <h1>{op.name}</h1>
            <div class="row" style={{ marginTop: "8px" }}>
              <Stars n={op.rarity} img />
              {op.cn && op.cn !== op.name && <span class="muted">{op.cn}</span>}
              {op.src && <span class="badge cn" title="CN has this operator; this server doesn't yet. Text is CN's.">CN only</span>}
            </div>
          </div>
          <div class="badges">
            {op.factions.map((f) => <span key={f} class="badge">{meta?.factions[f] || f}</span>)}
            <span class="badge">{OBTAIN_NAMES[op.obtain] || op.obtain}</span>
            <span class="badge">On {op.on.map((sv) => SERVERS.find((x) => x.id === sv)!.label).join(" · ")}</span>
          </div>
          <BuildControls d={d} spec={spec} compact onChange={(n) => setQuery(specToQuery(n))} />
          <StatsView d={d} spec={spec} />
          <div class="row" style={{ marginTop: "auto" }}>
            <a class="btn primary" href={href("/planner", { add: op.id })}>Plan upgrades</a>
            <a class="btn" href={href("/compare", { ops: op.id })}>Compare</a>
          </div>
        </div>
        {d.phases.length > 2 && (
          <div class="artsw seg" role="group" aria-label="Art">
            <button type="button" aria-pressed={artElite === 0} onClick={() => setArtChoice(0)}>Base art</button>
            <button type="button" aria-pressed={artElite === 2} onClick={() => setArtChoice(2)}>Elite 2 art</button>
            {worn && <button type="button" aria-pressed={artElite === 9} onClick={() => setArtChoice(9)} title="The outfit you wear, from Novena Sync">Your outfit</button>}
          </div>
        )}
      </section>
      {owned && <p class="note">In your roster: <BuildMarks s={owned} op={op} /> <GIcon src={art.potential(owned.pot)} alt={`Potential ${owned.pot}`} size={20} /></p>}
      <Divider />
      <Tabs label="Operator sections" tabs={tabs} value={tab} onChange={(t) => setQuery({ tab: t === "overview" ? "" : t })} />
      {tab === "overview" && (
        <div class="stack">
          <div class="grid two">
            <section class="card">
              <h2>Trait</h2>
              <p><Rich html={d.desc} /></p>
              {d.trait?.map((t, i) => <p key={i}><span class="badge">E{t.elite}{t.pot ? ` P${t.pot + 1}` : ""}</span> <Rich html={t.desc} /></p>)}
              <h3>Potentials</h3>
              <ol style={{ paddingLeft: "1.3em", margin: 0 }}>
                {d.pots.map((p, i) => <li key={i} value={i + 2}>P{i + 2}: {p.desc}</li>)}
              </ol>
            </section>
            <section class="card">
              <h2>Recruitment</h2>
              {op.recruit && tags ? (
                <><p>Recruitable. Tags:</p><div class="chips">{tags.map((t) => <span key={t} class="badge">{t}</span>)}</div>
                  <p style={{ marginTop: "8px" }}><a href={href("/recruit", { tags: "" })}>Open the recruitment calculator</a></p></>
              ) : <p>Not in the recruitment pool on this server.</p>}
              {alters.length > 0 && (
                <>
                  <h3 style={{ marginTop: "12px" }}>Other forms</h3>
                  <ul>{alters.map((a) => <li key={a.id}><a href={href(`/operator/${a.id}`)}>{a.name}</a></li>)}</ul>
                </>
              )}
            </section>
          </div>
        </div>
      )}
      {tab === "skills" && (
        <div class="grid three">
          {d.skills.length === 0 && <p class="muted">No skills.</p>}
          {d.skills.map((sk, i) => (
            <SkillView key={sk.id} skill={sk} index={i} level={Math.min(skillLevel, sk.levels.length)}
              onLevel={(n) => setQuery({ sl: String(n) })} />
          ))}
          {hasRoster.value && d.skills.some((sk) => sk.mastery.length) && <Trainers d={d} op={op} ops={ops} />}
        </div>
      )}
      {tab === "talents" && <TalentsView d={d} />}
      {tab === "modules" && <ModulesView d={d} />}
      {tab === "base" && <RiicView d={d} />}
      {tab === "costs" && <CostsView d={d} />}
      {tab === "community" && <CommunityView id={op.id} rarity={op.rarity} u={usageRow} is={is} modules={d.modules.map((m) => m.letter)} />}
    </div>
  );
}
