// A small line chart of one series over time, with a tooltip for the point under the pointer.
import { useState } from "preact/hooks";
import { date, fmt } from "../lib/format";

export function Chart({ label, points, format = fmt }: { label: string; points: [number, number][]; format?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;
  const w = 600, h = 150, pad = 26;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys) + (Math.max(...ys) === Math.min(...ys) ? 1 : 0)];
  const px = (x: number) => pad + (x1 === x0 ? (w - 2 * pad) / 2 : ((x - x0) / (x1 - x0)) * (w - 2 * pad));
  const py = (y: number) => h - pad - ((y - y0) / (y1 - y0)) * (h - 2 * pad);
  const near = (clientX: number, box: DOMRect) => {
    const x = ((clientX - box.left) / box.width) * w;
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(px(p[0]) - x) < Math.abs(px(points[best][0]) - x)) best = i; });
    return best;
  };
  const hp = hover !== null ? points[hover] : null;
  return (
    <section class="card chart">
      <h3>{label}: {format(ys[ys.length - 1])}</h3>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label} over time: from ${format(ys[0])} to ${format(ys[ys.length - 1])}`}
        onPointerMove={(e) => setHover(near(e.clientX, (e.currentTarget as SVGElement).getBoundingClientRect()))} onPointerLeave={() => setHover(null)}>
        <polyline fill="none" stroke="var(--accent)" stroke-width="2" points={points.map((p) => `${px(p[0])},${py(p[1])}`).join(" ")} />
        {points.map((p, i) => <circle key={p[0]} cx={px(p[0])} cy={py(p[1])} r={i === hover ? 5 : 3} fill="var(--accent)" />)}
        {hp && <line x1={px(hp[0])} x2={px(hp[0])} y1={pad / 2} y2={h - pad} stroke="var(--line)" stroke-dasharray="3 3" />}
        <text x={pad} y={h - 6} fill="var(--muted)" font-size="11">{date(x0)}</text>
        <text x={w - pad} y={h - 6} fill="var(--muted)" font-size="11" text-anchor="end">{date(x1)}</text>
      </svg>
      {hp && <p class="chart-tip">{date(hp[0])}: <strong>{format(hp[1])}</strong></p>}
    </section>
  );
}
