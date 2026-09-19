// A small SVG line chart for rates between 0 and 1 (learning curves). No library needed.
import { esc } from "./ui.js";

/**
 * series: [{label, values: [0..1], band?: [half-width], tone: "ink" | "muted" | "accent"}]
 * Rounds run along x (1..n), rates along y; an optional band shows the 95% interval.
 */
export function lineChart(series, { height = 180, yMax = 1 } = {}) {
  const width = 320;
  const pad = { left: 34, right: 8, top: 10, bottom: 24 };
  const n = Math.max(...series.map((s) => s.values.length), 2);
  const x = (k) => pad.left + (k / (n - 1)) * (width - pad.left - pad.right);
  const y = (v) => pad.top + (1 - Math.min(v, yMax) / yMax) * (height - pad.top - pad.bottom);
  const ticks = [0, yMax / 2, yMax];
  const path = (values) => values.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const band = (s) => {
    if (!s.band) return "";
    const upper = s.values.map((v, k) => `${x(k).toFixed(1)},${y(v + s.band[k]).toFixed(1)}`);
    const lower = s.values.map((v, k) => `${x(k).toFixed(1)},${y(Math.max(0, v - s.band[k])).toFixed(1)}`).reverse();
    return `<polygon class="chart-band tone-${s.tone}" points="${[...upper, ...lower].join(" ")}"/>`;
  };
  return `<figure class="chart">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(series.map((s) => s.label).join("、"))}">
      ${ticks.map((t) => `<line class="chart-grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(t)}" y2="${y(t)}"/>
        <text class="chart-axis" x="${pad.left - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t * 100)}%</text>`).join("")}
      ${Array.from({ length: n }, (_, k) => `<text class="chart-axis" x="${x(k)}" y="${height - 6}" text-anchor="middle">${k + 1}</text>`).join("")}
      ${series.map(band).join("")}
      ${series.map((s) => `<path class="chart-line tone-${s.tone}" d="${path(s.values)}"/>`).join("")}
    </svg>
    <figcaption class="chart-legend">${series.map((s) => `<span class="tone-${s.tone}"><i></i>${esc(s.label)}</span>`).join("")}
      <span class="muted">橫軸：第幾輪</span></figcaption>
  </figure>`;
}
