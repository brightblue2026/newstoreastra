import { describe, expect, it } from 'vitest';
import { buildHref, firstValue } from './query';

describe('buildHref', () => {
  it('returns the bare path when nothing is set', () => {
    expect(buildHref('/shop', {})).toBe('/shop');
  });

  it('keeps the other filters when one changes', () => {
    expect(buildHref('/shop', { brand: 'mx-3', sort: 'name' }, { sort: 'newest' })).toBe(
      '/shop?brand=mx-3&sort=newest',
    );
  });

  it('removes a key patched to undefined', () => {
    expect(buildHref('/shop', { brand: 'mx-3', sort: 'name' }, { brand: undefined })).toBe(
      '/shop?sort=name',
    );
  });

  it('drops empty strings rather than emitting a bare key', () => {
    expect(buildHref('/search', { q: '' })).toBe('/search');
  });

  it('emits keys in sorted order regardless of insertion order', () => {
    const a = buildHref('/shop', { sort: 'name', brand: 'mx-3' });
    const b = buildHref('/shop', { brand: 'mx-3', sort: 'name' });
    expect(a).toBe(b);
    expect(a).toBe('/shop?brand=mx-3&sort=name');
  });

  it('encodes values', () => {
    expect(buildHref('/search', { q: 'coconut oil & ghee' })).toBe(
      '/search?q=coconut+oil+%26+ghee',
    );
  });
});

describe('firstValue', () => {
  it('passes a single value through', () => {
    expect(firstValue('mx-3')).toBe('mx-3');
  });

  it('takes the first of a repeated key', () => {
    expect(firstValue(['a', 'b'])).toBe('a');
  });

  it('passes undefined through', () => {
    expect(firstValue(undefined)).toBeUndefined();
  });
});
