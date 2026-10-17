// Story & archives: what the main story, the Side Story and Intermezzo archives and Annihilation pay out once, and the
// free operators with where to get each one now. Read from the game's tables; with story progress from a sync (Novena
// Sync with the option on, or a game sync data file) or marked by hand here (?edit=1), each part also shows what's
// left for you.
import type { ComponentChildren } from "preact";
import { useMemo } from "preact/hooks";
import { Await, Explain, OpLink, Stars, Tabs, useAsync } from "../components/ui";
import { operators, progress as loadProgress } from "../lib/data";
import { CLASS_NAMES, date, fmt, relative } from "../lib/format";
import { href, route, setQuery } from "../lib/router";
import { annihilationLeft, annihilationTotalLeft, archiveLeft, blankProgress, crystalsNow, groupState, opLeft, tally, unlockNext, weekFee, withAnnihilation, withArchive, withCrystals, withGroup, withUnlocked, type ArchiveLeft, type GroupState, type Tally } from "../lib/storyLeft";
import { undoable } from "../components/Toast";
import { account, hasRoster, saveAccount, server, type StoryProgress } from "../state";
import type { OpIndex, ProgressFile, Retro, WelfareSource } from "../types";

type View = "free" | "main" | "archives" | "annihilation";

const STORY = 4, CHALLENGE = 2, CHAR = 8; // stage flags (see ProgressStage)
const MAX_POT = 6;
const REWARD: Record<string, string> = { VOUCHER_FULL_POTENTIAL: "full potential", UNI_COLLECTION: "furniture set", FURN: "furniture", PLAYER_AVATAR: "avatar" };

export default function Story() {
  const s = server.value;
  const st = useAsync(() => Promise.all([loadProgress(s), operators(s)]), [s]);
  const view = (route.value.query.get("view") || "free") as View;
  const editing = route.value.query.get("edit") === "1";
  const saved = account.value.progress;
  // while marking by hand, a blank record stands in until the first change is saved
  const p = editing ? (saved ? { ...saved, annihilation: saved.annihilation ?? {} } : blankProgress()) : saved;
  return (
    <div class="stack fade-in story">
      <h1>Story &amp; archives</h1>
      <p class="muted" style={{ marginTop: "-6px" }}>What the main story, the Side Story and Intermezzo archives and Annihilation pay out once, and every free operator with where to get them now.</p>
      <Await state={st} what="story data">
        {([data, ops]) => {
          if (!data) return <div class="card"><p>This page's data arrives with the next daily update. Check back tomorrow.</p></div>;
          const byId = new Map(ops.map((o) => [o.id, o]));
          return (
            <>
              <Summary data={data} p={p} byId={byId} />
              {editing ? <EditBar data={data} p={p!} /> : saved && <p class="muted">
                {saved.manual ? "Your progress as you marked it." : `Progress from your last sync (${relative(saved.at)}).`} <button class="linkish" onClick={() => setQuery({ edit: "1" })}>Change it by hand</button></p>}
              <Tabs label="Story sections" value={view} onChange={(v) => setQuery({ view: v === "free" ? "" : v })} tabs={[
                { key: "free", label: "Free operators" }, { key: "main", label: "Main story" },
                { key: "archives", label: "Side Stories & Intermezzi" }, { key: "annihilation", label: "Annihilation" },
              ]} />
              {view === "free" && <Welfare data={data} ops={ops} byId={byId} p={p} />}
              {view === "main" && <Main data={data} byId={byId} p={p} editing={editing} />}
              {view === "archives" && <Archives data={data} byId={byId} p={p} editing={editing} />}
              {view === "annihilation" && <Annihilation data={data} p={p} editing={editing} />}
              <Explain>
                Each part's rewards are read from the game's own tables (via ArknightsGamedata, see Credits) once a day. Originite Prime comes once per stage, on its first 3★ clear;
                challenge modes count separately. An archive's trial (Record Restoration) counts 3 stars for each of its stages at 3★ and 1 for each challenge mode; story stages count for nothing.
                "Yours" compares with the roster saved in this browser{saved ? <>, and "left for you" with {saved.manual ? "the progress you marked" : `the story progress from your last sync (${relative(saved.at)})`}, which stays in this browser too</> : null}.
                Marking by hand works a whole episode, supply group or archive at a time; finishing an archive counts its trial rewards as claimed. A sync with story progress replaces what you marked.
              </Explain>
            </>
          );
        }}
      </Await>
    </div>
  );
}

