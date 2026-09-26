/**
 * Accent colors come from each buddy's art (a pale ghost, a bright duck…), so we adjust
 * their lightness in OKLCH to stay legible on light and dark surfaces while keeping hue.
 */
import { parseColor } from '$pets/sprite';

type Lab = [number, number, number];

const FALLBACK_ACCENT = '#7c5cff';

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToOklab(hex: string): Lab {
  const [r, g, b] = parseColor(hex)
    .slice(0, 3)
    .map((c) => toLinear(c / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab -> linear sRGB (may be out of gamut). */
function oklabToLinear([L, a, b]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

function toHex(rgb: number[]): string {
  return (
    '#' +
    rgb
      .map((c) => Math.round(toGamma(Math.min(1, Math.max(0, c))) * 255))
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Clamp lightness into [min, max]; give washed-out hues a little chroma so they read as color. */
export function withLightness(hex: string, min: number, max: number): string {
  const [L, a, b] = hexToOklab(hex);
  let chroma = Math.hypot(a, b);
  const hue = Math.atan2(b, a);
  if (chroma > 0.02 && chroma < 0.09) chroma = 0.09;
  const lightness = Math.min(max, Math.max(min, L));
  // Reduce chroma until the color fits in sRGB (keeps hue and lightness honest).
  for (let i = 0; i < 40; i++) {
    const rgb = oklabToLinear([lightness, chroma * Math.cos(hue), chroma * Math.sin(hue)]);
    if (inGamut(rgb)) return toHex(rgb);
    chroma *= 0.94;
  }
  return toHex(oklabToLinear([lightness, 0, 0]));
}

export interface AccentShades {
  /** The buddy's own color, for fills and glows. */
  base: string;
  /** Foreground/fill variant that reads on light surfaces (pairs with white text). */
  light: string;
  /** Foreground/fill variant that reads on dark surfaces (pairs with dark text). */
  dark: string;
}

export function accentShades(accent: string): AccentShades {
  let base = accent;
  try {
    parseColor(base);
  } catch {
    base = FALLBACK_ACCENT;
  }
  return {
    base,
    light: withLightness(base, 0.42, 0.55),
    dark: withLightness(base, 0.76, 0.86),
  };
}
