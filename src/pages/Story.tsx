// Story & events: what the main story, the Side Story and Intermezzo archives and Annihilation pay out once, and the
// free operators with where to get each one now. Read from the game's tables; it doesn't see what you've cleared.
import type { ComponentChildren } from "preact";
import { useMemo } from "preact/hooks";
import { Await, Explain, OpLink, Stars, Tabs, useAsync } from "../components/ui";
import { operators, progress as loadProgress } from "../lib/data";
import { CLASS_NAMES, date, fmt } from "../lib/format";
import { href, route, setQuery } from "../lib/router";
import { account, hasRoster, server } from "../state";
import type { OpIndex, ProgressFile, Retro, WelfareSource } from "../types";

type View = "free" | "main" | "archives" | "annihilation";

const STORY = 4, CHALLENGE = 2, CHAR = 8; // stage flags (see ProgressStage)
const MAX_POT = 6;

export default function Story() {
  const s = server.value;
  const st = useAsync(() => Promise.all([loadProgress(s), operators(s)]), [s]);
  const view = (route.value.query.get("view") || "free") as View;
  return (
    <div class="stack fade-in story">
      <h1>Story &amp; events</h1>
      <p class="muted" style={{ marginTop: "-6px" }}>What the main story, the Side Story and Intermezzo archives and Annihilation pay out once, and every free operator with where to get them now.</p>
      <Await state={st} what="story data">
        {([data, ops]) => {
          if (!data) return <div class="card"><p>This page's data arrives with the next daily update. Check back tomorrow.</p></div>;
          const byId = new Map(ops.map((o) => [o.id, o]));
          return (
            <>
              <Summary data={data} />
              <Tabs label="Story sections" value={view} onChange={(v) => setQuery({ view: v === "free" ? "" : v })} tabs={[
                { key: "free", label: "Free operators" }, { key: "main", label: "Main story" },
                { key: "archives", label: "Side Stories & Intermezzi" }, { key: "annihilation", label: "Annihilation" },
              ]} />
              {view === "free" && <Welfare data={data} ops={ops} byId={byId} />}
              {view === "main" && <Main data={data} byId={byId} />}
              {view === "archives" && <Archives data={data} byId={byId} />}
              {view === "annihilation" && <Annihilation data={data} />}
              <Explain>
                Novena doesn't see your game: this page lists what each part holds, read from the game's own tables (via ArknightsGamedata, see Credits) once a day. Originite Prime comes once per stage, on its first 3★ clear;
                challenge modes count separately. An archive's trial (Record Restoration) counts 3 stars for each of its stages at 3★ and 1 for each challenge mode; story stages count for nothing.
                "Yours" compares with the roster saved in this browser. A later Novena Sync update can show what's left for you.
              </Explain>
            </>
          );
        }}
      </Await>
    </div>
  );
}

function Summary({ data }: { data: ProgressFile }) {
  const main = data.zones.filter((z) => z.kind === "main");
  const supply = data.zones.filter((z) => z.kind === "supply");
  const archiveOp = data.retros.reduce((t, r) => t + r.op, 0);
  const orundum = data.annihilation.reduce((t, a) => t + a.orundum, 0);
  const sides = data.retros.filter((r) => r.kind === "side").length;
  const cap = data.crystal?.cap || {};
  const caps = Object.entries(cap).sort((a, b) => +a[0] - +b[0]);
  const tiles: [string, number, string][] = [
    ["Main story", main.reduce((t, z) => t + z.op, 0), `Originite Prime over ${main.length} episodes`],
    ["Supply stages", supply.reduce((t, z) => t + z.op, 0), "Originite Prime"],
    ["Archives", archiveOp, `Originite Prime in ${sides} Side Stories and ${data.retros.length - sides} Intermezzi`],
    ["Annihilation", orundum, `orundum over ${data.annihilation.filter((a) => a.orundum).length} maps`],
  ];
  return (
    <>
      <div class="tiles6">
        {tiles.map(([k, v, d]) => <div key={k} class="stat"><div class="k">{k}</div><div class="v">{fmt(v)}</div><div class="d">{d}</div></div>)}
      </div>
      {data.crystal && caps.length > 0 && (
        <p class="note">Unlocking an archive costs {data.crystal.unlockCost} Event Crystal. Every Monday your crystals top up to {caps[0][1]}
          {caps.slice(1).map(([lv, n]) => <> ({n} from player level {lv})</>)}, which is also as many as the top-up lets you hold.</p>
      )}
    </>
  );
}

// --- free operators -----------------------------------------------------------------------------------------------

interface Way { text: ComponentChildren; now: boolean; soon: boolean; sort: number }

/** Where an operator comes from, and whether that's open now (`soon`: an announced event or trial). */
function ways(sources: WelfareSource[], retros: Map<string, Retro>, now: number): Way[] {
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
      out.push({
        text: <>Archive: {r.name} trial, {src.stars}★{full && <span class="muted"> (full potential at {full[1]}★)</span>}{!trialOpen && <span class="muted"> · opens {date(r.trail.start)}</span>}</>,
        now: trialOpen, soon: !trialOpen, sort: 1,
      });
    } else if (src.kind === "event") {
      const start = new Date(src.start).getTime(), end = new Date(src.end).getTime();
      if (start <= now && now < end) out.push({ text: <>Event: {src.name}, missions, until {date(src.end)}</>, now: true, soon: false, sort: 0 });
      else if (start > now) out.push({ text: <>Event: {src.name}, missions, from {date(src.start)}</>, now: false, soon: true, sort: 2 });
      else out.push({ text: <span class="muted">Last came with {src.name} ({date(src.end)})</span>, now: false, soon: false, sort: 5 });
    } else {
      const r = src.retro ? retros.get(src.retro) : undefined;
      if (src.retro && !r) continue;
      out.push({ text: r ? <>Archive: {r.name}, {src.code} (first clear)</> : <>Main story {src.code} (first clear)</>, now: true, soon: false, sort: 3 });
    }
  }
  return out.sort((a, b) => a.sort - b.sort);
}

