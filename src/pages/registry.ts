// Every page, its address and how it's loaded. Pages are split into their own chunks, loaded on first visit.
import type { ComponentType } from "preact";
import { matchScore } from "../lib/search";

export interface PageDef {
  path: string; // "/operator/:id" style
  title: string;
  nav?: "main" | "account";
  group?: string; // the section it sits in: the header shows sections, the strip under it that section's pages
  short?: string;
  keywords?: string[]; // other words people search it by, old names included
  load: () => Promise<{ default: ComponentType<{ params: Record<string, string> }> }>;
}

// In strip order within each section.
export const PAGES: PageDef[] = [
  { path: "/", title: "Home", load: () => import("./Home") },
  // My account
  { path: "/today", group: "account", title: "Today", short: "Today", nav: "account", keywords: ["checklist", "daily", "routine", "sanity", "timer", "notification"], load: () => import("./Today") },
  { path: "/roster", group: "account", title: "My roster", short: "Roster", nav: "account", keywords: ["account", "import", "depot", "inventory"], load: () => import("./Roster") },
  { path: "/base", group: "account", title: "Base (RIIC) optimizer", short: "Base", nav: "account", keywords: ["riic", "infrastructure", "shifts", "trading post", "factory"], load: () => import("./Base") },
  // Plan
  { path: "/plan", group: "plan", title: "Priorities: what to raise next", short: "Priorities", nav: "main", keywords: ["priority", "priorities", "plan", "next", "progression", "guides"], load: () => import("./Plan") },
  { path: "/planner", group: "plan", title: "Materials planner", short: "Materials", nav: "main", keywords: ["upgrade planner", "planner", "materials", "cost", "elite", "mastery", "module", "craft", "goals"], load: () => import("./Planner") },
  { path: "/farming", group: "plan", title: "Farming planner", short: "Farming", nav: "main", keywords: ["stages", "drops", "sanity", "penguin"], load: () => import("./Farming") },
  { path: "/dump", group: "plan", title: "Sanity Dump", short: "Sanity Dump", nav: "main", keywords: ["today", "what to farm", "spend sanity"], load: () => import("./Dump") },
  { path: "/gaps", group: "plan", title: "Roster gaps", short: "Roster gaps", nav: "main", keywords: ["gaps", "archetypes", "coverage", "missing", "who to build", "weak"], load: () => import("./Gaps") },
  // Operators
  { path: "/operators", group: "operators", title: "Operators", short: "Database", nav: "main", keywords: ["database", "list", "filter"], load: () => import("./Operators") },
  { path: "/operator/:id", group: "operators", title: "Operator", load: () => import("./Operator") },
  { path: "/compare", group: "operators", title: "Compare", nav: "main", keywords: ["side by side", "versus"], load: () => import("./Compare") },
  { path: "/rankings", group: "operators", title: "Rankings", nav: "main", keywords: ["usage", "tier", "who to build", "meta"], load: () => import("./Rankings") },
  // Events
  { path: "/upcoming", group: "events", title: "Upcoming content", short: "Upcoming", nav: "main", keywords: ["future", "events", "banners", "cc", "contingency contract", "leaks"], load: () => import("./Upcoming") },
  { path: "/pulls", group: "events", title: "Banners & pulls", short: "Banners & pulls", nav: "main", keywords: ["pull planner", "pulls", "orundum", "headhunting", "savings", "banners"], load: () => import("./Pulls") },
  { path: "/story", group: "events", title: "Story & archives", short: "Story & archives", nav: "main", keywords: ["story & events", "story and events", "originite prime", "op", "side story", "intermezzi", "archive", "trial", "welfare", "event crystal", "annihilation"], load: () => import("./Story") },
  // Tools
  { path: "/recruit", group: "tools", title: "Recruitment calculator", short: "Recruitment", nav: "main", keywords: ["tags", "recruitment", "recruit"], load: () => import("./Recruit") },
  { path: "/is", group: "tools", title: "Integrated Strategies", nav: "main", keywords: ["is", "roguelike", "rogue"], load: () => import("./IS") },
  // Not in a section: linked from the footer and the gear menu (the Import guide also from the import cards and Home)
  { path: "/guide", title: "Import guide", keywords: ["import", "sync", "novena sync", "krooster", "depot", "screenshots", "syncdata", "penguin", "transfer", "backup", "how to"], load: () => import("./Guide") },
  { path: "/settings", title: "Settings & backup", keywords: ["export", "import", "backup", "privacy", "theme", "what you play", "content"], load: () => import("./Settings") },
  { path: "/about", title: "About", keywords: ["privacy", "feedback", "support"], load: () => import("./About") },
  { path: "/credits", title: "Credits", keywords: ["sources", "license", "licenses", "credits", "attribution", "copyright", "fonts"], load: () => import("./Credits") },
];

/** The header's sections, in order; each opens on its first page. */
export const SECTIONS: { id: string; label: string; home: string }[] = [
  { id: "account", label: "My account", home: "/today" },
  { id: "plan", label: "Plan", home: "/plan" },
  { id: "operators", label: "Operators", home: "/operators" },
  { id: "events", label: "Events", home: "/upcoming" },
  { id: "tools", label: "Tools", home: "/recruit" },
];

export function match(path: string): { page: PageDef; params: Record<string, string> } | null {
  for (const page of PAGES) {
    const a = page.path.split("/");
    const b = path.split("/");
    if (a.length !== b.length) continue;
    const params: Record<string, string> = {};
    if (a.every((seg, i) => (seg.startsWith(":") ? ((params[seg.slice(1)] = decodeURIComponent(b[i])), true) : seg === b[i]))) {
      return { page, params };
    }
  }
  return null;
}

/** How well a search matches a page: by its title, its label in the strip or the other names it goes by. */
export function pageScore(q: string, page: PageDef): number {
  return Math.max(matchScore(q, page.title), page.short ? matchScore(q, page.short) : 0, ...(page.keywords || []).map((k) => matchScore(q, k)));
}
