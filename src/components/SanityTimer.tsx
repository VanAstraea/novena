// A sanity timer: type what you have now, see when it's full (a point every six minutes), and optionally get a browser
// notification at that moment while a Novena tab is open. Kept per server, in this browser.
import { useEffect, useState } from "preact/hooks";
import { dayTime, duration } from "../lib/format";
import { pref, setPref } from "../lib/storage";
import { sanityAt, type Saved } from "../lib/sanity";
import { server } from "../state";

const read = (s: string): Saved => {
  try { return { value: 0, cap: 135, at: 0, notify: false, ...JSON.parse(pref(`sanity.${s}`, "{}")) }; } catch { return { value: 0, cap: 135, at: 0, notify: false }; }
};

export function SanityTimer() {
  const s = server.value;
  const [saved, setSaved] = useState(() => read(s));
  const [, tick] = useState(0);
  useEffect(() => setSaved(read(s)), [s]);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);
  const save = (next: Saved) => { setSaved(next); setPref(`sanity.${s}`, JSON.stringify(next)); };
  const { now, fullAt } = sanityAt(saved);
  const full = !saved.at || fullAt <= Date.now();

  // While a tab is open, a notification when sanity fills up.
  useEffect(() => {
    if (!saved.notify || full || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const t = setTimeout(() => new Notification("Novena: sanity is full", { body: `${saved.cap} sanity on ${s.toUpperCase()}. Time to spend it.`, icon: `${import.meta.env.BASE_URL}novena-mark.svg` }), fullAt - Date.now());
    return () => clearTimeout(t);
  }, [saved.notify, fullAt, full]);

  const toggleNotify = async () => {
    if (saved.notify) return save({ ...saved, notify: false });
    if (typeof Notification === "undefined") return;
    const ok = Notification.permission === "granted" || (await Notification.requestPermission()) === "granted";
    save({ ...saved, notify: ok });
  };
  return (
    <section class="card sanity">
      <h2>Sanity</h2>
      <div class="row" style={{ alignItems: "flex-end" }}>
        <label class="field"><span>Now</span>
          <input type="number" min={0} max={999} value={saved.at ? now : ""} placeholder="0"
            onChange={(e) => save({ ...saved, value: Math.max(0, Number((e.target as HTMLInputElement).value) || 0), at: Date.now() })} /></label>
        <span class="muted" style={{ paddingBottom: "8px" }}>/</span>
        <label class="field"><span>Cap</span>
          <input type="number" min={80} max={999} value={saved.cap} onChange={(e) => save({ ...saved, cap: Math.max(1, Number((e.target as HTMLInputElement).value) || 135) })} /></label>
        <div style={{ paddingBottom: "6px" }}>
          {!saved.at ? <span class="muted">Type your sanity to start the timer.</span>
            : full ? <strong class="good-text">Full</strong>
            : <>Full at <strong>{dayTime(fullAt)}</strong> <span class="muted">(in {duration(fullAt - Date.now())})</span></>}
        </div>
        {typeof Notification !== "undefined" && saved.at > 0 && !full && (
          <button class={saved.notify ? "primary small" : "small"} onClick={toggleNotify} aria-pressed={saved.notify}>
            {saved.notify ? "Notifying when full" : "Notify me when full"}
          </button>
        )}
      </div>
      <p class="explain">A point every six minutes. Notifications work while a Novena tab is open; nothing is sent anywhere.</p>
    </section>
  );
}
