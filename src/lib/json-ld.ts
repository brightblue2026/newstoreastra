/**
 * Safely serialises a JSON-LD object for a `<script type="application/ld+json">`
 * tag.
 *
 * `JSON.stringify` alone is not enough: a stored field that contains the
 * literal text `</script>` — a product name, a description, anything an
 * admin can type — closes the script tag early and turns whatever follows
 * into live, executable HTML. Escaping `<` to its unicode form breaks that
 * sequence while leaving valid JSON valid; browsers un-escape it identically
 * either way, so no crawler or rich-result parser sees a difference.
 */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
