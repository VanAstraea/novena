import { useMemo } from "preact/hooks";
import { BuildControls, CommunityView, CostsView, ModulesView, RiicView, SkillView, specFromQuery, specToQuery, StatsView, TalentsView } from "../components/OpParts";
import { Avatar, Await, metaSig, Rich, Stars, Tabs, useAsync } from "../components/ui";
import { integrated, operator, operators, recruit as loadRecruit, usage as loadUsage } from "../lib/data";
import { CLASS_NAMES, OBTAIN_NAMES } from "../lib/format";
import { href, route, setQuery } from "../lib/router";
import { account, SERVERS, server } from "../state";
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
  return (
    <div class="stack fade-in">
      <div class="row" style={{ gap: "14px" }}>
        <Avatar op={op} size="lg" />
        <div class="grow">
          <h1 style={{ marginBottom: "4px" }}>{op.name} {op.src && <span class="badge cn" title="CN has this operator; this server doesn't yet. Text is CN's.">CN only</span>}</h1>
          <p style={{ margin: 0 }}>
            <Stars n={op.rarity} /> {CLASS_NAMES[op.cls]} · {meta?.branches[op.branch] || op.branch} · {op.pos === "MELEE" ? "Melee" : "Ranged"}
            {op.cn && op.cn !== op.name && <span class="muted"> · {op.cn}</span>}
          </p>
          <p class="muted" style={{ margin: 0 }}>
            {op.factions.map((f) => meta?.factions[f] || f).join(" · ")}{op.factions.length ? " · " : ""}{OBTAIN_NAMES[op.obtain] || op.obtain}
            {" · on "}{op.on.map((sv) => SERVERS.find((x) => x.id === sv)!.label).join(", ")}
          </p>
        </div>
        <div class="row">
          <a class="btn" href={href("/compare", { ops: op.id })}>Compare</a>
          <a class="btn" href={href("/planner", { add: op.id })}>Plan upgrades</a>
        </div>
      </div>
      {owned && <p class="note">In your roster: E{owned.elite} Lv {owned.level}, SL{owned.skillLevel}{owned.masteries.some((m) => m) ? `, ${owned.masteries.map((m, i) => m ? `S${i + 1}M${m}` : "").filter(Boolean).join(" ")}` : ""}{Object.entries(owned.modules).filter(([, v]) => v).map(([k, v]) => `, Mod ${k}${v}`).join("")}.</p>}
      <Tabs label="Operator sections" tabs={tabs} value={tab} onChange={(t) => setQuery({ tab: t === "overview" ? "" : t })} />
      {tab === "overview" && (
        <div class="stack">
          <section class="card">
            <h2>Stats</h2>
            <BuildControls d={d} spec={spec} compact onChange={(n) => setQuery(specToQuery(n))} />
            <div style={{ marginTop: "12px" }}><StatsView d={d} spec={spec} /></div>
          </section>
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
        <div class="stack">
          {d.skills.length === 0 && <p class="muted">No skills.</p>}
          {d.skills.map((sk, i) => (
            <SkillView key={sk.id} skill={sk} index={i} level={Math.min(skillLevel, sk.levels.length)}
              onLevel={(n) => setQuery({ sl: String(n) })} />
          ))}
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
