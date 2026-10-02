// Loads the published data files. Each file is fetched once per page load; failures are not cached, so a retry
// (or going back to the page) fetches again.
import type {
  ISFile, ItemsFile, Manifest, Meta, OpDetail, OpIndex, RecruitFile, Server, StagesFile, UpcomingFile, UsageFile,
} from "../types";

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

/** Operator index keyed by id. */
export async function opMap(s: Server): Promise<Map<string, OpIndex>> {
  return new Map((await operators(s)).map((o) => [o.id, o]));
}

// Images come from a community mirror of the game's art (they belong to Hypergryph/Yostar and aren't bundled here).
const ART = "https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main";
export const art = {
  avatar: (id: string) => `${ART}/avatar/${encodeURIComponent(id)}.png`,
  portrait: (id: string) => `${ART}/portrait/${encodeURIComponent(id)}_1.png`,
  item: (icon: string) => `${ART}/item/${encodeURIComponent(icon)}.png`,
  skill: (icon: string) => `${ART}/skill/skill_icon_${encodeURIComponent(icon)}.png`,
  riic: (icon: string) => `${ART}/building_skill/${encodeURIComponent(icon)}.png`,
};
