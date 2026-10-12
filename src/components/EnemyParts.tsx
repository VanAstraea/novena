// Pieces the enemy list and the enemy page share.
import { useState } from "preact/hooks";
import { art } from "../lib/data";
import { IMMUNITIES } from "../lib/enemies";
import type { EnemyRow } from "../types";
import { metaSig } from "./ui";

/** The enemy's handbook icon from the art mirror; its handbook code when the mirror has none. */
export function EnemyIcon({ e, size = "" }: { e: Pick<EnemyRow, "id" | "code" | "level">; size?: "" | "sm" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const cls = `avatar enemy-icon ${size} ${e.level.toLowerCase()}`;
  if (failed) return <span class={cls} aria-hidden="true">{e.code}</span>;
  return <img key={e.id} class={cls} src={art.enemy(e.id)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

/** Immunities as badges, explained by the game's glossary on hover where it has an entry. */
export function ImmunityBadges({ imm, empty = "None" }: { imm: string[]; empty?: string }) {
  const terms = metaSig.value?.terms;
  const list = IMMUNITIES.filter((i) => imm.includes(i.id));
  if (!list.length) return <span class="muted">{empty}</span>;
  return (
    <span class="chips">
      {list.map((i) => <span key={i.id} class="badge immune" title={i.term && terms?.[i.term] ? terms[i.term].desc.replace(/<[^>]+>/g, "") : undefined}>{i.name}</span>)}
    </span>
  );
}
