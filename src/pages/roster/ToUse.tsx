// The roster's To use tab.
import { useMemo } from "preact/hooks";
import { Await, ItemIcon, itemName, itemsSig, metaSig, OpLink, useAsync } from "../../components/ui";
import { costTable } from "../../lib/account";
import { expiring, held, tokenUse, voucherIds, voucherPicks } from "../../lib/consumables";
import { usage as loadUsage } from "../../lib/data";
import { planNeeds } from "../../lib/needs";
import { CLASSES } from "../../lib/training";
import { date, fmt } from "../../lib/format";
import { updateAccount as update } from "../../lib/accountImport";
import { account, server } from "../../state";
import type { OpIndex } from "../../types";

/** Items waiting to be used: training vouchers (and who to spend them on), potential tokens, and what expires. */
export function ToUse({ ops }: { ops: OpIndex[] }) {
  const s = server.value;
  const st = useAsync(() => Promise.all([costTable(s), loadUsage()]), [s]);
  const byId = useMemo(() => new Map(ops.map((o) => [o.id, o])), [ops]);
  const items = itemsSig.value, meta = metaSig.value;
  const a = account.value;
  const setVoucher = (id: string, n: number) => update((acc) => {
    const keep = (acc.consumables?.[id] || []).filter((x) => x.ts > 0);
    return { ...acc, consumables: { ...acc.consumables, [id]: n > 0 ? [...keep, { count: n, ts: -1 }] : keep } };
  });
  const classLabel = (cls: string) => CLASSES.find(([c]) => c === cls)?.[1] || cls;
  return (
    <Await state={st} what="costs and community data">
      {([costs, usage]) => {
        if (!items || !meta) return <p class="muted">Loading…</p>;
        const goals = planNeeds(ops, costs, meta, items).goals;
        const have = held(a);
        const vouchers = voucherIds(items);
        const tokens = Object.entries(a.depot).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n, use: tokenUse(id, items, a.ops, byId, classLabel) }))
          .filter((t) => t.use).sort((x, y) => Number(y.use!.ready) - Number(x.use!.ready) || x.use!.target.localeCompare(y.use!.target));
        const soon = expiring(a, items);
        const potion = soon.reduce((t, e) => t + (e.sanity || 0), 0);
        const days = (ts: number) => Math.max(0, Math.ceil((ts * 1000 - Date.now()) / 86400_000));
        return (
          <div class="stack">
            <section class="card">
              <h2>Training vouchers</h2>
              <p class="muted">Novena Sync brings these in; or type how many you have. Each one is ranked against your roster: what your plan raises first, then what players most often raise that far, then the dearest to raise by hand.</p>
              <div class="stack">
                {vouchers.map((id) => {
                  const n = have[id] || 0;
                  const picks = n ? voucherPicks(id, items, a.ops, byId, costs, meta.const, usage, goals) : [];
                  return (
                    <div key={id} class="voucher">
                      <div class="row">
                        <ItemIcon id={id} bare /><strong>{itemName(id)}</strong>
                        <label class="row tight" style={{ marginLeft: "auto" }}><span class="muted">Have</span>
                          <input type="number" min={0} max={99} value={n} onChange={(e) => setVoucher(id, Math.max(0, Number((e.target as HTMLInputElement).value) || 0))} /></label>
                      </div>
                      {n > 0 && (picks.length ? (
                        <ol class="picks">{picks.map((p) => (
                          <li key={p.id + p.upgrade}><OpLink op={byId.get(p.id)!} /> <span>{p.upgrade}</span>
                            <small class="muted"> · saves ~{fmt(p.sanity)} sanity{p.planned ? " · in your plan" : ""}{p.rate ? ` · ${Math.round(p.rate * 100)}% of players do this` : ""}</small></li>
                        ))}</ol>
                      ) : <p class="muted">Nobody in your roster can use it right now.</p>)}
                    </div>
                  );
                })}
              </div>
            </section>
            <section class="card">
              <h2>Potential tokens</h2>
              {tokens.length ? (
                <ul>{tokens.map((t) => <li key={t.id}><span class="row tight"><ItemIcon id={t.id} count={t.n} /> <strong>{t.use!.target}</strong></span> <span class={t.use!.ready ? "" : "muted"}>{t.use!.note}</span></li>)}</ul>
              ) : <p class="muted">No potential tokens in your depot. They come in with Novena Sync or a sync file, or add them on the Depot tab.</p>}
            </section>
            <section class="card">
              <h2>Expiring soon</h2>
              {soon.length ? (
                <>
                  {potion > 0 && <p>Sanity potions hold <strong>{potion}</strong> sanity before they expire: plan them into your farming.</p>}
                  <div class="table-wrap">
                    <table class="cards">
                      <thead><tr><th>Item</th><th class="num">Count</th><th>Expires</th></tr></thead>
                      <tbody>{soon.map((e, i) => (
                        <tr key={e.id + i}>
                          <td data-label="Item"><span class="row tight"><ItemIcon id={e.id} bare />{itemName(e.id)}</span></td>
                          <td data-label="Count" class="num">{e.count}{e.sanity ? <small class="muted"> ({e.sanity} sanity)</small> : null}</td>
                          <td data-label="Expires" class={days(e.ts) <= 7 ? "warn-text" : ""}>{date(e.ts * 1000)} <small class="muted">in {days(e.ts)} day{days(e.ts) === 1 ? "" : "s"}</small></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </>
              ) : <p class="muted">Nothing that expires. Time-limited items (sanity potions, limited permits) come in with Novena Sync or a sync file.</p>}
            </section>
          </div>
        );
      }}
    </Await>
  );
}
