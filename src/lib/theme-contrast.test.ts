import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
function token(name: string, prefix = 'color'): string {
  const value = css.match(new RegExp(`--${prefix}-${name}:\\s*(#[a-f\\d]{6})`, 'i'))?.[1];
  if (!value) throw new Error(`Missing colour token: ${name}`);
  return value;
}
function luminance(hex: string): number {
  const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
describe('action and link text contrast', () => {
  it.each(['paper', 'sky'])('meets normal-text AA contrast against %s', (background) => {
    expect(contrast(token('signal'), token(background))).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps white admin-button text readable on the action colour', () => {
    expect(contrast(token('signal'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('colourful storefront readability', () => {
  it.each(['cream', 'mint', 'peach', 'lilac', 'lemon'])('keeps body copy readable on %s', (background) => {
    expect(contrast(token('ink-soft'), token(background, 'store'))).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps the hero text and lemon action readable', () => {
    expect(contrast('#e2eaff', token('blue', 'store'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('blue-deep', 'store'), token('lemon', 'store'))).toBeGreaterThanOrEqual(4.5);
  });
});
