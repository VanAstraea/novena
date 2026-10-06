// Roles: the job an operator does in a team, read from its branch (archetype), so pages can group or filter operators
// by it (Upcoming's key operators, Rankings). One mapping for the whole site. A branch the game adds later falls back
// to its class's usual role until it's listed here (a unit test flags it).
import type { OpIndex } from "../types";

export const ROLES = ["damage", "healing", "defence", "dp", "control", "special"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_NAMES: Record<Role, string> = {
  damage: "Damage", healing: "Healing", defence: "Defence", dp: "DP & openers", control: "Control & support", special: "Special mechanics",
};

export const ROLE_HINTS: Record<Role, string> = {
  damage: "Guards, Snipers, Casters, Geeks and Fortress Defenders: the ones there to kill things",
  healing: "Medics, and the Supporters that heal or shield (Abjurers, Bards)",
  defence: "Defenders that hold a lane",
  dp: "Vanguards: the deployment points (DP) and early blockers a team opens with",
  control: "Supporters that slow, weaken, buff or summon",
  special: "Specialists: pushing, pulling, traps, fast redeploys and the other tricks a map can call for",
};

/** Each class's usual role, for a branch not listed below. */
const BY_CLASS: Record<string, Role> = {
  PIONEER: "dp", WARRIOR: "damage", TANK: "defence", SNIPER: "damage", CASTER: "damage", MEDIC: "healing", SUPPORT: "control", SPECIAL: "special",
};

/** Every branch, by class. */
export const BRANCH_ROLES: Record<string, Role> = {
  // Vanguards
  pioneer: "dp", charger: "dp", tactician: "dp", bearer: "dp", agent: "dp", counsellor: "dp",
  // Guards
  sword: "damage", lord: "damage", fighter: "damage", centurion: "damage", fearless: "damage", artsfghter: "damage", instructor: "damage",
  musha: "damage", reaper: "damage", librator: "damage", crusher: "damage", hammer: "damage", mercenary: "damage", primguard: "damage",
  // Defenders. Fortress: Horn, Ashlock and Firewhistle are there for their ranged splash damage.
  protector: "defence", guardian: "defence", artsprotector: "defence", unyield: "defence", duelist: "defence", shotprotector: "defence",
  primprotector: "defence", fortress: "damage",
  // Snipers
  fastshot: "damage", longrange: "damage", aoesniper: "damage", closerange: "damage", siegesniper: "damage", bombarder: "damage",
  reaperrange: "damage", hunter: "damage", loopshooter: "damage", skybreaker: "damage",
  // Casters
  corecaster: "damage", splashcaster: "damage", blastcaster: "damage", chain: "damage", mystic: "damage", phalanx: "damage", funnel: "damage",
  primcaster: "damage", soulcaster: "damage",
  // Medics
  physician: "healing", ringhealer: "healing", healer: "healing", wandermedic: "healing", incantationmedic: "healing", chainhealer: "healing",
  watchman: "healing",
  // Supporters. Abjurers heal and shield, Bards heal everyone in range.
  blessing: "healing", bard: "healing", slower: "control", underminer: "control", summoner: "control", craftsman: "control", ritualist: "control",
  supportiveranger: "control",
  // Specialists. Geeks trade their own HP for damage.
  pusher: "special", hookmaster: "special", traper: "special", merchant: "special", dollkeeper: "special", stalker: "special", skywalker: "special",
  executor: "special", alchemist: "special", geek: "damage",
};

/** The few operators whose job isn't their branch's; keep it short. */
export const ROLE_OVERRIDES: Record<string, Role> = {
  char_225_haak: "control", // Aak: a Geek taken for his attack-speed buffs
};

export function roleOf(op: Pick<OpIndex, "id" | "cls" | "branch">): Role {
  return ROLE_OVERRIDES[op.id] || BRANCH_ROLES[op.branch] || BY_CLASS[op.cls] || "special";
}

/** A role from the address (?role=healing), or "" for none or one it doesn't know. */
export function parseRole(v: string | null): Role | "" {
  return (ROLES as readonly string[]).includes(v || "") ? (v as Role) : "";
}
