// My roster: quick bulk entry, depot, import/export and progress over time. Saved in this browser only. Each tab lives
// in its own file beside this one.
import { Await, Tabs, useAsync } from "../../components/ui";
import { operators } from "../../lib/data";
import { href, route, setQuery } from "../../lib/router";
import { account, loaded, server } from "../../state";
import { Depot } from "./Depot";
import { Progress } from "./History";
import { Import } from "./Import";
import { Ops } from "./Table";
import { ToUse } from "./ToUse";

export { fit } from "./Table";
export { DepotPaste } from "./Depot";

type Tab = "operators" | "depot" | "use" | "import" | "progress";

export default function Roster() {
  const s = server.value;
  const st = useAsync(() => operators(s), [s]);
  const tab = (route.value.query.get("tab") || "operators") as Tab;
  const a = account.value;
  return (
    <div class="stack fade-in">
      <div class="page-head">
        <div>
          <h1>My roster</h1>
          <p class="muted">Saved in this browser only, separately for each server. <a href={href("/settings")}>Back it up</a>.</p>
        </div>
        {tab !== "import" && <a class="pill primary" href={href("/roster", { tab: "import" })}>Sync / Import <span aria-hidden="true">→</span></a>}
      </div>
      <Tabs label="Roster sections" value={tab} onChange={(t) => setQuery({ tab: t === "operators" ? "" : t })} tabs={[
        { key: "operators", label: `Operators (${Object.keys(a.ops).length})` }, { key: "depot", label: "Depot" }, { key: "use", label: "To use" },
        { key: "import", label: "Import / export" }, { key: "progress", label: "Progress" },
      ]} />
      <Await state={st} what="operators">
        {(ops) => !loaded.value ? <p class="muted">Loading your data…</p>
          : tab === "depot" ? <Depot /> : tab === "use" ? <ToUse ops={ops} /> : tab === "import" ? <Import ops={ops} /> : tab === "progress" ? <Progress ops={ops} /> : <Ops ops={ops} />}
      </Await>
    </div>
  );
}
