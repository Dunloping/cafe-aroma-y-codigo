/**
 * Vercel parses JSON and urlencoded bodies before the handler runs.
 * These helpers tolerate raw strings too (tests, custom runtimes).
 */
export function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return Object.fromEntries(new URLSearchParams(body));
    }
  }
  return typeof body === "object" ? body : null;
}

export function asText(value) {
  return typeof value === "string" ? value : "";
}

export function normalizeText(value) {
  return asText(value).replace(/\s+/g, " ").trim();
}
