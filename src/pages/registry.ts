// Every page, its address and how it's loaded. Pages are split into their own chunks, loaded on first visit.
import type { ComponentType } from "preact";

export interface PageDef {
  path: string; // "/operator/:id" style
  title: string;
  nav?: "main" | "account";
  group?: string; // the section it sits in: the header shows sections, the strip under it that section's pages
  short?: string;
  keywords?: string[];
  load: () => Promise<{ default: ComponentType<{ params: Record<string, string> }> }>;
}

export const PAGES: PageDef[] = [
  { path: "/", title: "Home", load: () => import("./Home") },
  { path: "/operators", group: "operators", title: "Operators", nav: "main", keywords: ["database", "list", "filter"], load: () => import("./Operators") },
  { path: "/operator/:id", group: "operators", title: "Operator", load: () => import("./Operator") },
  { path: "/compare", group: "operators", title: "Compare", nav: "main", keywords: ["side by side", "versus"], load: () => import("./Compare") },
  { path: "/farming", group: "farming", title: "Farming planner", short: "Farming", nav: "main", keywords: ["stages", "drops", "sanity", "penguin"], load: () => import("./Farming") },
  { path: "/planner", group: "farming", title: "Upgrade planner", short: "Planner", nav: "main", keywords: ["materials", "cost", "elite", "mastery", "module", "craft"], load: () => import("./Planner") },
  { path: "/recruit", group: "recruit", title: "Recruitment calculator", short: "Recruit", nav: "main", keywords: ["tags", "recruitment"], load: () => import("./Recruit") },
  { path: "/rankings", group: "operators", title: "Rankings", nav: "main", keywords: ["usage", "tier", "who to build", "meta"], load: () => import("./Rankings") },
  { path: "/upcoming", group: "upcoming", title: "Upcoming content", short: "Upcoming", nav: "main", keywords: ["future", "events", "banners", "cc", "contingency contract", "leaks"], load: () => import("./Upcoming") },
  { path: "/is", group: "is", title: "Integrated Strategies", short: "IS", nav: "main", keywords: ["roguelike", "rogue"], load: () => import("./IS") },
  { path: "/today", group: "account", title: "Today", short: "Today", nav: "account", keywords: ["checklist", "daily", "routine", "sanity", "timer", "notification"], load: () => import("./Today") },
  { path: "/roster", group: "account", title: "My roster", short: "Roster", nav: "account", keywords: ["account", "import", "depot", "inventory"], load: () => import("./Roster") },
  { path: "/guide", group: "account", title: "Import guide", short: "Guide", nav: "account", keywords: ["import", "sync", "novena sync", "krooster", "depot", "screenshots", "syncdata", "penguin", "transfer", "backup", "how to"], load: () => import("./Guide") },
  { path: "/plan", group: "account", title: "Priorities: what to raise next", short: "Priorities", nav: "account", keywords: ["priority", "priorities", "plan", "next", "progression", "guides"], load: () => import("./Plan") },
  { path: "/gaps", group: "account", title: "Gaps", short: "Gaps", nav: "account", keywords: ["archetypes", "coverage", "missing", "who to build", "weak"], load: () => import("./Gaps") },
  { path: "/dump", group: "account", title: "Sanity Dump", short: "Sanity Dump", nav: "account", keywords: ["today", "what to farm"], load: () => import("./Dump") },
  { path: "/base", group: "account", title: "Base (RIIC) optimizer", short: "Base", nav: "account", keywords: ["riic", "infrastructure", "shifts", "trading post", "factory"], load: () => import("./Base") },
  { path: "/pulls", group: "account", title: "Pull planner", short: "Pulls", nav: "account", keywords: ["orundum", "headhunting", "savings", "banners"], load: () => import("./Pulls") },
  { path: "/settings", title: "Settings & backup", keywords: ["export", "import", "backup", "privacy", "theme"], load: () => import("./Settings") },
  { path: "/about", title: "About", keywords: ["privacy", "feedback", "support"], load: () => import("./About") },
  { path: "/credits", title: "Credits", keywords: ["sources", "license", "licenses", "credits", "attribution", "copyright", "fonts"], load: () => import("./Credits") },
];

/** The header's sections, in order; each opens on its first page. */
export const SECTIONS: { id: string; label: string; home: string }[] = [
  { id: "account", label: "My account", home: "/today" },
  { id: "operators", label: "Operators", home: "/operators" },
  { id: "farming", label: "Farming", home: "/farming" },
  { id: "recruit", label: "Recruit", home: "/recruit" },
  { id: "upcoming", label: "Upcoming", home: "/upcoming" },
  { id: "is", label: "IS", home: "/is" },
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
