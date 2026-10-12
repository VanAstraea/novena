// The banners CN has run and this server hasn't yet, with their dates (this server's, the wiki's or an estimate),
// featured operators and spark. Shown on Banners & pulls; Eta and Unofficial are shared with Upcoming.
import type { ComponentChildren } from "preact";
import { Explain, OpLink } from "./ui";
import { date, pct, relative } from "../lib/format";
import { account } from "../state";
import type { OpIndex, UpcomingFile, UsageFile, WikiDated } from "../types";

export type Banner = UpcomingFile["banners"][number];

export const KIND: Record<string, string> = { limited: "Limited", collab: "Collaboration", special: "Special (pick rate-ups)", kernel: "Kernel" };

/** A date: solid when this server's game data lists it, linked when the wiki dates it, otherwise an estimate. */
export function Eta({ eta, confirmed, cn, x }: { eta: string; confirmed?: boolean; cn?: string; x?: WikiDated }) {
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

/** Marks a name this server's game data doesn't give yet: the wiki's (linked), or Novena's own translation of CN's. */
export function Unofficial({ wiki }: { wiki?: string }) {
  if (wiki) return <a class="badge unofficial" href={wiki} rel="noopener" title="The Arknights Terra Wiki's name: the announced Global name, or the community's until there is one. The game's own name replaces it once this server lists it.">wiki name</a>;
  return <span class="badge unofficial" title="Novena's own translation: Global hasn't named this yet. The official name replaces it when it's announced.">unofficial</span>;
}

/** The coming banners as cards; `action` adds something of the page's own under each one. */
export function UpcomingBanners({ up, byId, usage, action }: { up: UpcomingFile; byId: Map<string, OpIndex>; usage: UsageFile; action?: (b: Banner) => ComponentChildren }) {
  return (
    <div class="stack">
      {up.banners.map((b) => (
        <div key={b.id} id={`banner-${b.id}`} class="card">
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
          {action?.(b)}
        </div>
      ))}
      {!up.banners.length && <p class="muted">No listed banners in the next 200 days.</p>}
      <Explain>Only banners whose featured 6★ the game's table names (limited, collaboration, special, Kernel); standard banners don't list theirs. Limited and collaboration banners this server already ran are left out.</Explain>
    </div>
  );
}
