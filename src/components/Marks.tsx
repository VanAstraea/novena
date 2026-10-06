// A build drawn with the game's own icons: the elite badge, the mastery triangle per skill and each module's type
// icon with its stage as pips (hover or tap a module for what it does). Shared by the roster, plans, rankings and
// anywhere else a build is shown.
import { art } from "../lib/data";
import type { OpState } from "../lib/costs";
import type { OpIndex } from "../types";
import { moduleInfoProps } from "./ModuleInfo";

/** The game's mastery triangle for one skill; dim when not mastered. */
export function MasteryMark({ m, i, size = 24 }: { m: number; i: number; size?: number }) {
  return (
    <span class={`mark${m ? "" : " off"}`} title={`Skill ${i + 1}: ${m ? `Mastery ${m}` : "no mastery"}`}>
      <img class="gicon" src={art.mastery(m)} alt={`S${i + 1} M${m}`} width={size} height={Math.round(size * 0.9)} loading="lazy" /><small>S{i + 1}</small>
    </span>
  );
}

/** A module's type icon with its stage as three pips; dim when not unlocked. Given the operator, it's a button that
 *  shows what the module does (ModuleInfo), stressing stage `hl` (the stage shown, unless said otherwise). Pass
 *  `info={false}` where the mark sits inside another button. */
export function ModuleMark({ op, k, stage, size = 24, hl = stage, info = true }: { op?: OpIndex; k: string; stage: number; size?: number; hl?: number; info?: boolean }) {
  const type = op?.modTypes?.[op.mods.indexOf(k)];
  const label = `Module ${k}: ${stage ? `stage ${stage}` : "not unlocked"}`;
  const body = (
    <>
      {type ? <img class="gicon" src={art.moduleType(type)} alt={`Module ${k}`} width={size} height={size} loading="lazy" /> : <b class="mod-letter">{k}</b>}
      <span class="pips" aria-hidden="true">{[1, 2, 3].map((n) => <i key={n} class={n <= stage ? "on" : ""} />)}</span>
    </>
  );
  if (!op || !info) return <span class={`mark${stage ? "" : " off"}`} title={label}>{body}</span>;
  return <button type="button" class={`mark mark-info${stage ? "" : " off"}`} aria-label={`${label}. What it does`} {...moduleInfoProps(op.id, k, hl)}>{body}</button>;
}

/** Elite badge and level. */
export function EliteMark({ elite, level, size = 22 }: { elite: number; level?: number; size?: number }) {
  return (
    <span class="elite-mark" title={`Elite ${elite}${level ? `, level ${level}` : ""}`}>
      <img class="gicon" src={art.elite(elite)} alt={`E${elite}`} width={size} height={size} loading="lazy" />{level ? <span>Lv {level}</span> : null}
    </span>
  );
}

/** A whole build, compactly: elite and level, then only the masteries and modules that are raised. `skillLevel`
 *  shows when nothing is mastered. Pass `only` to show just what differs from another state (a step in a plan). */
export function BuildMarks({ s, op, from }: { s: OpState; op?: OpIndex; from?: OpState }) {
  const changed = (k: "elite" | "level" | "skillLevel") => !from || s[k] !== from[k];
  const ms = s.masteries.map((m, i) => ({ m, i })).filter(({ m, i }) => m && (!from || m !== from.masteries[i]));
  const mods = Object.entries(s.modules).filter(([k, v]) => v && (!from || v !== (from.modules[k] || 0)));
  const showElite = !from || changed("elite") || changed("level");
  return (
    <span class="build-marks">
      {showElite && <EliteMark elite={s.elite} level={s.level} />}
      {(!from ? !ms.length : changed("skillLevel") && !ms.length) && s.skillLevel > 1 && <span class="sl">SL{s.skillLevel}</span>}
      {ms.map(({ m, i }) => <MasteryMark key={`m${i}`} m={m} i={i} size={20} />)}
      {mods.map(([k, v]) => <ModuleMark key={k} op={op} k={k} stage={v} size={20} />)}
    </span>
  );
}

/** A community build (most common promotion, skill, mastery and module), drawn the same way. */
export function CommunityMarks({ b, op }: { b: { elite?: number; skill?: number; mastery?: number; module?: string; moduleStage?: number }; op?: OpIndex }) {
  if (!b.elite && !b.skill && !b.module) return <span class="muted">–</span>;
  return (
    <span class="build-marks">
      {b.elite ? <EliteMark elite={b.elite} /> : null}
      {b.skill ? (b.mastery ? <MasteryMark m={b.mastery} i={b.skill - 1} size={20} /> : <span class="sl">S{b.skill}</span>) : null}
      {b.module ? <ModuleMark op={op} k={b.module} stage={b.moduleStage || 1} size={20} /> : null}
    </span>
  );
}
