// Upcoming content, with CN as the preview: events, operators, modules, banners and Contingency Contract.
import { Avatar, Await, Explain, OpLink, Stars, Tabs, useAsync } from "../components/ui";
import { operators, upcoming as loadUpcoming, usage as loadUsage } from "../lib/data";
import { date, pct, relative } from "../lib/format";
import { href, route, setQuery } from "../lib/router";
import { account, hasRoster, server } from "../state";
import type { OpIndex, UpcomingFile, UsageFile } from "../types";

type View = "events" | "operators" | "modules" | "banners" | "cc";

const KIND: Record<string, string> = { limited: "Limited", collab: "Collaboration", special: "Special (pick rate-ups)", kernel: "Kernel" };

function Eta({ eta, confirmed, cn }: { eta: string; confirmed?: boolean; cn?: string }) {
  const past = new Date(eta).getTime() < Date.now();
  return (
    <span>
      {confirmed ? <strong>{date(eta)}</strong> : <>~{date(eta)} <span class="badge est" title="Estimated: CN's date plus the measured lag">estimate</span></>}
      <br /><small class={past && !confirmed ? "warn-text" : "muted"}>{past && !confirmed ? "Expected already: may have been skipped or moved" : relative(eta)}{cn ? ` · CN ${date(cn)}` : ""}</small>
    </span>
  );
}

export default function Upcoming() {
  const s = server.value;
  const st = useAsync(() => Promise.all([loadUpcoming(s), operators(s), loadUsage()]), [s]);
  const view = (route.value.query.get("view") || "events") as View;
  if (s === "cn") {
    return (
      <div class="stack fade-in"><h1>Upcoming content</h1>
        <div class="card"><p>CN is the server everyone else follows, so there's no preview for it here. Switch to EN, JP or KR to see what's coming from CN.</p></div>
      </div>
    );
  }
  return (
    <div class="stack fade-in">
      <h1>Upcoming content</h1>
      <Await state={st} what="upcoming content">
        {([up, ops, usage]) => {
          const byId = new Map(ops.map((o) => [o.id, o]));
          return (
            <>
              <p class="muted">CN runs months ahead. Dates here are CN's plus the lag measured over the last events both servers ran ({up.lag_days ?? "?"} days); servers do skip and reorder things, collaborations especially.</p>
              <Tabs label="Upcoming sections" value={view} onChange={(v) => setQuery({ view: v === "events" ? "" : v })} tabs={[
                { key: "events", label: `Events (${up.events.length})` }, { key: "operators", label: `Operators (${up.operators.length})` },
                { key: "modules", label: "Modules" }, { key: "banners", label: `Banners (${up.banners.length})` }, { key: "cc", label: "Contingency Contract" },
              ]} />
              {view === "events" && <Events up={up} byId={byId} />}
              {view === "operators" && <Operators up={up} byId={byId} usage={usage} />}
              {view === "modules" && <Modules up={up} byId={byId} usage={usage} />}
              {view === "banners" && <Banners up={up} byId={byId} usage={usage} />}
              {view === "cc" && <CC up={up} ops={ops} usage={usage} />}
            </>
          );
        }}
      </Await>
    </div>
  );
}

function Events({ up, byId }: { up: UpcomingFile; byId: Map<string, OpIndex> }) {
  return (
    <div class="stack">
      {up.events.map((e) => {
        const owned = e.key_ops.filter((k) => account.value.ops[k.id]);
        return (
          <details key={e.id} class="card" open={e === up.events.find((x) => new Date(x.eta).getTime() > Date.now())}>
            <summary style={{ cursor: "pointer" }}>
              <strong>{e.name || e.name_cn}</strong> {e.name && <span class="muted">{e.name_cn}</span>}
              <span class="muted"> · </span><Eta eta={e.eta} confirmed={e.confirmed} cn={e.cn_start} />
            </summary>
            <p style={{ marginTop: "8px" }}>{e.stages} stages, {e.guided} with community guides ({e.guides} guides).</p>
            {e.key_ops.length > 0 ? (
              <>
                <h3>Operators its guides use most</h3>
                <div class="op-grid">
                  {e.key_ops.map((k) => {
                    const op = byId.get(k.id);
                    if (!op) return null;
                    const mine = account.value.ops[k.id];
                    return (
                      <a key={k.id} class="op-card" href={href(`/operator/${k.id}`)}>
                        <Avatar op={op} size="sm" />
                        <span><span class="op-name">{op.name}</span><br /><span class="meta">in {pct(k.share, 0)} of guides</span>
                          {hasRoster.value && <><br /><span class={`meta ${mine ? "good-text" : "warn-text"}`}>{mine ? `yours: E${mine.elite} Lv ${mine.level}` : "not owned"}</span></>}
                          {op.src && <><br /><span class="badge cn">CN only</span></>}</span>
                      </a>
                    );
                  })}
                </div>
                {hasRoster.value && <p class="muted" style={{ marginTop: "8px" }}>Readiness: you own {owned.length} of these {e.key_ops.length}.</p>}
              </>
            ) : <p class="muted">No community guides for it yet.</p>}
          </details>
        );
      })}
      <Explain>Key operators: share of the event's community clear guides (CN) that use each one, weighted by views.</Explain>
    </div>
  );
}

