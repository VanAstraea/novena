// The old Roster gaps address: the table is Priorities' "By archetype" view now (components/ArchetypeGaps.tsx).
import { useEffect } from "preact/hooks";
import { href, navigate, route } from "../lib/router";

export default function Gaps() {
  useEffect(() => {
    const q = new URLSearchParams(route.value.query);
    q.set("view", "archetypes");
    navigate(href("/plan", q), { replace: true });
  }, []);
  return <p class="muted" role="status">Loading…</p>;
}
