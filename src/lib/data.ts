// Loads the published data files. Each file is fetched once per page load; failures are not cached, so a retry
// (or going back to the page) fetches again.
import type { EnemiesFile, EnemyAbilities, ISFile, ItemsFile, Manifest, Meta, OpDetail, OpIndex, ProgressFile, RecruitFile, Server, ShopsFile, StagesFile, UpcomingFile, UsageFile } from "../types";

export const BASE = import.meta.env.BASE_URL;
const ROOT = `${BASE}data/v1/`;
const cache = new Map<string, Promise<unknown>>();

export function load<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(ROOT + path).then((r) => {
      if (!r.ok) throw new Error(`Couldn't load ${path} (${r.status})`);
      return r.json() as Promise<T>;
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

export const manifest = () => load<Manifest>("manifest.json");
export const usage = () => load<UsageFile>("common/usage.json");
export const operators = (s: Server) => load<{ ops: OpIndex[] }>(`${s}/operators.json`).then((d) => d.ops);
export const operator = (s: Server, id: string) => load<OpDetail>(`${s}/ops/${encodeURIComponent(id)}.json`);
export const meta = (s: Server) => load<Meta>(`${s}/meta.json`);
export const ranges = (s: Server) => load<Record<string, [number, number][]>>(`${s}/ranges.json`);
export const items = (s: Server) => load<ItemsFile>(`${s}/items.json`);
export const stages = (s: Server) => load<StagesFile>(`${s}/stages.json`);
export const recruit = (s: Server) => load<RecruitFile>(`${s}/recruit.json`);
export const upcoming = (s: Server) => load<UpcomingFile>(`${s}/upcoming.json`);
export const integrated = (s: Server) => load<ISFile>(`${s}/is.json`);
export const shops = (s: Server) => load<ShopsFile>(`${s}/shops.json`);
export const enemies = (s: Server) => load<EnemiesFile>(`${s}/enemies.json`);
export const enemyAbilities = (s: Server) => load<EnemyAbilities>(`${s}/enemy-abilities.json`);
/** Story & archives, or null until the daily build first publishes it (a missing file, or the dev server's page in its place). */
export const progress = (s: Server) => load<ProgressFile>(`${s}/progress.json`).catch((e: Error) => {
  if (e instanceof SyntaxError || / \(404\)$/.test(e.message)) return null;
  throw e;
});

/** Operator index keyed by id. */
export async function opMap(s: Server): Promise<Map<string, OpIndex>> {
  return new Map((await operators(s)).map((o) => [o.id, o]));
}

// Images come from community mirrors of the game's art (they belong to Hypergryph/Yostar and aren't bundled here):
// operator art and item, skill, base-skill and enemy icons from ArknightsGameResource; game UI icons (classes, branches,
// modules, elite, potential, mastery, rarity) from the ArknightsAssets dump. Backgrounds are Novena's own drawings, not game
// scenes.
const ART = "https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main";
const DYN = "https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/cn/assets/dyn";
const UI = `${DYN}/arts`;
const e = encodeURIComponent;
export const art = {
  avatar: (id: string) => `${ART}/avatar/${e(id)}.png`,
  /** Half-body portrait, as in the game's operator list. E2 art first when asked for, base art as the fallback. */
  portraits: (id: string, elite = 0) => [...(elite >= 2 ? [`${ART}/portrait/${e(id)}_2.png`] : []), `${ART}/portrait/${e(id)}_1.png`],
  /** Full splash art (about 1 MB each: load only where it's the point). */
  splashes: (id: string, elite = 0) => [...(elite >= 2 ? [`${ART}/skin/${e(id)}_2b.png`] : []), `${ART}/skin/${e(id)}_1b.png`],
  /** An outfit's full art, by its skin file name ("char_4193_lemuen_ambienceSynesthesia#7b"). */
  skin: (file: string) => `${ART}/skin/${e(file)}.png`,
  /** The same outfit art at about half the width and a quarter of the bytes (Lemuen's: 963 px wide, 1.3 MB against
   * 2033 px, 4.7 MB), from the ArknightsAssets dump, which keeps it in lower case in a folder per operator. */
  skinSmall: (file: string) => {
    const op = /^char_\d+_[^_]+/.exec(file)?.[0] ?? file;
    return `${DYN}/arts/characters/${e(op.toLowerCase())}/${e(file.toLowerCase())}.png`;
  },
  /** An outfit's avatar, half-body portrait and full art, by the outfit id the game uses ("char_002_amiya@epoque#4"). */
  outfitAvatar: (skin: string) => `${ART}/avatar/${e(skin.replace("@", "_"))}.png`,
  outfitPortrait: (skin: string) => `${ART}/portrait/${e(skin.replace("@", "_"))}.png`,
  outfitSplash: (skin: string) => `${ART}/skin/${e(skin.replace("@", "_"))}b.png`,
  item: (icon: string) => `${ART}/item/${e(icon)}.png`,
  skill: (icon: string) => `${ART}/skill/skill_icon_${e(icon)}.png`,
  riic: (icon: string) => `${ART}/building_skill/${e(icon)}.png`,
  enemy: (id: string) => `${ART}/enemy/${e(id)}.png`,
  classIcon: (cls: string) => `${UI}/profession_large_hub/icon_profession_${e(cls.toLowerCase())}_large_white.png`,
  branchIcon: (branch: string) => `${UI}/ui/subprofessionicon/sub_${e(branch)}_icon.png`,
  elite: (n: number) => `${UI}/elite_hub/elite_${n}.png`,
  potential: (p: number) => `${UI}/potential_hub/potential_${Math.max(0, p - 1)}_small.png`,
  mastery: (m: number) => `${UI}/specialized_hub/specialized_${m}_small.png`,
  rarity: (stars: number) => `${UI}/rarity_hub/rarity_yellow_${Math.max(0, stars - 1)}.png`,
  moduleType: (type: string) => `${UI}/ui/uniequiptype/${e(type)}.png`,
  moduleImg: (img: string) => `${UI}/ui/uniequipimg/${e(img)}.png`,
};
