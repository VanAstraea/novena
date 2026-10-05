// A pair of light-gold wings behind the hero art. They unfold once, feather by feather (the intro's final reveal, or
// the first paint without it), then stay as a faint, slowly breathing backdrop. Drawn here; no game art.
import { useMemo } from "preact/hooks";

const N = 15; // flight feathers per wing, body to tip

/** A long flight feather hanging down from its base at (0, 0), bent slightly to one side. */
function plume(len: number) {
  const w = len * 0.15;
  return {
    vane: `M0,0 C${w * 1.1},${len * 0.22} ${w * 1.25},${len * 0.62} ${w * 0.35},${len} C${-w * 0.3},${len * 0.72} ${-w * 0.85},${len * 0.34} 0,0 Z`,
    shaft: `M0,0 Q${w * 0.3},${len * 0.5} ${w * 0.33},${len * 0.97}`,
  };
}

function Wing({ side }: { side: 1 | -1 }) {
  const feathers = useMemo(() => Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1);
    const x = -300 * t, y = -170 * t + 40 * t * t; // along the arm, rising steeply toward the tip
    const len = 120 + 200 * t ** 1.2;
    const a = 18 + 112 * t ** 0.85; // opened: inner feathers hang down, the outer ones sweep up and out into a V
    return { x, y, a, len, ...plume(len), cover: plume(len * 0.48) };
  }), []);
  return (
    <g class="wing" style={{ transform: side === 1 ? "scale(-1, 1)" : undefined }}>
      <g class="wing-arm">
        {feathers.map((f, i) => (
          <g key={i} transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)})`}>
            <g class="wing-feather" style={{ "--a": `${f.a.toFixed(1)}deg`, "--i": i }}>
              <path d={f.vane} fill="url(#wing-fill)" stroke="#f2d599" stroke-opacity="0.5" stroke-width="0.8" />
              <path d={f.shaft} fill="none" stroke="#fffaf0" stroke-opacity="0.7" stroke-width="1" />
              <path d={f.cover.vane} transform="translate(4 -6) rotate(-6)" fill="url(#wing-cover)" stroke="#f2d599" stroke-opacity="0.35" stroke-width="0.6" />
            </g>
          </g>
        ))}
      </g>
    </g>
  );
}

export function Wings({ open }: { open: boolean }) {
  return (
    <svg class={`hero-wings${open ? " open" : ""}`} viewBox="-720 -330 1440 860" aria-hidden="true">
      <defs>
        <linearGradient id="wing-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fffaf0" stop-opacity="0.9" />
          <stop offset="0.6" stop-color="#f2d599" stop-opacity="0.55" />
          <stop offset="1" stop-color="#c99c50" stop-opacity="0.1" />
        </linearGradient>
        <linearGradient id="wing-cover" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fffaf0" stop-opacity="0.95" />
          <stop offset="1" stop-color="#f2d599" stop-opacity="0.3" />
        </linearGradient>
      </defs>
      <g transform="translate(-26 0)"><Wing side={-1} /></g>
      <g transform="translate(26 0)"><Wing side={1} /></g>
    </svg>
  );
}