/** "3 of 5" for a tally of combat stages, with 3★ and Originite Prime still to claim. */
function Cleared({ t }: { t: Tally }) {
  return (
    <span>{t.cleared} of {t.combat} cleared · {t.three} at 3★<br />
      {t.opLeft ? <small class="warn-text">{t.opLeft} Originite Prime left</small> : <small class="good-text">All Originite Prime claimed</small>}</span>
  );
}

function Summary({ data, p, byId }: { data: ProgressFile; p?: StoryProgress; byId: Map<string, OpIndex> }) {
  const s = server.value;
  const main = data.zones.filter((z) => z.kind === "main");
  const supply = data.zones.filter((z) => z.kind === "supply");
  const archiveOp = data.retros.reduce((t, r) => t + r.op, 0);
  const orundum = data.annihilation.reduce((t, a) => t + a.orundum, 0);
  const sides = data.retros.filter((r) => r.kind === "side").length;
  const cap = data.crystal?.cap || {};
  const caps = Object.entries(cap).sort((a, b) => +a[0] - +b[0]);
  const left = p ? opLeft(data, p) : null;
  const ann = p ? annihilationTotalLeft(data, p) : null;
  const fee = p ? weekFee(p, s) : null;
  const tiles: [string, string, string, string?][] = [
    ["Main story", fmt(main.reduce((t, z) => t + z.op, 0)), `Originite Prime over ${main.length} episodes`, left ? `${fmt(left.main)} left for you` : undefined],
    ["Supply stages", fmt(supply.reduce((t, z) => t + z.op, 0)), "Originite Prime", left ? `${fmt(left.supply)} left for you` : undefined],
    ["Archives", fmt(archiveOp), `Originite Prime in ${sides} Side Stories and ${data.retros.length - sides} Intermezzi`,
      left ? `${fmt(left.archives)} left in archives you've unlocked${left.locked ? `, ${fmt(left.locked)} in locked ones` : ""}` : undefined],
    ["Annihilation", fmt(orundum), `orundum over ${data.annihilation.filter((a) => a.orundum).length} maps`, ann !== null ? `${fmt(ann)} left for you` : undefined],
  ];
  if (left) tiles.unshift(["Left for you", fmt(left.open), `Originite Prime you can claim now${left.locked ? `, plus ${fmt(left.locked)} in locked archives` : ""}`]);
  if (fee) tiles.push(["This week", `${fmt(fee.got)} / ${fmt(fee.cap)}`, "Annihilation orundum so far", fee.left ? `${fmt(fee.left)} still to earn` : "Done for this week"]);
  return (
    <>
      <div class="tiles6">
        {tiles.map(([k, v, d, mine]) => (
          <div key={k} class="stat"><div class="k">{k}</div><div class="v">{v}</div><div class="d">{d}</div>{mine && <div class="d story-left">{mine}</div>}</div>
        ))}
      </div>
      {data.crystal && caps.length > 0 && (
        <p class="note">Unlocking an archive costs {data.crystal.unlockCost} Event Crystal. Every Monday your crystals top up to {caps[0][1]}
          {caps.slice(1).map(([lv, n]) => <> ({n} from player level {lv})</>)}, which is also as many as the top-up lets you hold.</p>
      )}
      {p ? <UnlockNext data={data} p={p} byId={byId} />
        : route.value.query.get("edit") !== "1" && <p class="muted">To see what's left for you, <button class="linkish" onClick={() => setQuery({ edit: "1" })}>mark what you've done</button> (a few clicks: an episode or archive at a time), sync with <a href={href("/guide", { m: "sync" })}>Novena Sync</a> with <em>Include story, event and archive progress</em> turned on, or import a <a href={href("/guide", { m: "file" })}>game sync data file</a>.</p>}
    </>
  );
}

