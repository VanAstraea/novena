// Every page, its address and how it's loaded. Pages are split into their own chunks, loaded on first visit.
import type { ComponentType } from "preact";

export interface PageDef {
  path: string; // "/operator/:id" style
  title: string;
  nav?: "main" | "account";
  short?: string;
  keywords?: string[];
  load: () => Promise<{ default: ComponentType<{ params: Record<string, string> }> }>;
}

export const PAGES: PageDef[] = [
  { path: "/", title: "Home", load: () => import("./Home") },
  { path: "/operators", title: "Operators", nav: "main", keywords: ["database", "list", "filter"], load: () => import("./Operators") },
  { path: "/operator/:id", title: "Operator", load: () => import("./Operator") },
  { path: "/compare", title: "Compare", nav: "main", keywords: ["side by side", "versus"], load: () => import("./Compare") },
  { path: "/planner", title: "Upgrade planner", short: "Planner", nav: "main", keywords: ["materials", "cost", "elite", "mastery", "module", "craft"], load: () => import("./Planner") },
  { path: "/farming", title: "Farming planner", short: "Farming", nav: "main", keywords: ["stages", "drops", "sanity", "penguin"], load: () => import("./Farming") },
  { path: "/recruit", title: "Recruitment calculator", short: "Recruit", nav: "main", keywords: ["tags", "recruitment"], load: () => import("./Recruit") },
  { path: "/rankings", title: "Rankings", nav: "main", keywords: ["usage", "tier", "who to build", "meta"], load: () => import("./Rankings") },
  { path: "/upcoming", title: "Upcoming content", short: "Upcoming", nav: "main", keywords: ["future", "events", "banners", "cc", "contingency contract", "leaks"], load: () => import("./Upcoming") },
  { path: "/is", title: "Integrated Strategies", short: "IS", nav: "main", keywords: ["roguelike", "rogue"], load: () => import("./IS") },
  { path: "/roster", title: "My roster", short: "Roster", nav: "account", keywords: ["account", "import", "depot", "inventory"], load: () => import("./Roster") },
  { path: "/plan", title: "Plan: what to build next", short: "Plan", nav: "account", keywords: ["priority", "guides"], load: () => import("./Plan") },
  { path: "/dump", title: "Sanity Dump", short: "Sanity Dump", nav: "account", keywords: ["today", "what to farm"], load: () => import("./Dump") },
  { path: "/base", title: "Base (RIIC) optimizer", short: "Base", nav: "account", keywords: ["riic", "infrastructure", "shifts", "trading post", "factory"], load: () => import("./Base") },
  { path: "/pulls", title: "Pull planner", short: "Pulls", nav: "account", keywords: ["orundum", "headhunting", "savings", "banners"], load: () => import("./Pulls") },
  { path: "/settings", title: "Settings & backup", keywords: ["export", "import", "backup", "privacy", "theme"], load: () => import("./Settings") },
  { path: "/about", title: "About", keywords: ["privacy", "feedback", "support"], load: () => import("./About") },
  { path: "/credits", title: "Credits", keywords: ["sources", "license", "licenses", "credits", "attribution", "copyright", "fonts"], load: () => import("./Credits") },
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