function Operators({ up, byId, usage }: { up: UpcomingFile; byId: Map<string, OpIndex>; usage: UsageFile }) {
  return (
    <>
      <div class="table-wrap">
        <table class="cards">
          <thead><tr><th>Operator</th><th class="num">Usage on CN</th><th>Community build</th><th>Banner</th></tr></thead>
          <tbody>
            {up.operators.map((id) => {
              const op = byId.get(id);
              if (!op) return null;
              const u = usage.ops[id];
              const banner = up.banners.find((b) => b.featured.includes(id));
              const b = u?.build || {};
              return (
                <tr key={id}>
                  <td data-label="Operator"><OpLink op={op} sub={<Stars n={op.rarity} />} /></td>
                  <td data-label="Usage on CN" class="num">{u?.score ? pct(u.score) : "–"}</td>
                  <td data-label="Community build">{[b.elite ? `E${b.elite}` : "", b.skill ? `S${b.skill}${b.mastery ? ` M${b.mastery}` : ""}` : "", b.module ? `Mod ${b.module}` : ""].filter(Boolean).join(", ") || "–"}</td>
                  <td data-label="Banner">{banner ? <><Eta eta={banner.eta} /><br /><small>{KIND[banner.kind]}</small></> : <span class="muted">Not in a listed banner</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Explain>Operators CN has and this server doesn't yet, most used in community clears first.</Explain>
    </>
  );
}

function Modules({ up, byId, usage }: { up: UpcomingFile; byId: Map<string, OpIndex>; usage: UsageFile }) {
  const mineOnly = route.value.query.get("mine") === "1" && hasRoster.value;
  const rows = up.modules.filter((m) => !mineOnly || account.value.ops[m.char])
    .sort((a, b) => (usage.ops[b.char]?.score || 0) - (usage.ops[a.char]?.score || 0));
  return (
    <>
      {hasRoster.value && <label class="row tight"><input type="checkbox" checked={mineOnly} onChange={(e) => setQuery({ mine: (e.target as HTMLInputElement).checked ? "1" : "" })} /> Only for operators I own</label>}
      <div class="table-wrap">
        <table class="cards">
          <thead><tr><th>Operator</th><th>Module</th><th class="num">CN owners with it</th><th>Expected</th></tr></thead>
          <tbody>
            {rows.slice(0, 80).map((m) => {
              const op = byId.get(m.char);
              if (!op) return null;
              const rate = usage.ops[m.char]?.inv?.mod[m.letter];
              return (
                <tr key={m.id}>
                  <td data-label="Operator"><OpLink op={op} /></td>
                  <td data-label="Module">{m.icon} <small class="muted">{m.name_cn}</small></td>
                  <td data-label="CN owners with it" class="num">{rate !== undefined ? pct(rate, 0) : "–"}</td>
                  <td data-label="Expected"><Eta eta={m.eta} cn={m.cn_start} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Explain>Modules CN has for operators this server already has. "CN owners with it": share of E2 owners who unlocked it (Yituliu survey).</Explain>
    </>
  );
}

function Banners({ up, byId, usage }: { up: UpcomingFile; byId: Map<string, OpIndex>; usage: UsageFile }) {
  return (
    <div class="stack">
      {up.banners.map((b) => (
        <div key={b.id} class="card">
          <div class="row" style={{ justifyContent: "space-between" }}>
            <span><strong>{KIND[b.kind] || b.kind}</strong> <span class="muted">{b.name_cn}</span></span>
            <Eta eta={b.eta} cn={b.cn_open} />
          </div>
          <div class="row" style={{ marginTop: "8px" }}>
            {b.featured.map((id) => {
              const op = byId.get(id);
              return op ? <OpLink key={id} op={op} sub={<>usage {pct(usage.ops[id]?.score || 0)}{account.value.ops[id] ? " · owned" : ""}</>} /> : null;
            })}
          </div>
          {b.spark && <p class="muted" style={{ marginTop: "6px" }}>Limited banner: {b.spark} pulls guarantee the featured operator.</p>}
        </div>
      ))}
      {!up.banners.length && <p class="muted">No listed banners in the next 200 days.</p>}
      <Explain>Only banners whose featured 6★ the game's table names (limited, collaboration, special, Kernel); standard banners don't list theirs. Limited and collaboration banners this server already ran are left out.</Explain>
    </div>
  );
}

function CC({ up, ops, usage }: { up: UpcomingFile; ops: OpIndex[]; usage: UsageFile }) {
  const cc = up.cc;
  const top = ops.filter((o) => usage.ops[o.id]?.u?.cc).sort((a, b) => (usage.ops[b.id].u!.cc || 0) - (usage.ops[a.id].u!.cc || 0)).slice(0, 25);
  return (
    <div class="grid two">
      <section class="card">
        <h2>Seasons</h2>
        {cc?.current && <p>Running now: <strong>{cc.current.name}</strong>, until {date(cc.current.end)}.</p>}
        {cc?.next ? <p>Next: <strong>{cc.next.name_cn}</strong> <Eta eta={cc.next.eta} cn={cc.next.cn_start} /></p> : <p class="muted">No newer CN season known.</p>}
        <h3>Recent on this server</h3>
        <ul>{cc?.history.slice(0, 6).map((h) => <li key={h.id}>{h.name} <span class="muted">{date(h.start)}</span></li>)}</ul>
        <Explain>Lag measured over the last three seasons both servers ran ({cc?.lag_days ?? "?"} days).</Explain>
      </section>
      <section class="card">
        <h2>Operators CC guides use most</h2>
        <ol style={{ paddingLeft: "1.3em" }}>
          {top.map((o) => {
            const mine = account.value.ops[o.id];
            return <li key={o.id}><a href={href(`/operator/${o.id}`)}>{o.name}</a> <span class="muted">{pct(usage.ops[o.id].u!.cc)}</span>{mine ? <span class="good-text"> · yours E{mine.elite}</span> : hasRoster.value ? <span class="muted"> · not owned</span> : null}{o.src ? <span class="badge cn">CN only</span> : null}</li>;
          })}
        </ol>
        <Explain>Share of Contingency Contract clear guides (CN) that use the operator.</Explain>
      </section>
    </div>
  );
}
