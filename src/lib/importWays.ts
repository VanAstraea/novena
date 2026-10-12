// Every way to bring an account into Novena, with what each brings: the import guide compares them (?m=sync opens
// one) and the Roster's Import / export tab offers the same choices (?tab=import&m=sync), so both use these keys.
import { SYNC_SERVERS } from "./syncBridge";

export type Way = "sync" | "krooster" | "planner" | "file" | "screenshots" | "hand" | "move";

export const WAYS: { key: Way; tab: string; name: string; brings: string[]; effort: string; needs: string }[] = [
  { key: "sync", tab: "Novena Sync", name: "Novena Sync app", brings: ["Roster", "Depot", "Currencies", "Base", "Recruitment", "Sanity", "Story progress (optional)"],
    effort: "Set up once, then one click", needs: `A Windows or Mac computer, and a game account with a bound email (${SYNC_SERVERS.map((s) => s.toUpperCase()).join(", ")})` },
  { key: "krooster", tab: "Krooster", name: "Krooster profile", brings: ["Roster", "Depot (second paste)"],
    effort: "A few steps each time", needs: "Your roster kept up to date on Krooster" },
  { key: "planner", tab: "Planner depot", name: "Depot from Krooster or Penguin Statistics", brings: ["Depot"],
    effort: "Copy and paste", needs: "Your depot kept in Krooster's or Penguin Statistics' planner" },
  { key: "file", tab: "Sync data file", name: "Game sync data file", brings: ["Roster", "Depot", "Currencies", "Recruitment", "Sanity", "Story progress"],
    effort: "Drop a file", needs: "A syncData file saved by another community tool" },
  { key: "screenshots", tab: "Screenshots", name: "Depot screenshots", brings: ["Depot"],
    effort: "A few screenshots", needs: "The game, on any device" },
  { key: "hand", tab: "By hand", name: "By hand", brings: ["Roster", "Depot"],
    effort: "Longest the first time, then quick edits", needs: "Nothing: no sign-in, no risk" },
  { key: "move", tab: "Another device", name: "Another browser or device", brings: ["Everything saved here"],
    effort: "Export, then import", needs: "Novena open in both browsers" },
];

export const isWay = (k: string | null): k is Way => WAYS.some((w) => w.key === k);
