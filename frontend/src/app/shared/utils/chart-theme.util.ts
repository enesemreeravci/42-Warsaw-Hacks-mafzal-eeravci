/** Chart.js renders to a `<canvas>`, so its tick/grid/segment colors are read once at draw time
 * as plain JS strings - they can't reference CSS custom properties the way the rest of the app's
 * DOM-based styling does. These helpers are the canvas-side equivalent of styles.scss's
 * `--color-text-secondary` / `--surface-tint-base` tokens: call them with
 * `ThemeService.isLight()` inside a `computed()` chart-options signal so charts re-theme
 * whenever the user toggles light/dark mode. */

export interface ChartAxisColors {
  tick: string;
  grid: string;
}

const AXIS_COLORS_DARK: ChartAxisColors = { tick: '#9aabb5', grid: 'rgba(255, 255, 255, 0.05)' };
const AXIS_COLORS_LIGHT: ChartAxisColors = { tick: '#48576b', grid: 'rgba(15, 23, 42, 0.08)' };

/** Tick label + gridline colors for a Chart.js axis, matching the current theme. */
export function chartAxisColors(isLight: boolean): ChartAxisColors {
  return isLight ? AXIS_COLORS_LIGHT : AXIS_COLORS_DARK;
}

/** Doughnut/pie segment divider color - matches the card background so segments read as cleanly
 * "cut" rather than outlined. `alpha` preserves each call site's original opacity. */
export function chartSegmentBorderColor(isLight: boolean, alpha: number): string {
  return isLight ? `rgba(255, 255, 255, ${alpha})` : `rgba(6, 8, 10, ${alpha})`;
}