function Welfare({ data, ops, byId }: { data: ProgressFile; ops: OpIndex[]; byId: Map<string, OpIndex> }) {
  const missingOnly = hasRoster.value && route.value.query.get("missing") === "1";
  const now = Date.now();
  const rows = useMemo(() => {
    const retros = new Map(data.retros.map((r) => [r.id, r]));
    // Event operators the tables list no way to get (event shops, older rewards) still belong here.
    const ids = [...Object.keys(data.welfare), ...ops.filter((o) => o.obtain === "event" && !data.welfare[o.id]).map((o) => o.id)];
    return ids.map((id) => byId.get(id)).filter((op): op is OpIndex => !!op && !op.src).map((op) => {
      const w = ways(data.welfare[op.id] || [], retros, now);
      const mine = account.value.ops[op.id];
      const open = w.some((x) => x.now), soon = w.some((x) => x.soon);
      const rank = (mine ? 3 : 0) + (open ? 0 : soon ? 1 : 2);
      return { op, ways: w, mine, open, soon, rank };
    }).sort((a, b) => a.rank - b.rank || b.op.rarity - a.op.rarity || a.op.name.localeCompare(b.op.name));
  }, [data, ops, byId, account.value.ops]);
  const shown = missingOnly ? rows.filter((r) => !r.mine) : rows;
  const open = rows.filter((r) => r.open).length;
  const missing = hasRoster.value ? rows.filter((r) => !r.mine && r.open).length : null;
  return (
    <div class="stack">
      <p>{rows.length} free operators: from archive trials, event missions and story stages. {open} can be had right now{missing !== null && <>, <strong>{missing}</strong> of them not in your roster</>}.</p>
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
    for (const s of srcs) if (s.kind === "stage") out.set(s.stage, [...(out.get(s.stage) || []), cid]);
  }
  return out;
}

function Main({ data, byId }: { data: ProgressFile; byId: Map<string, OpIndex> }) {
  const gives = useMemo(() => stageOps(data), [data]);
  const zone = (kind: "main" | "supply") => data.zones.filter((z) => z.kind === kind);
  return (
    <div class="stack">
      <div class="table-wrap">
        <table class="cards">
          <thead><tr><th scope="col">Episode</th><th scope="col" class="num">Originite Prime</th><th scope="col" class="num">Challenge modes</th><th scope="col">Operators from stages</th></tr></thead>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h3>Supply stages</h3>
      <div class="table-wrap">
        <table class="cards">
          <thead><tr><th scope="col">Stages</th><th scope="col" class="num">Originite Prime</th></tr></thead>
          <tbody>
            {zone("supply").map((z) => (
              <tr key={z.id}><td data-label="Stages">{z.name} <small class="muted">({z.stages.map(([, code]) => code).join(", ")})</small></td><td data-label="Originite Prime" class="num">{z.op}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- archives -------------------------------------------------------------------------------------------------

function Archives({ data, byId }: { data: ProgressFile; byId: Map<string, OpIndex> }) {
  const now = Date.now();
  return (
    <div class="table-wrap">
      <table class="cards">
        <thead><tr><th scope="col">Archive</th><th scope="col" class="num">Stages</th><th scope="col" class="num">Originite Prime</th><th scope="col">Trial</th></tr></thead>
        <tbody>
          {data.retros.map((r) => {
            const combat = r.stages.filter(([, , f]) => !(f & (STORY | CHALLENGE))).length;
            const char = r.char ? byId.get(r.char) : undefined;
            const mine = r.char ? account.value.ops[r.char] : undefined;
            const charReward = r.trail?.rewards.find(([, , type]) => type === "CHAR");
            const full = r.trail?.rewards.find(([, , type]) => type === "VOUCHER_FULL_POTENTIAL");
            return (
              <tr key={r.id}>
                <td data-label="Archive"><strong>{r.name}</strong><br /><small class="muted">{r.kind === "side" ? "Side Story" : "Intermezzo"} {r.index}{new Date(r.start).getTime() > now ? ` · arrives ${date(r.start)}` : ""}</small></td>
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- annihilation ---------------------------------------------------------------------------------------------

function Annihilation({ data }: { data: ProgressFile }) {
  const now = Date.now();
  const maps = data.annihilation.filter((a) => a.orundum > 0);
  return (
    <div class="stack">
      <p>Each map's kill milestones pay orundum once. {fmt(maps.reduce((t, a) => t + a.orundum, 0))} in all; the weekly orundum from Annihilation comes on top.</p>
      <div class="table-wrap">
        <table class="cards">
          <thead><tr><th scope="col">Map</th><th scope="col">Region</th><th scope="col" class="num">One-time orundum</th><th scope="col">Rotation</th></tr></thead>
          <tbody>
            {maps.map((a) => {
              const on = a.rotation && new Date(a.rotation[0]).getTime() <= now && now < new Date(a.rotation[1]).getTime();
              return (
                <tr key={a.id}>
                  <td data-label="Map">{a.name}</td>
                  <td data-label="Region">{a.region || "–"}</td>
                  <td data-label="One-time orundum" class="num">{fmt(a.orundum)}</td>
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
