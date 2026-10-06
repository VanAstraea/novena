// Upcoming content, with CN as the preview: events, operators, modules, banners and Contingency Contract.
import { Fragment } from "preact";
import { OpFilters, useOpFilters } from "../components/OpFilters";
import { Await, Explain, ItemIcon, itemName, itemsSig, metaSig, OpLink, Stars, Tabs, useAsync } from "../components/ui";
import { CommunityMarks } from "../components/Marks";
import { costTable } from "../lib/account";
import { planNeeds } from "../lib/needs";
import { ROLE_HINTS, ROLE_NAMES, ROLES, roleOf } from "../lib/roles";
import { operators, shops as loadShops, upcoming as loadUpcoming, usage as loadUsage } from "../lib/data";
import { date, pct, relative } from "../lib/format";
import { href, route, setQuery } from "../lib/router";
import { account, hasRoster, server } from "../state";
import type { KeyOp, OpIndex, ShopEvent, UpcomingFile, UsageFile, WikiDated } from "../types";

type View = "events" | "shops" | "operators" | "modules" | "banners" | "cc";

const KIND: Record<string, string> = { limited: "Limited", collab: "Collaboration", special: "Special (pick rate-ups)", kernel: "Kernel" };

/** A date: solid when this server's game data lists it, linked when the wiki dates it, otherwise an estimate. */
function Eta({ eta, confirmed, cn, x }: { eta: string; confirmed?: boolean; cn?: string; x?: WikiDated }) {
  const wiki = !confirmed && x?.dated_by === "wiki";
  const late = !confirmed && !wiki && (x?.overdue || new Date(eta).getTime() < Date.now());
  return (
    <span>
      {confirmed ? <strong>{date(eta)}</strong>
        : wiki ? <><strong>{date(eta)}</strong> <a class="badge wiki" href={x!.wiki} rel="noopener" title="Dated by the Arknights Terra Wiki from an announcement or the game files, not Novena's estimate">dated by the wiki</a></>
        : <>~{date(eta)} <span class="badge est" title="Estimated: CN's date plus the measured lag">estimate</span></>}
      <br /><small class={late ? "warn-text" : "muted"}>{late ? "Expected already: may have been skipped or moved" : relative(eta)}{wiki && x!.end ? ` · until ${date(x!.end)}` : ""}{cn ? ` · CN ${date(cn)}` : ""}</small>
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
              <p class="note" role="note"><strong>Most of these dates are estimates, not announcements.</strong> CN runs months ahead, so a date marked <span class="badge est">estimate</span> is CN's date plus the lag measured over the last events both servers ran ({up.lag_days ?? "?"} days). Servers skip, swap and reorder things, collaborations especially. A date marked <span class="badge wiki">dated by the wiki</span> comes from the <a href="https://arknights.wiki.gg/wiki/Event" rel="noopener">Arknights Terra Wiki</a>: announced, or found in the game files. A date turns solid (no badge) once this server's own game data lists it; the official news and in-game notices come first.</p>
              <Tabs label="Upcoming sections" value={view} onChange={(v) => setQuery({ view: v === "events" ? "" : v })} tabs={[
                { key: "events", label: `Events (${up.events.length})` }, { key: "shops", label: "Event shops" }, { key: "operators", label: `Operators (${up.operators.length})` },
                { key: "modules", label: "Modules" }, { key: "banners", label: `Banners (${up.banners.length})` }, { key: "cc", label: "Contingency Contract" },
              ]} />
              {view === "events" && <Events up={up} byId={byId} />}
              {view === "shops" && <Shops ops={ops} />}
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

function Shops({ ops }: { ops: OpIndex[] }) {
  const s = server.value;
  const st = useAsync(() => Promise.all([loadShops(s), costTable(s)]), [s]);
  return (
    <Await state={st} what="event shops">
      {([shops, costs]) => {
        const items = itemsSig.value, meta = metaSig.value;
        if (!items || !meta) return <p class="muted">Loading…</p>;
        const needs = hasRoster.value ? planNeeds(ops, costs, meta, items) : null;
        if (!shops.events.length) return <p class="muted">No event shop is recorded for the events running or coming here.</p>;
        return (
          <div class="stack">
            {needs && needs.from === "none" && <p class="note">Set targets in the <a href={href("/planner")}>Materials planner</a> (or build a <a href={href("/plan")}>Plan</a>) to see which offers cover what you're short of.</p>}
            {shops.events.map((e) => <ShopCard key={e.id} e={e} values={items.values} short={needs?.short || {}} />)}
            <Explain>Shops come from Yituliu's record of every CN event shop; this server runs the same events later with the same shops. An offer's value is the sanity its items are worth (the planner's material values); "per token" ranks offers by value for the tokens. "You need" is how many purchases would cover what your plan is still short of after your depot (crafting included).</Explain>
          </div>
        );
      }}
    </Await>
  );
}

function ShopCard({ e, values, short }: { e: ShopEvent; values: Record<string, number>; short: Record<string, number> }) {
  const rows = e.offers.map(([id, price, qty, stock, area]) => {
    const unit = values[id];
    const worth = unit !== undefined ? unit * qty : null;
    let need = short[id] > 0 ? Math.ceil(short[id] / qty) : 0;
    if (stock !== null) need = Math.min(need, stock);
    return { id, price, qty, stock, area, worth, per: worth !== null ? worth / price : null, need };
  }).sort((a, b) => (b.per ?? -1) - (a.per ?? -1) || a.id.localeCompare(b.id));
  const needTokens = rows.reduce((t, r) => t + r.need * r.price, 0);
  return (
    <details class="card" open={e.status === "running" || undefined}>
      <summary style={{ cursor: "pointer" }}>
        <strong>{e.name}</strong>{e.unofficial && <> <Unofficial wiki={e.name_by === "wiki" ? e.wiki : undefined} /></>} <span class="muted">· {e.status === "running" ? `running, ends ${date(e.end!)}` : <>coming <Eta eta={e.eta!} confirmed={e.confirmed} x={e} /></>}</span>
        {needTokens > 0 && <span class="badge" style={{ marginLeft: "8px" }}>{needTokens.toLocaleString()} tokens for what you need</span>}
      </summary>
      <div class="table-wrap" style={{ marginTop: "10px" }}>
        <table class="cards">
          <thead><tr><th>Offer</th><th class="num">Price</th><th class="num">Stock</th><th class="num">Value</th><th class="num">Per token</th><th class="num">You need</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id + r.price + r.area}>
                <td data-label="Offer"><span class="row tight"><ItemIcon id={r.id} bare />{r.qty > 1 ? `${r.qty} × ` : ""}{itemName(r.id)}</span></td>
                <td data-label="Price" class="num">{r.price}</td>
                <td data-label="Stock" class="num">{r.stock ?? "∞"}</td>
                <td data-label="Value" class="num">{r.worth !== null ? r.worth.toFixed(1) : "–"}</td>
                <td data-label="Per token" class="num">{r.per !== null ? r.per.toFixed(2) : "–"}</td>
                <td data-label="You need" class={`num${r.need ? " good-text" : ""}`}>{r.need || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Events({ up, byId }: { up: UpcomingFile; byId: Map<string, OpIndex> }) {
  return (
    <div class="stack">
      {up.events.map((e) => (
        <details key={e.id} class="card" open={e === up.events.find((x) => new Date(x.eta).getTime() > Date.now())}>
          <summary class="cut" style={{ cursor: "pointer" }}>
            <span class="cut-title" style={{ fontSize: "1.45rem" }}>{e.name || e.name_en || e.name_cn}</span>{!e.name && e.name_en && <> <Unofficial wiki={e.name_by === "wiki" ? e.wiki : undefined} /></>}
            <br />{(e.name || e.name_en) && <span class="muted">{e.name_cn} · </span>}<Eta eta={e.eta} confirmed={e.confirmed} cn={e.cn_start} x={e} />
          </summary>
          <p style={{ marginTop: "8px" }}>{e.stages} stages, {e.guided} with community guides ({e.guides} guides).</p>
          {e.key_ops.length > 0 ? <KeyOps ops={e.key_ops} byId={byId} /> : <p class="muted">No community guides for it yet.</p>}
        </details>
      ))}
      <Explain>Key operators: share of the event's community clear guides (CN) that use each one, weighted by views, grouped by the job they do in a team. "Or": the operators those guides list in the same slot, the alternatives their writers accept (most listed first). "Similar": where the guides name few, the most used operators of the same archetype on this server, which may need more work to fit. ✓ marks the ones you own.</Explain>
    </div>
  );
}

const ROLE_SHOWN = 4; // a role's operators shown before "more"

/** An event's key operators by role, each with what can stand in for it, and how your roster covers each role. */
function KeyOps({ ops, byId }: { ops: KeyOp[]; byId: Map<string, OpIndex> }) {
  const mine = account.value.ops, roster = hasRoster.value;
  const known = ops.filter((k) => byId.has(k.id));
  const groups = ROLES.map((r) => ({ r, ops: known.filter((k) => roleOf(byId.get(k.id)!) === r) })).filter((g) => g.ops.length);
  const cover = (g: { ops: KeyOp[] }) => g.ops.some((k) => mine[k.id]) ? "yes"
    : g.ops.some((k) => [...(k.alts || []).map(([id]) => id), ...(k.like || [])].some((id) => mine[id])) ? "alt" : "no";
  const uncovered = groups.filter((g) => cover(g) === "no").map((g) => ROLE_NAMES[g.r]);
  const row = (k: KeyOp) => <KeyOpRow key={k.id} k={k} byId={byId} />;
  return (
    <>
      <h3>Operators its guides use most</h3>
      {groups.map((g) => {
        const c = cover(g);
        return (
          <section key={g.r} class="key-role">
            <h4><span title={ROLE_HINTS[g.r]}>{ROLE_NAMES[g.r]}</span>
              {roster && <small class={c === "yes" ? "good-text" : c === "alt" ? "" : "warn-text"}>{c === "yes" ? "✓ covered" : c === "alt" ? "an alternative owned" : "none owned"}</small>}</h4>
            <ul class="key-ops">{g.ops.slice(0, ROLE_SHOWN).map(row)}</ul>
            {g.ops.length > ROLE_SHOWN && (
              <details class="key-more"><summary>{g.ops.length - ROLE_SHOWN} more</summary><ul class="key-ops">{g.ops.slice(ROLE_SHOWN).map(row)}</ul></details>
            )}
          </section>
        );
      })}
      {roster && (
        <p class="muted" style={{ marginTop: "8px" }}>Readiness: you own {known.filter((k) => mine[k.id]).length} of these {known.length}.
          {uncovered.length ? ` Nothing yet for ${uncovered.join(", ")}: not the operators, not their alternatives.` : " Every role is covered, by them or their alternatives."}</p>
      )}
    </>
  );
}

function KeyOpRow({ k, byId }: { k: KeyOp; byId: Map<string, OpIndex> }) {
  const op = byId.get(k.id)!;
  const mine = account.value.ops[k.id];
  const alts = (k.alts || []).filter(([id]) => byId.has(id));
  const like = (k.like || []).filter((id) => byId.has(id));
  return (
    <li class="key-op">
      <OpLink op={op} sub={<>in {pct(k.share, 0)} of guides{hasRoster.value && <> · <span class={mine ? "good-text" : "warn-text"}>{mine ? `yours: E${mine.elite} Lv ${mine.level}` : "not owned"}</span></>}</>} />
      {alts.length > 0 && (
        <p class="key-alts"><span class="muted" title={`What the guides that use ${op.name} list in the same slot, most listed first`}>Or:</span> {alts.map(([id, share], i) => <Fragment key={id}>{i > 0 && ", "}<AltName op={byId.get(id)!} note={`listed in ${pct(share, 0)} of the guides that use ${op.name}`} /></Fragment>)}
          {k.flex ? <span class="muted"> · swappable in {pct(k.flex, 0)} of its guides</span> : null}</p>
      )}
      {like.length > 0 && (
        <p class="key-alts"><span class="muted" title={`Its guides name few alternatives: the most used operators of ${op.name}'s archetype on this server`}>Similar:</span> {like.map((id, i) => <Fragment key={id}>{i > 0 && ", "}<AltName op={byId.get(id)!} note="same archetype" /></Fragment>)}</p>
      )}
    </li>
  );
}

/** A stand-in's name: linked, marked when it's yours or not on this server yet. */
function AltName({ op, note }: { op: OpIndex; note: string }) {
  const mine = account.value.ops[op.id];
  return (
    <a href={href(`/operator/${op.id}`)} data-panel={op.id} class={mine ? "alt-mine" : undefined}
      title={`${op.name}: ${note}${mine ? ` · yours, E${mine.elite} Lv ${mine.level}` : ""}${op.src ? " · not on this server yet" : ""}`}>
      {op.name}{mine ? " ✓" : ""}{op.src && <small class="muted">{" (CN)"}</small>}
    </a>
  );
}

function Operators({ up, byId, usage }: { up: UpcomingFile; byId: Map<string, OpIndex>; usage: UsageFile }) {
  const filters = useOpFilters();
  const shown = up.operators.filter((id) => { const op = byId.get(id); return op && filters.test(op); });
  return (
    <>
      <div class="card"><OpFilters classes owned={false} />{filters.active && <p class="muted" style={{ margin: "8px 0 0" }}>{shown.length} of {up.operators.length} operators</p>}</div>
      <div class="table-wrap">
        <table class="cards">
          <thead><tr><th>Operator</th><th class="num">Usage on CN</th><th>Community build</th><th>Banner</th></tr></thead>
          <tbody>
            {shown.map((id) => {
              const op = byId.get(id);
              if (!op) return null;
              const u = usage.ops[id];
              const banner = up.banners.find((b) => b.featured.includes(id));
              const b = u?.build || {};
              return (
                <tr key={id}>
                  <td data-label="Operator"><OpLink op={op} sub={<Stars n={op.rarity} />} /></td>
                  <td data-label="Usage on CN" class="num">{u?.score ? pct(u.score) : "–"}</td>
                  <td data-label="Community build"><CommunityMarks b={b} op={op} /></td>
                  <td data-label="Banner">{banner ? <><Eta eta={banner.eta} x={banner} /><br /><small>{KIND[banner.kind]}</small></> : <span class="muted">Not in a listed banner</span>}</td>
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
                  <td data-label="Module">{m.icon}{m.name_en && <> · {m.name_en} <Unofficial /></>} <small class="muted">{m.name_cn}</small></td>
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
            <span><strong>{KIND[b.kind] || b.kind}</strong>{b.name_en && <> · {b.name_en} <Unofficial wiki={b.name_by === "wiki" ? b.wiki : undefined} /></>} <span class="muted">{b.name_cn}</span></span>
            <Eta eta={b.eta} cn={b.cn_open} x={b} />
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
        {cc?.next ? <p>Next: <strong>{cc.next.name_en || cc.next.name_cn}</strong>{cc.next.name_en && <> <Unofficial wiki={cc.next.name_by === "wiki" ? cc.next.wiki : undefined} /> <span class="muted">{cc.next.name_cn}</span></>} <Eta eta={cc.next.eta} cn={cc.next.cn_start} x={cc.next} /></p> : <p class="muted">No newer CN season known.</p>}
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

/** Marks a name this server's game data doesn't give yet: the wiki's (linked), or Novena's own translation of CN's. */
function Unofficial({ wiki }: { wiki?: string }) {
  if (wiki) return <a class="badge unofficial" href={wiki} rel="noopener" title="The Arknights Terra Wiki's name: the announced Global name, or the community's until there is one. The game's own name replaces it once this server lists it.">wiki name</a>;
  return <span class="badge unofficial" title="Novena's own translation: Global hasn't named this yet. The official name replaces it when it's announced.">unofficial</span>;
}
