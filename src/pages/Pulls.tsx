// Banners & pulls (after ako's pulls.py): the banners coming from CN, then the pull planner: savings, a
// steady-income estimate, and how many pulls you'll have by a date or a banner.
import { useEffect } from "preact/hooks";
import { Await, Explain, useAsync } from "../components/ui";
import { KIND, UpcomingBanners, type Banner } from "../components/UpcomingBanners";
import { operators, progress as loadProgress, upcoming as loadUpcoming, usage as loadUsage } from "../lib/data";
import { date, fmt, relative } from "../lib/format";
import { href, route, setQuery } from "../lib/router";
import { annihilationTotalLeft, opLeft, ORUNDUM_PER_PRIME } from "../lib/storyLeft";
import { account, saveAccount, server } from "../state";

const ORUNDUM_PER_PULL = 600;
const DAILY = 100; // daily missions
const WEEKLY = 500 + 1800; // weekly missions + Annihilation cap
const CARD = 200; // monthly card, per day
const DAY = 86400_000;

export default function Pulls() {
  const s = server.value;
  const st = useAsync(() => Promise.all([loadUpcoming(s), operators(s), loadUsage()]), [s]);
  const sv = account.value.savings || { orundum: 0, prime: 0, permits: 0, card: false };
  const set = (patch: Partial<typeof sv>) => saveAccount({ ...account.value, savings: { ...sv, ...patch } });
  const perDay = DAILY + WEEKLY / 7 + (sv.card ? CARD : 0);
  const now = (withPrime: boolean) => (sv.orundum + (withPrime ? sv.prime * ORUNDUM_PER_PRIME : 0)) / ORUNDUM_PER_PULL + sv.permits;
  const byThen = (t: string) => now(false) + (Math.max(0, (new Date(t).getTime() - Date.now()) / DAY) * perDay) / ORUNDUM_PER_PULL;

  // The planner's target: a banner (?for=) or a date of your own (?by=), which wins when both are set.
  const q = route.value.query;
  const banners = s !== "cn" ? st.data?.[0].banners || [] : [];
  const target = banners.find((b) => b.id === q.get("for"));
  const by = q.get("by") || target?.eta.slice(0, 10) || "";
  const plan = (b: Banner) => {
    setQuery({ for: b.id, by: "" });
    document.getElementById("pull-planner")?.scrollIntoView({ block: "start" });
  };

  // A link to one banner (#banner-...) scrolls to its card once the list is in.
  const loaded = st.data !== undefined;
  useEffect(() => { if (loaded && location.hash.startsWith("#banner-")) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" }), 0); }, [loaded]);

  return (
    <div class="stack fade-in">
      <h1>Banners &amp; pulls</h1>
      <h2>Coming banners</h2>
      {s === "cn" ? <p class="muted">CN banners aren't previewed (CN is the server the others follow). Switch to EN, JP or KR to see what's coming from CN.</p> : (
        <Await state={st} what="upcoming banners">
          {([up, ops, usage]) => (
            <>
              <p class="note" role="note"><strong>Most of these dates are estimates.</strong> A date marked <span class="badge est">estimate</span> is CN's date plus the measured lag ({up.lag_days ?? "?"} days); servers skip and reorder banners. One marked <span class="badge wiki">dated by the wiki</span> comes from the Arknights Terra Wiki, one marked <span class="badge wiki">via Oldwell</span> from Oldwell (an announcement, or a dataminer's leak where it says so), and a date turns solid once this server's game data lists it.</p>
              <UpcomingBanners up={up} byId={new Map(ops.map((o) => [o.id, o]))} usage={usage} action={(b) => {
                const pulls = byThen(b.eta);
                return (
                  <div class="row" style={{ marginTop: "8px", justifyContent: "space-between" }}>
                    <small class="muted">About {pulls.toFixed(0)} pulls by then if you save everything{b.spark && pulls >= b.spark ? ", enough for the spark" : ""}</small>
                    <button class={`small${target?.id === b.id ? "" : " ghost"}`} aria-pressed={target?.id === b.id} onClick={() => plan(b)}>Plan for this</button>
                  </div>
                );
              }} />
            </>
          )}
        </Await>
      )}

      <section id="pull-planner" class="card" style={{ scrollMarginTop: "70px" }}>
        <h2>Pull planner</h2>
        <h3>Your savings</h3>
        <div class="row" style={{ alignItems: "flex-end" }}>
          <label class="field"><span>Orundum</span><input type="number" min={0} value={sv.orundum} style={{ width: "8em" }} onChange={(e) => set({ orundum: +(e.target as HTMLInputElement).value || 0 })} /></label>
          <label class="field"><span>Originite Prime</span><input type="number" min={0} value={sv.prime} onChange={(e) => set({ prime: +(e.target as HTMLInputElement).value || 0 })} /></label>
          <label class="field"><span>Headhunting Permits</span><input type="number" min={0} value={sv.permits} onChange={(e) => set({ permits: +(e.target as HTMLInputElement).value || 0 })} /></label>
          <label class="row tight"><input type="checkbox" checked={sv.card} onChange={(e) => set({ card: (e.target as HTMLInputElement).checked })} /> Monthly card running</label>
        </div>
        <p style={{ marginTop: "10px" }}>Now: <strong>{now(false).toFixed(1)} pulls</strong> <span class="muted">({now(true).toFixed(1)} counting Originite Prime at {ORUNDUM_PER_PRIME} Orundum each)</span></p>
        <p class="muted">Steady income ≈ {fmt(perDay)} Orundum a day ({(perDay * 30 / ORUNDUM_PER_PULL).toFixed(1)} pulls a month).</p>
        <OneTime />

        <h3>Saving for</h3>
        <div class="row" style={{ alignItems: "flex-end" }}>
          <label class="field"><span>Date</span><input type="date" value={by} onChange={(e) => setQuery({ by: (e.target as HTMLInputElement).value, for: (e.target as HTMLInputElement).value ? q.get("for") : "" })} /></label>
          {(by || target) && <button class="ghost small" onClick={() => setQuery({ by: "", for: "" })}>Clear</button>}
        </div>
        {target && <p class="muted">{KIND[target.kind] || target.kind} banner{target.name_en ? `: ${target.name_en}` : ""}{q.get("by") ? ` (expected ${date(target.eta)})` : ""}</p>}
        {by ? <Target by={by} pulls={byThen(by)} withPrime={byThen(by) - now(false) + now(true)} spark={target?.spark} reach={target?.spark ? sparkDay(target.spark - now(false), perDay) : undefined} />
          : <p class="muted">Pick a date, or press <strong>Plan for this</strong> on a banner above.</p>}
        <Explain>Steady sources only: daily missions 100/day, weekly missions 500 and Annihilation 1,800 per week, the monthly card 200/day while it runs. Events, stores and login rewards add more, unevenly, and aren't counted. Pulls by a date assume you save everything until then. Limited banners guarantee their operator at 300 pulls (spark). Saved in this browser.</Explain>
      </section>
    </div>
  );
}

/** One-time rewards your story progress says you haven't claimed: Annihilation milestones, and Originite Prime
 *  (which only counts towards pulls if you convert it). Shown only with story progress (synced or marked by hand). */
function OneTime() {
  const s = server.value;
  const p = account.value.progress;
  const st = useAsync(() => (p ? loadProgress(s) : Promise.resolve(null)), [s, !!p]);
  const data = st.data;
  if (!p || !data) return null;
  const ann = annihilationTotalLeft(data, p);
  const prime = opLeft(data, p);
  if (!ann && !prime.open) return null;
  return (
    <>
      <h3>One-time orundum still to claim</h3>
      {ann ? <p>Annihilation milestones: <strong>{fmt(ann)} Orundum</strong> ({(ann / ORUNDUM_PER_PULL).toFixed(1)} pulls)</p> : null}
      {prime.open > 0 && <p class="muted">If you convert Originite Prime: {fmt(prime.open)} still to claim from stages you can play now, worth {fmt(prime.open * ORUNDUM_PER_PRIME)} Orundum ({(prime.open * ORUNDUM_PER_PRIME / ORUNDUM_PER_PULL).toFixed(1)} pulls){prime.locked ? `, plus ${fmt(prime.locked)} in locked archives` : ""}.</p>}
      <p class="muted">From your last sync ({relative(p.at)}). <a href={href("/story")}>What's left, part by part</a></p>
    </>
  );
}

/** When steady income alone covers the pulls still missing for a spark (undefined when you have them already). */
function sparkDay(missing: number, perDay: number): number | undefined {
  return missing > 0 ? Date.now() + (missing * ORUNDUM_PER_PULL / perDay) * DAY : undefined;
}

function Target({ by, pulls, withPrime, spark, reach }: { by: string; pulls: number; withPrime: number; spark?: number; reach?: number }) {
  return (
    <>
      <p>{new Date(by).getTime() < Date.now() - DAY ? <>{date(by)} has passed; you have</> : <>By {date(by)} <span class="muted">({relative(by)})</span>:</>} <strong>about {pulls.toFixed(0)} pulls</strong> <span class="muted">({withPrime.toFixed(0)} with Originite Prime)</span></p>
      {spark && (pulls >= spark
        ? <p class="good-text">Enough for the {spark}-pull spark.</p>
        : <p class="warn-text">{Math.ceil(spark - pulls)} short of the {spark}-pull spark{reach ? `; steady income gets you there around ${date(reach)}` : ""}.</p>)}
    </>
  );
}
