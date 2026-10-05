// Shapes of the published data files (pipeline/novena_pipeline/build.py documents the layout).

export type Server = "en" | "jp" | "kr" | "cn";
export type ItemList = [string, number][];
export type Stats = Partial<Record<StatKey, number>>;
export type StatKey = "hp" | "atk" | "def" | "res" | "cost" | "block" | "interval" | "respawn" | "aspd";

export interface OpIndex {
  id: string;
  name: string;
  rarity: number;
  cls: string;
  branch: string;
  pos: "MELEE" | "RANGED" | string;
  tags: string[];
  factions: string[];
  obtain: string;
  recruit: boolean;
  on: Server[];
  mods: string[];
  modIds: string[];
  src?: Server;
  cn?: string;
  alt?: string;
  g?: "m" | "f";
  alters?: string[];
  patch?: boolean;
}

export interface Phase {
  max: number;
  range: string | null;
  lo: Stats;
  hi: Stats;
  cost: ItemList;
  lmd: number;
}

export interface TalentCand {
  name: string;
  elite: number;
  level: number;
  pot: number;
  desc: string;
  range?: string;
}

export interface SkillLevel {
  desc: string;
  sp: number;
  init: number;
  dur: number;
  range?: string;
}

export interface Skill {
  id: string;
  icon: string;
  name: string;
  sp: "auto" | "offensive" | "defensive" | "passive";
  type: string;
  ammo: boolean;
  levels: SkillLevel[];
  mastery: { cost: ItemList; hours: number }[];
}

export interface ModuleStage {
  attrs: Stats;
  trait: string[];
  talents: { name: string; desc: string }[];
}

export interface Module {
  id: string;
  name: string;
  letter: string;
  icon: string; // "GUA-X"
  type: string; // "gua-x", the type icon's file name
  img: string; // the module's picture
  unlock: { elite: number; level: number };
  stages: ModuleStage[];
  cost: ItemList[];
}

export interface RiicSkill {
  name: string;
  desc: string;
  room: string;
  icon: string;
  elite: number;
  level: number;
}

export interface OpDetail {
  id: string;
  src: Server;
  desc: string;
  trait: { elite: number; pot: number; desc: string }[] | null;
  phases: Phase[];
  trust: Stats;
  pots: { desc: string; mods: Stats }[];
  talents: TalentCand[][];
  skills: Skill[];
  skillUp: ItemList[];
  modules: Module[];
  riic: RiicSkill[];
}

export interface Meta {
  const: { expMap: number[][]; lmdMap: number[][]; evolveGold: number[][]; maxLevel: number[][] };
  branches: Record<string, string>;
  factions: Record<string, string>;
  terms: Record<string, { name: string; desc: string }>;
}

export interface Item {
  name: string;
  rarity: number;
  icon: string;
  sort: number;
  group: "lmd" | "exp" | "material" | "chip" | "skill" | "module" | "other";
  desc: string;
  src?: Server;
  type?: string; // the game's item type, when it isn't a plain material ("VOUCHER_LEVELMAX_6", "AP_SUPPLY")
  ap?: number; // sanity a potion restores
}

export interface Recipe {
  count: number;
  costs: ItemList;
  lmd: number;
}

export interface ItemsFile {
  items: Record<string, Item>;
  recipes: Record<string, Recipe>;
  values: Record<string, number>;
  corrections: Record<string, { value: number; was: number; why: string }>;
  potential?: Record<string, Record<string, string>>; // rarity -> class -> potential token
}

export interface StageRow {
  id: string;
  code: string;
  ap: number;
  type: string;
  drops: Record<string, number>;
  days?: number[];
}

export interface StagesFile {
  region: string;
  fetched: number;
  stages: StageRow[];
  ce: { id: string; code: string; ap: number; lmd: number; days?: number[] }[];
  zones: { id: string; name: string; prefix: string; days: number[]; kind: string }[];
}

export interface RecruitFile {
  tags: { id: number; name: string; group: number }[];
  pool: { id: string; rarity: number; tags: number[] }[];
}

export interface UsageRow {
  u?: Partial<Record<Category, number>>;
  score?: number;
  skill?: Record<string, number>;
  m3?: Record<string, number>;
  e2?: number;
  mod?: Record<string, number>;
  w?: number;
  inv?: { own: number; e2: number; m3: Record<string, number>; mod: Record<string, number>; mod3: Record<string, number> };
  lift?: number;
  build: { elite?: number; skill?: number; mastery?: number; module?: string };
}

export type Category = "main" | "event" | "annihilation" | "cc" | "supply" | "other";

export interface UsageFile {
  weights: Record<Category, number>;
  totals: Partial<Record<Category, { stages: number; guides: number }>>;
  guides: number;
  ops: Record<string, UsageRow>;
  archetypes: Record<string, { u: Partial<Record<Category, number>>; score: number }>;
}

export interface UpcomingEvent {
  id: string;
  name_cn: string;
  name?: string;
  kind: string;
  cn_start: string;
  eta: string;
  confirmed: boolean;
  stages: number;
  guided: number;
  guides: number;
  key_ops: { id: string; share: number }[];
}

export interface ShopEvent {
  id: string;
  name: string; // the server's name when it has the event, else CN's
  status: "running" | "upcoming";
  start?: string;
  end?: string;
  eta?: string;
  confirmed?: boolean;
  offers: [string, number, number, number | null, number][]; // item, price in tokens, quantity per purchase, stock or null, section
}
export interface ShopsFile { events: ShopEvent[] }

export interface UpcomingFile {
  server: Server;
  lag_days: number | null;
  events: UpcomingEvent[];
  running: { id: string; name: string; start: string; end: string }[];
  operators: string[];
  modules: { char: string; id: string; letter: string; icon: string; name_cn: string; cn_start: string; eta: string }[];
  banners: { id: string; name_cn: string; kind: string; cn_open: string; eta: string; featured: string[]; spark?: number }[];
  cc: {
    history: { id: string; name: string; start: string; end: string }[];
    current: { id: string; name: string; start: string; end: string } | null;
    next: { id: string; name_cn: string; cn_start: string; eta: string; overdue: boolean } | null;
    lag_days: number | null;
  } | null;
}

export interface ISFile {
  themes: {
    id: string;
    name: string;
    start: number;
    picks: { id: string; skill: number; key: boolean; start: boolean; recruit: number; promote: number }[];
  }[];
}

export interface Manifest {
  version: number;
  built: number;
  servers: Partial<Record<Server, { penguin: number; operators: number }>>;
  sources: Record<string, { date: number; guides?: number; newest?: number }>;
}
