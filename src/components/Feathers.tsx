// Soft down feathers drifting down the hero's left and right edges once it has settled: each a curved shaft with fine,
// wispy strands, falling on its own path with a slow sway, fading in near the top and out before the bottom.
// Pure CSS animation on a handful of elements; none for reduced motion.
import { useMemo } from "preact/hooks";

const COUNT = 16;

/** A small seeded random, so the layout is the same on every render. */
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

/** The plume, drawn once: a softly bent shaft and strands that curl toward the tip, longest and fluffiest low down. */
function plume() {
  const r = rng(77);
  const B = [0, 46], C = [14, 2], T = [4, -44]; // base, control, tip of the shaft (a quadratic curve)
  const at = (s: number) => [
    (1 - s) ** 2 * B[0] + 2 * (1 - s) * s * C[0] + s * s * T[0],
    (1 - s) ** 2 * B[1] + 2 * (1 - s) * s * C[1] + s * s * T[1],
  ];
  const tangent = (s: number) => {
    const dx = 2 * (1 - s) * (C[0] - B[0]) + 2 * s * (T[0] - C[0]), dy = 2 * (1 - s) * (C[1] - B[1]) + 2 * s * (T[1] - C[1]);
    const l = Math.hypot(dx, dy);
    return [dx / l, dy / l];
  };
  const strands: { d: string; o: number; w: number }[] = [];
  for (let k = 0; k <= 46; k++) {
    const s = 0.06 + (k / 46) * 0.92 + (r() - 0.5) * 0.012;
    const [px, py] = at(s), [tx, ty] = tangent(s);
    for (const side of [-1, 1]) {
      const nx = -ty * side, ny = tx * side; // outward from the shaft
      const len = (5 + 19 * Math.sin(Math.PI * Math.min(1, s * 1.1)) ** 0.6) * (side === 1 ? 1.1 : 0.92) * (0.7 + r() * 0.5);
      const lean = 0.35 + s * 0.5 + (r() - 0.5) * 0.25; // strands sweep toward the tip, more so higher up
      const dir = [nx * Math.cos(lean) + tx * Math.sin(lean), ny * Math.cos(lean) + ty * Math.sin(lean)];
      const curl = (r() - 0.3) * 0.5; // each strand curls a little at its end, not all the same way
      const ex = px + dir[0] * len, ey = py + dir[1] * len;
      const c1 = [px + nx * len * 0.45, py + ny * len * 0.45];
      const c2 = [ex - dir[0] * len * 0.3 + tx * len * curl, ey - dir[1] * len * 0.3 + ty * len * curl];
      strands.push({
        d: `M${px.toFixed(1)},${py.toFixed(1)} C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`,
        o: (0.2 + 0.3 * (1 - s)) * (0.7 + r() * 0.6), w: 0.42 + r() * 0.2,
      });
    }
  }
  // the downy wisps at the base: long, loose and curly
  const wisps = Array.from({ length: 9 }, (_, i) => {
    const a = -2.4 + (i / 8) * 1.9 + (r() - 0.5) * 0.2, l = 12 + r() * 10;
    const ex = B[0] + Math.cos(a) * l * 1.1, ey = B[1] - 4 + Math.sin(a) * l * -0.9;
    return `M${B[0]},${B[1] - 4} q${(Math.cos(a + 0.8) * l * 0.6).toFixed(1)},${(-Math.sin(a + 0.8) * l * 0.5).toFixed(1)} ${(ex - B[0]).toFixed(1)},${(ey - B[1] + 4).toFixed(1)}`;
  });
  const shaft = `M${B[0]},${B[1]} Q${C[0]},${C[1]} ${T[0]},${T[1]}`;
  return { strands, wisps, shaft };
}

export function Feathers() {
  const shape = useMemo(plume, []);
  const feathers = useMemo(() => {
    const r = rng(20261005);
    return Array.from({ length: COUNT }, (_, i) => {
      const depth = r(); // 0 far, 1 near
      return {
        left: r() < 0.5 ? 1 + r() * 13 : 85 + r() * 13, // %: down the left and right edges, never the middle
        size: 30 + depth * 34, // px
        fall: 14 + (1 - depth) * 9 + r() * 4, // s
        sway: 3.6 + r() * 2.6, // s
        reach: 16 + r() * 30, // px of sideways drift
        delay: 0.4 + i * 0.75 + r() * 1.2, // s: they arrive one by one
        tilt: -35 + r() * 70, // deg
        opacity: 0.45 + depth * 0.45,
        blur: depth < 0.3 ? 1 : 0,
        flip: r() < 0.5,
      };
    });
  }, []);
  return (
    <div class="feathers" aria-hidden="true">
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <radialGradient id="down-body" cx="0.55" cy="0.5" r="0.5">
            <stop offset="0" stop-color="#fffaf0" stop-opacity="0.55" />
            <stop offset="1" stop-color="#f2d599" stop-opacity="0" />
          </radialGradient>
          <filter id="down-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="0.6" /></filter>
          <symbol id="down" viewBox="-30 -54 60 112">
            <ellipse cx="8" cy="4" rx="18" ry="38" fill="url(#down-body)" transform="rotate(10 8 4)" />
            <g fill="none" stroke-linecap="round" filter="url(#down-soft)">
              {shape.strands.map((s, i) => <path key={i} d={s.d} stroke={i % 4 ? "#fffaf0" : "#f2d599"} stroke-opacity={s.o} stroke-width={s.w} />)}
              {shape.wisps.map((d, i) => <path key={`w${i}`} d={d} stroke="#fffaf0" stroke-opacity="0.4" stroke-width="0.5" />)}
            </g>
            <path d={shape.shaft} fill="none" stroke="#fffaf0" stroke-opacity="0.38" stroke-width="0.6" stroke-linecap="round" filter="url(#down-soft)" />
          </symbol>
        </defs>
      </svg>
      {feathers.map((f, i) => (
        <span key={i} class="feather" style={{
          left: `${f.left}%`, "--fall": `${f.fall}s`, "--delay": `${f.delay}s`, "--peak": f.opacity, filter: f.blur ? `blur(${f.blur}px)` : undefined,
        }}>
          <span class="feather-sway" style={{ "--sway": `${f.sway}s`, "--reach": `${f.reach}px`, "--tilt": `${f.tilt}deg` }}>
            <svg width={f.size * 0.54} height={f.size} viewBox="-30 -54 60 112"><use href="#down" x="-30" y="-54" width="60" height="112" transform={f.flip ? "scale(-1 1)" : undefined} /></svg>
          </span>
        </span>
      ))}
    </div>
  );
}
