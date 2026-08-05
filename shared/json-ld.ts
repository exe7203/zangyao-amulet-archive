/**
 * Serializes JSON-LD for an inline script without allowing stored content to
 * terminate the script element. U+2028 and U+2029 are escaped as well so the
 * result remains safe for JavaScript-aware HTML tooling.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
