import { describe, expect, it } from 'vitest';
import { ACCENTS, resolveColors } from './theme';

// WCAG contrast ratio between two #rrggbb colours.
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(['light', 'dark'] as const)('%s mode', (mode) => {
  it.each(ACCENTS)('%s passes the design system contrast rules', (accent) => {
    const c = resolveColors(mode, accent);
    // Small accent text and links, and text on an accent button (which uses the surface colour).
    expect(contrast(c.accent600, c.surface)).toBeGreaterThanOrEqual(4.5);
    // Titles at 24px+.
    expect(contrast(c.accent500, c.surface)).toBeGreaterThanOrEqual(3);
    // Text on the soft tint.
    expect(contrast(c.accent800, c.accent100)).toBeGreaterThanOrEqual(4.5);
  });
});