/** Which locked archives to spend your Event Crystals on. */
function UnlockNext({ data, p, byId }: { data: ProgressFile; p: StoryProgress; byId: Map<string, OpIndex> }) {
  const picks = unlockNext(data, p, account.value.ops);
  const coins = crystalsNow(p, data, server.value);
  if (!picks.length || coins === null) return null;
  const shown = picks.slice(0, Math.max(3, coins));
  const name = (c: string) => byId.get(c)?.name || c;
  return (
    <section class="card">
      <h2>{coins ? `Unlock next with your ${coins} Event Crystal${coins === 1 ? "" : "s"}` : "Unlock next, when you have Event Crystals"}</h2>
      {!coins && <p class="muted">You have none right now; Monday's top-up brings more.</p>}
      <ol class="story-picks">
        {shown.map((x, i) => (
          <li key={x.r.id} class={i < coins ? "" : "muted"}>
            <strong>{x.r.name}</strong>{" "}
            {x.why === "missing" ? <>gives {x.chars.map(name).join(" and ")}, not in your roster</>
              : x.why === "potential" ? <>full potential for {x.chars.map(name).join(" and ")} (potential {x.chars.map((c) => account.value.ops[c]?.pot).join(", ")} now)</>
              : <>the most Originite Prime of the rest</>}
            {x.opLeft > 0 && <span class="muted"> · {x.opLeft} Originite Prime</span>}
          </li>
        ))}
      </ol>
      {picks.length > shown.length && <p class="muted">{picks.length - shown.length} more locked archives still hold something for you.</p>}
    </section>
  );
}

// --- free operators -----------------------------------------------------------------------------------------------

interface Way { text: ComponentChildren; now: boolean; soon: boolean; sort: number; claim?: boolean }

/** Where an operator comes from, and whether that's open now (`soon`: an announced event or trial). With story
 *  progress, an archive trial also says how far you are and whether the operator is waiting to be claimed. */
function ways(cid: string, sources: WelfareSource[], retros: Map<string, Retro>, now: number, left: (r: Retro) => ArchiveLeft | null): Way[] {
  const out: Way[] = [];
  for (const src of sources) {
    if (src.kind === "retro") {
      const r = retros.get(src.id);
      if (!r) continue;
      const open = new Date(r.start).getTime() <= now;
      if (src.stars === null || !r.trail) {
        out.push({ text: <>Archive: {r.name} has no trial yet</>, now: false, soon: false, sort: 4 });
        continue;
      }
      const trialOpen = open && new Date(r.trail.start).getTime() <= now;
      const full = r.trail.rewards.find(([, , type]) => type === "VOUCHER_FULL_POTENTIAL");
      const mine = left(r);
      const reward = r.trail.rewards.find(([, , type, item]) => type === "CHAR" && item === cid);
      const claim = !!(mine && reward && mine.claimable.includes(reward));
      const fullClaim = !!(mine && full && mine.claimable.includes(full));
      out.push({
        text: <>Archive: {r.name} trial, {src.stars}★{full && <span class="muted"> (full potential at {full[1]}★)</span>}{!trialOpen && <span class="muted"> · opens {date(r.trail.start)}</span>}
          {mine && (claim ? <strong class="good-text"> · claimable now ({mine.stars}★)</strong>
            : mine.claimed.has(reward?.[0] || "") ? <span class="muted"> · claimed{fullClaim ? <strong class="good-text">; full potential claimable now</strong> : null}</span>
            : mine.open === false ? <span class="muted"> · archive locked{mine.reached.includes(reward!) ? `: unlock it to claim (${mine.stars}★)` : ""}</span>
            : <span class="muted"> · you have {mine.stars}★</span>)}</>,
        now: trialOpen, soon: !trialOpen, sort: claim ? -1 : 1, claim,
      });
    } else if (src.kind === "event") {
      const start = new Date(src.start).getTime(), end = new Date(src.end).getTime();
      if (start <= now && now < end) out.push({ text: <>Event: {src.name}, missions, until {date(src.end)}</>, now: true, soon: false, sort: 0 });
      else if (start > now) out.push({ text: <>Event: {src.name}, missions, from {date(src.start)}</>, now: false, soon: true, sort: 2 });
      else out.push({ text: <span class="muted">Last came with {src.name} ({date(src.end)})</span>, now: false, soon: false, sort: 5 });
    } else if (src.kind === "shop") {
      const start = new Date(src.start).getTime(), end = new Date(src.end).getTime();
      if (start <= now && now < end) out.push({ text: <>Event shop: {src.name}, until {date(src.end)}</>, now: true, soon: false, sort: 0 });
      else if (start > now) out.push({ text: <>Event shop: {src.name}, from {date(src.start)}</>, now: false, soon: true, sort: 2 });
      else out.push({ text: <span class="muted">Came with an earlier event: sold in the {src.name} shop ({date(src.end)})</span>, now: false, soon: false, sort: 5 });
    } else if (src.kind === "record") {
      const ep = Number(src.zone.replace(/\D/g, ""));
      out.push({ text: <>Main story: Episode {ep} record {src.record} (unlocked by clearing its stage)</>, now: true, soon: false, sort: 3 });
    } else {
      const r = src.retro ? retros.get(src.retro) : undefined;
      if (src.retro && !r) continue;
      out.push({ text: r ? <>Archive: {r.name}, {src.code} (first clear)</> : <>Main story {src.code} (first clear)</>, now: true, soon: false, sort: 3 });
    }
  }
  return out.sort((a, b) => a.sort - b.sort);
}

function Welfare({ data, ops, byId, p }: { data: ProgressFile; ops: OpIndex[]; byId: Map<string, OpIndex>; p?: StoryProgress }) {
  const missingOnly = hasRoster.value && route.value.query.get("missing") === "1";
  const now = Date.now();
  const rows = useMemo(() => {
    const retros = new Map(data.retros.map((r) => [r.id, r]));
    const lefts = new Map<string, ArchiveLeft>();
    const left = (r: Retro) => {
      if (!p) return null;
      if (!lefts.has(r.id)) lefts.set(r.id, archiveLeft(r, p, now));
      return lefts.get(r.id)!;
    };
    // Event operators the tables list no way to get (event shops, older rewards) still belong here.
    const ids = [...Object.keys(data.welfare), ...ops.filter((o) => o.obtain === "event" && !data.welfare[o.id]).map((o) => o.id)];
    return ids.map((id) => byId.get(id)).filter((op): op is OpIndex => !!op && !op.src).map((op) => {
      const w = ways(op.id, data.welfare[op.id] || [], retros, now, left);
      const mine = account.value.ops[op.id];
      const open = w.some((x) => x.now), soon = w.some((x) => x.soon), claim = w.some((x) => x.claim);
      const rank = claim ? -1 : (mine ? 3 : 0) + (open ? 0 : soon ? 1 : 2);
      return { op, ways: w, mine, open, soon, claim, rank };
    }).sort((a, b) => a.rank - b.rank || b.op.rarity - a.op.rarity || a.op.name.localeCompare(b.op.name));
  }, [data, ops, byId, account.value.ops, p]);
  const shown = missingOnly ? rows.filter((r) => !r.mine) : rows;
  const open = rows.filter((r) => r.open).length;
  const missing = hasRoster.value ? rows.filter((r) => !r.mine && r.open).length : null;
  const claimable = rows.filter((r) => r.claim).length;
  return (
    <div class="stack">
      <p>{rows.length} free operators: from archive trials, event missions and shops, and story stages. {open} can be had right now{missing !== null && <>, <strong>{missing}</strong> of them not in your roster</>}.
        {claimable > 0 && <> <strong class="good-text">{claimable} {claimable === 1 ? "is" : "are"} waiting for you to claim</strong>: your trial stars already reach them.</>}</p>
      {hasRoster.value ? (
        <label class="row tight"><input type="checkbox" checked={missingOnly} onChange={(e) => setQuery({ missing: (e.target as HTMLInputElement).checked ? "1" : "" })} /> Missing only</label>
      ) : (
        <p class="muted">Import your roster under <a href={href("/roster")}>My roster</a> to see which of these you have.</p>
      )}
      <div class="table-wrap">
        <table class="cards">
          <thead><tr><th scope="col">Operator</th>{hasRoster.value && <th scope="col">Yours</th>}<th scope="col">Where to get them now</th></tr></thead>
          <tbody>
            {shown.map(({ op, ways: w, mine, open, soon }) => (
              <tr key={op.id}>
                <td data-label="Operator"><OpLink op={op} sub={<><Stars n={op.rarity} /> {CLASS_NAMES[op.cls]}</>} /></td>
                {hasRoster.value && (
                  <td data-label="Yours">
                    {mine ? <span class="good-text">Owned · potential {mine.pot}{mine.pot >= MAX_POT ? " (max)" : ""}</span> : <span class="warn-text">Not owned</span>}
                  </td>
                )}
                <td data-label="Where">
                  <ul class="story-ways">
                    {w.filter((x) => x.now || x.soon || !open).map((x, i) => <li key={i}>{x.text}</li>)}
                    {!w.length ? <li class="muted">Came with an earlier event (its shop or rewards); the game's tables list no way to get them now</li>
                      : !open && !soon && <li class="muted">Not available right now</li>}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!shown.length && <p class="muted">You have every one of them.</p>}
    </div>
  );
}

// --- main story -----------------------------------------------------------------------------------------------

/** Stage id -> the operators it gives on the first clear (from the free-operator list). */
function stageOps(data: ProgressFile): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [cid, srcs] of Object.entries(data.welfare)) {
    for (const s of srcs) if (s.kind === "stage" || s.kind === "record") out.set(s.stage, [...(out.get(s.stage) || []), cid]);
  }
  return out;
}

function Main({ data, byId, p, editing }: { data: ProgressFile; byId: Map<string, OpIndex>; p?: StoryProgress; editing: boolean }) {
  const gives = useMemo(() => stageOps(data), [data]);
  const zone = (kind: "main" | "supply") => data.zones.filter((z) => z.kind === kind);
  return (
    <div class="stack">
      <div class="table-wrap">
        <table class="cards">
          <thead><tr><th scope="col">Episode</th><th scope="col" class="num">Originite Prime</th><th scope="col" class="num">Challenge modes</th><th scope="col">Operators from stages</th>{p && <th scope="col">Left for you</th>}</tr></thead>
          <tbody>
            {zone("main").map((z) => {
              const chars = z.stages.filter(([, , f]) => f & CHAR).flatMap(([id, code]) => (gives.get(id) || []).map((c) => [c, code] as const));
              return (
                <tr key={z.id}>
                  <td data-label="Episode"><strong>{z.name}</strong>{z.title && <><br /><small class="muted">{z.title}</small></>}</td>
                  <td data-label="Originite Prime" class="num">{z.op}</td>
                  <td data-label="Challenge modes" class="num">{z.stages.filter(([, , f]) => f & CHALLENGE).length || "–"}</td>
                  <td data-label="Operators">
                    {chars.length ? <span class="story-ops">{chars.map(([c, code]) => byId.get(c) && <OpLink key={c} op={byId.get(c)!} sub={code} />)}</span> : <span class="muted">–</span>}
                  </td>
                  {p && <td data-label="Left for you"><Cleared t={tally(z.stages, p)} />{editing && <GroupPick label={z.name} value={groupState(z.stages, p)} challenges={z.stages.some(([, , f]) => f & CHALLENGE)} onChange={(v) => saveProgress(withGroup(z.stages, p, v))} />}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h3>Supply stages</h3>
      <div class="table-wrap">
        <table class="cards">
          <thead><tr><th scope="col">Stages</th><th scope="col" class="num">Originite Prime</th>{p && <th scope="col">Left for you</th>}</tr></thead>
          <tbody>
            {zone("supply").map((z) => (
              <tr key={z.id}>
                <td data-label="Stages">{z.name} <small class="muted">({z.stages.map(([, code]) => code).join(", ")})</small></td>
                <td data-label="Originite Prime" class="num">{z.op}</td>
                {p && <td data-label="Left for you"><Cleared t={tally(z.stages, p)} />{editing && <GroupPick label={z.name} value={groupState(z.stages, p)} challenges={false} onChange={(v) => saveProgress(withGroup(z.stages, p, v))} />}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- archives -------------------------------------------------------------------------------------------------

/** An archive as it stands for you: unlocked or not, stages cleared, trial stars and rewards waiting. */
function ArchiveMine({ r, mine, byId }: { r: Retro; mine: ArchiveLeft; byId: Map<string, OpIndex> }) {
  const label = ([, need, type, item]: [string, number, string, string]) => `${type === "CHAR" ? byId.get(item)?.name || "the operator" : REWARD[type] || "a reward"} (${need}★)`;
  const next = r.trail?.rewards.find(([id, need]) => need > mine.stars && !mine.claimed.has(id));
  return (
    <span>
      {mine.open === null ? null : mine.open ? <span class="good-text">Unlocked</span> : <span class="warn-text">Locked</span>}{mine.open !== null && " · "}
      {mine.tally.cleared} of {mine.tally.combat} cleared · {mine.tally.three} at 3★<br />
      {mine.tally.opLeft ? <small class="warn-text">{mine.tally.opLeft} Originite Prime left</small> : <small class="good-text">All Originite Prime claimed</small>}
      {r.trail && r.stars !== null && <><br /><small>Trial: {mine.stars} of {r.stars}★{next ? <span class="muted"> · next reward at {next[1]}★</span> : null}</small></>}
      {mine.claimable.length > 0 && <><br /><small class="good-text"><strong>Claim now:</strong> {mine.claimable.map(label).join(", ")}</small></>}
      {!mine.claimable.length && mine.reached.length > 0 && <><br /><small class="muted">{mine.open === false ? "Unlock it to claim" : "Claimable once the trial opens"}: {mine.reached.map(label).join(", ")}</small></>}
    </span>
  );
}

function Archives({ data, byId, p, editing }: { data: ProgressFile; byId: Map<string, OpIndex>; p?: StoryProgress; editing: boolean }) {
  const now = Date.now();
  return (
    <div class="table-wrap">
      <table class="cards">
        <thead><tr><th scope="col">Archive</th><th scope="col" class="num">Stages</th><th scope="col" class="num">Originite Prime</th><th scope="col">Trial</th>{p && <th scope="col">Left for you</th>}</tr></thead>
        <tbody>
          {data.retros.map((r) => {
            const combat = r.stages.filter(([, , f]) => !(f & (STORY | CHALLENGE))).length;
            const char = r.char ? byId.get(r.char) : undefined;
            const mine = r.char ? account.value.ops[r.char] : undefined;
            const charReward = r.trail?.rewards.find(([, , type]) => type === "CHAR");
            const full = r.trail?.rewards.find(([, , type]) => type === "VOUCHER_FULL_POTENTIAL");
            const arrived = new Date(r.start).getTime() <= now;
            return (
              <tr key={r.id}>
                <td data-label="Archive"><strong>{r.name}</strong><br /><small class="muted">{r.kind === "side" ? "Side Story" : "Intermezzo"} {r.index}{arrived ? "" : ` · arrives ${date(r.start)}`}</small></td>
                <td data-label="Stages" class="num">{combat}</td>
                <td data-label="Originite Prime" class="num">{r.op}</td>
                <td data-label="Trial">
                  {r.trail ? (
                    <span>Up to {r.stars}★{new Date(r.trail.start).getTime() > now && <span class="muted"> · opens {date(r.trail.start)}</span>}
                      {charReward && char && <><br /><span class="story-ops"><OpLink op={char} sub={`at ${charReward[1]}★${full ? `, full potential at ${full[1]}★` : ""}`} /></span></>}
                      {!charReward && full && <><br /><small>Full potential at {full[1]}★</small></>}
                    </span>
                  ) : (
                    <span class="muted">No trial yet{char ? <> (its operator: {char.name})</> : null}</span>
                  )}
                  {hasRoster.value && char && <><br /><small class={mine ? "good-text" : "warn-text"}>{mine ? `${char.name}: yours, potential ${mine.pot}` : `${char.name}: not owned`}</small></>}
                </td>
                {p && <td data-label="Left for you">{arrived ? <>
                  <ArchiveMine r={r} mine={archiveLeft(r, p, now)} byId={byId} />
                  {editing && <div class="story-edit">
                    <label class="row tight"><input type="checkbox" checked={!!p.open?.includes(r.id)} onChange={(e) => saveProgress(withUnlocked(r, p, (e.target as HTMLInputElement).checked))} /> Unlocked</label>
                    <GroupPick label={r.name} value={groupState(r.stages, p)} challenges={r.stages.some(([, , f]) => f & CHALLENGE)} onChange={(v) => saveProgress(withArchive(r, p, v))} />
                  </div>}
                </> : <span class="muted">–</span>}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- annihilation ---------------------------------------------------------------------------------------------

function Annihilation({ data, p, editing }: { data: ProgressFile; p?: StoryProgress; editing: boolean }) {
  const now = Date.now();
  const maps = data.annihilation.filter((a) => a.orundum > 0);
  const total = p ? annihilationTotalLeft(data, p) : null;
  const fee = p ? weekFee(p, server.value, now) : null;
  return (
    <div class="stack">
      <p>Each map's kill milestones pay orundum once. {fmt(maps.reduce((t, a) => t + a.orundum, 0))} in all; the weekly orundum from Annihilation comes on top.
        {total !== null && <> <strong>{fmt(total)} of it is still yours to earn.</strong></>}</p>
      {fee && <p>This week: {fmt(fee.got)} of {fmt(fee.cap)} weekly orundum earned{fee.left ? `, ${fmt(fee.left)} to go` : ", done until Monday's reset"}.</p>}
      <div class="table-wrap">
        <table class="cards">
          <thead><tr><th scope="col">Map</th><th scope="col">Region</th><th scope="col" class="num">One-time orundum</th>{total !== null && <th scope="col" class="num">Left for you</th>}<th scope="col">Rotation</th></tr></thead>
          <tbody>
            {maps.map((a) => {
              const on = a.rotation && new Date(a.rotation[0]).getTime() <= now && now < new Date(a.rotation[1]).getTime();
              const left = p ? annihilationLeft(a, p) : null;
              const kills = p?.annihilation?.[a.id]?.kills;
              return (
                <tr key={a.id}>
                  <td data-label="Map">{a.name}</td>
                  <td data-label="Region">{a.region || "–"}</td>
                  <td data-label="One-time orundum" class="num">{fmt(a.orundum)}</td>
                  {total !== null && <td data-label="Left for you" class="num">{left ? <span class="warn-text">{fmt(left)}</span> : <span class="good-text">Done</span>}{kills && !editing ? <><br /><small class="muted">best {kills} kills</small></> : null}
                    {editing && p && <label class="row tight story-edit" style={{ justifyContent: "flex-end" }}><input type="checkbox" checked={!left} onChange={(e) => saveProgress(withAnnihilation(a, p, (e.target as HTMLInputElement).checked))} /> All earned</label>}</td>}
                  <td data-label="Rotation">{on ? <span class="good-text">Now, until {date(a.rotation![1])}</span> : <span class="muted">–</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- marking progress by hand ---------------------------------------------------------------------------------

function saveProgress(p: StoryProgress) {
  saveAccount({ ...account.value, progress: { ...p, manual: true } });
}

const GROUP_LABELS: [GroupState, string][] = [[0, "Not played"], [1, "Cleared"], [2, "All at 3★"], [3, "All at 3★ and challenge modes"]];

/** How far you are in an episode, supply group or archive. */
function GroupPick({ label, value, challenges, onChange }: { label: string; value: GroupState; challenges: boolean; onChange: (v: 0 | 1 | 2 | 3) => void }) {
  return (
    <select class="story-pick" aria-label={`Your progress in ${label}`} value={String(value)} onChange={(e) => onChange(Number((e.target as HTMLSelectElement).value) as 0 | 1 | 2 | 3)}>
      {value === -1 && <option value="-1" disabled>Partly done</option>}
      {GROUP_LABELS.filter(([v]) => challenges || v !== 3).map(([v, l]) => <option key={v} value={String(v)}>{l}</option>)}
    </select>
  );
}

/** The bar above the tables while marking: what this does, a quick way to set the main story, Event Crystals, done. */
function EditBar({ data, p }: { data: ProgressFile; p: StoryProgress }) {
  const main = data.zones.filter((z) => z.kind === "main");
  const upTo = (n: number, three: boolean) => {
    const before = account.value.progress;
    let next = p;
    main.forEach((z, i) => { next = withGroup(z.stages, next, i <= n ? (three ? 2 : 1) : 0); });
    saveProgress(next);
    undoable(n < 0 ? "Main story marked as not started." : `Main story marked up to ${main[n].name}.`, () => saveAccount({ ...account.value, progress: before }));
  };
  const clear = () => {
    const before = account.value.progress;
    saveAccount({ ...account.value, progress: undefined });
    undoable("Cleared your story progress.", () => saveAccount({ ...account.value, progress: before }));
  };
  return (
    <section class="card story-editbar">
      <div class="card-head"><h2>Mark your progress</h2><button class="primary" onClick={() => setQuery({ edit: "" })}>Done</button></div>
      <p class="muted">Pick how far you are in each episode and supply group (Main story), each archive (Side Stories &amp; Intermezzi) and each Annihilation map; the "left for you" figures follow. Saved in this browser as you go.</p>
      <div class="row" style={{ alignItems: "flex-end" }}>
        <label class="field">
          <span>Main story: everything up to</span>
          <select value="" onChange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v) upTo(Number(v.slice(1)), v[0] === "3"); }}>
            <option value="">Choose…</option>
            <optgroup label="All at 3★">{main.map((z, i) => <option key={z.id} value={`3${i}`}>{z.name}</option>)}</optgroup>
            <optgroup label="Cleared">{main.map((z, i) => <option key={z.id} value={`c${i}`}>{z.name}</option>)}</optgroup>
            <option value="c-1">Not started</option>
          </select>
        </label>
        {data.crystal && (
          <label class="field">
            <span>Event Crystals you have</span>
            <input type="number" min={0} max={99} value={p.coin ?? ""} placeholder="0" onChange={(e) => saveProgress(withCrystals(p, Number((e.target as HTMLInputElement).value) || 0))} />
          </label>
        )}
        {account.value.progress && <button class="ghost" onClick={clear}>Clear my progress</button>}
      </div>
      {account.value.progress && !account.value.progress.manual && <p class="muted">You're changing the progress from your last sync. The next sync with story progress replaces it.</p>}
    </section>
  );
}
