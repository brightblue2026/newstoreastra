/**
 * Href building for the browse filters.
 *
 * The filter and sort controls are plain links, not a client-side form: the
 * listing pages stay server components, the filtered result is a real URL that
 * can be shared and indexed, and the whole thing works before JavaScript
 * arrives. That only holds if applying one filter preserves the others, which
 * is what this does.
 *
 * Pure and dependency-free so it can be unit tested without a request.
 */

export type QueryValues = Record<string, string | undefined>;

/**
 * Merge `patch` over `current` and render the resulting URL.
 *
 * A patch value of `undefined` removes the key — that is how a "clear this
 * filter" link is expressed. Keys are emitted in sorted order so the same set
 * of filters always produces byte-identical URLs, which keeps ISR from caching
 * two copies of one page under `?brand=mx-3&sort=name` and `?sort=name&brand=mx-3`.
 */
export function buildHref(
  pathname: string,
  current: QueryValues,
  patch: QueryValues = {},
): string {
  const merged: QueryValues = { ...current, ...patch };

  const params = new URLSearchParams();
  for (const key of Object.keys(merged).sort()) {
    const value = merged[key];
    if (value === undefined || value === '') continue;
    params.set(key, value);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Narrow Next's `searchParams` to single values.
 *
 * A repeated key (`?brand=a&brand=b`) arrives as an array. Every filter here is
 * single-valued, so the first entry wins rather than the request 400-ing —
 * a hand-edited URL should degrade, not break.
 */
export function firstValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
