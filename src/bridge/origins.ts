/**
 * Origin allow-list handling for the Wix page ⇄ editor messaging channel.
 *
 * Entries are exact origins (`https://www.example.com`) or a leading-wildcard host
 * (`https://*.wixsite.com`). Wildcards are accepted when *checking* incoming messages; outgoing
 * messages always use one exact target origin, because `postMessage` does not accept patterns.
 */

export interface OriginRule {
  scheme: 'https:' | 'http:';
  host: string; // lower-case host[:port]; for wildcards, the suffix without "*."
  wildcard: boolean;
}

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

export function parseOriginRule(entry: string): OriginRule | null {
  const m = /^(https?):\/\/(\*\.)?([a-z0-9.-]+(?::\d{1,5})?)$/i.exec(entry.trim());
  if (!m) return null;
  const scheme = `${m[1].toLowerCase()}:` as OriginRule['scheme'];
  const host = m[3].toLowerCase();
  // Plain http is only allowed for local development harnesses.
  if (scheme === 'http:' && !LOCAL_HOSTS.test(host)) return null;
  if (m[2] && !host.includes('.')) return null;
  return { scheme, host, wildcard: Boolean(m[2]) };
}

export function parseAllowedOrigins(csv: string | undefined): OriginRule[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map((s) => parseOriginRule(s))
    .filter((r): r is OriginRule => r !== null);
}

export function originAllowed(origin: string, rules: readonly OriginRule[]): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false; // reject anything with a path, credentials etc.
  const host = url.host.toLowerCase();
  return rules.some((r) => {
    if (url.protocol !== r.scheme) return false;
    if (r.wildcard) return host.endsWith(`.${r.host}`);
    return host === r.host;
  });
}

export function exactOrigins(rules: readonly OriginRule[]): string[] {
  return rules.filter((r) => !r.wildcard).map((r) => `${r.scheme}//${r.host}`);
}

/** Best-effort origin of the embedding page (ancestorOrigins where supported, else the referrer). */
export function detectParentOrigin(win: Window = window): string | null {
  try {
    const ancestors = win.location.ancestorOrigins;
    if (ancestors && ancestors.length > 0 && ancestors[0] && ancestors[0] !== 'null') return ancestors[0];
  } catch {
    /* not supported */
  }
  try {
    if (win.document.referrer) return new URL(win.document.referrer).origin;
  } catch {
    /* malformed referrer */
  }
  return null;
}

/**
 * Exact target origins for messages to the parent. If the parent origin is known and allowed we
 * use only that one; otherwise each exact allowed origin is tried (non-matching targets are
 * silently dropped by the browser, so nothing leaks to an unexpected page).
 */
export function targetOriginsForParent(rules: readonly OriginRule[], detected: string | null): string[] {
  if (detected && originAllowed(detected, rules)) return [detected];
  return exactOrigins(rules);
}
