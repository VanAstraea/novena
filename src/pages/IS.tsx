// Integrated Strategies: per theme, the operators that carry runs (MAA's public IS data), with your builds.
import { useState } from "preact/hooks";
import { BuildMarks } from "../components/Marks";
import { Await, Explain, OpLink, Stars, useAsync } from "../components/ui";
import { integrated, operators } from "../lib/data";
import { CLASS_NAMES, CLASS_ORDER } from "../lib/format";
import { route, setQuery } from "../lib/router";
import { account, hasRoster, server } from "../state";

export default function IS() {
  const s = server.value;
  const st = useAsync(() => Promise.all([integrated(s), operators(s)]), [s]);
  const q = route.value.query;
  const [limit, setLimit] = useState(60);
  return (
    <div class="stack fade-in">
      <h1>Integrated Strategies</h1>
      <Await state={st} what="IS data">
        {([is, ops]) => {
          if (!is.themes.length) return <p class="muted">No IS themes on this server.</p>;
          const theme = is.themes.find((t) => t.id === q.get("theme")) || is.themes[0];
          const cls = q.get("cls") || "";
          const byId = new Map(ops.map((o) => [o.id, o]));
          const owned = q.get("owned") === "1";
          const picks = theme.picks.filter((p) => byId.has(p.id) && (!cls || byId.get(p.id)!.cls === cls) && (!owned || account.value.ops[p.id]));
          return (
            <>
              <div class="card">
                <div class="row" style={{ alignItems: "flex-end" }}>
                  <label class="field"><span>Theme</span>
                    <select value={theme.id} onChange={(e) => setQuery({ theme: (e.target as HTMLSelectElement).value })}>
                      {is.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </label>
                  <label class="field"><span>Class</span>
                    <select value={cls} onChange={(e) => setQuery({ cls: (e.target as HTMLSelectElement).value })}>
                      <option value="">Any</option>{CLASS_ORDER.map((c) => <option key={c} value={c}>{CLASS_NAMES[c]}</option>)}
                    </select>
                  </label>
                  {hasRoster.value && <label class="row tight"><input type="checkbox" checked={owned} onChange={(e) => setQuery({ owned: (e.target as HTMLInputElement).checked ? "1" : "" })} /> Only mine</label>}
                </div>
              </div>
              <div class="table-wrap">
                <table class="cards">
                  <thead><tr><th>Operator</th><th class="num">Recruit priority</th><th>Skill</th><th>Role</th>{hasRoster.value && <th>Yours</th>}</tr></thead>
                  <tbody>
                    {picks.slice(0, limit).map((p) => {
                      const op = byId.get(p.id)!;
                      const mine = account.value.ops[p.id];
                      return (
                        <tr key={p.id}>
                          <td data-label="Operator"><OpLink op={op} sub={<><Stars n={op.rarity} /> {CLASS_NAMES[op.cls]}</>} /></td>
                          <td data-label="Recruit priority" class="num">{p.recruit}</td>
                          <td data-label="Skill">{p.skill ? `S${p.skill}` : "–"}</td>
                          <td data-label="Role">{[p.key && "Key operator", p.start && "Good opener"].filter(Boolean).join(", ") || "–"}</td>
                          {hasRoster.value && <td data-label="Yours">{mine ? <BuildMarks s={{ ...mine, masteries: mine.masteries.map((m, j) => (p.skill && j === p.skill - 1 ? m : 0)), modules: {} }} op={op} /> : <span class="muted">not owned</span>}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {picks.length > limit && <button onClick={() => setLimit(limit + 100)}>Show more</button>}
              <Explain>From MAA's public IS recruitment data for this theme (data only, credited on the About page): the priority its maintainers give each operator when recruiting, the skill it uses, and whether it's a key operator or a good opener. Community clear guides don't cover IS runs.</Explain>
            </>
          );
        }}
      </Await>
    </div>
  );
}
