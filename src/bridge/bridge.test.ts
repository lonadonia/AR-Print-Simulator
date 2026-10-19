import { describe, expect, it, vi } from 'vitest';
import { HostBridge, type BridgeStatus } from './hostBridge';
import { originAllowed, parseAllowedOrigins, parseOriginRule, targetOriginsForParent } from './origins';
import { PROTOCOL, PROTOCOL_VERSION, parseHostMessage, type HostMessage } from './protocol';

describe('origin allow-list', () => {
  const rules = parseAllowedOrigins('https://www.client-site.com, https://*.wixsite.com, http://localhost:5173, http://evil.com, nonsense');

  it('parses exact and wildcard rules and drops unsafe ones', () => {
    expect(rules).toHaveLength(3);
    expect(parseOriginRule('http://example.com')).toBeNull(); // plain http only for localhost
    expect(parseOriginRule('https://*.com')).toBeNull();
  });

  it('matches only allowed origins', () => {
    expect(originAllowed('https://www.client-site.com', rules)).toBe(true);
    expect(originAllowed('https://client.wixsite.com', rules)).toBe(true);
    expect(originAllowed('https://wixsite.com', rules)).toBe(false);
    expect(originAllowed('https://www.client-site.com.evil.io', rules)).toBe(false);
    expect(originAllowed('http://www.client-site.com', rules)).toBe(false);
    expect(originAllowed('null', rules)).toBe(false);
  });

  it('posts to one exact origin when the parent is known, never to "*"', () => {
    expect(targetOriginsForParent(rules, 'https://client.wixsite.com')).toEqual(['https://client.wixsite.com']);
    expect(targetOriginsForParent(rules, 'https://unknown.example')).toEqual(['https://www.client-site.com', 'http://localhost:5173']);
    expect(targetOriginsForParent(rules, null)).not.toContain('*');
  });
});

describe('protocol parsing', () => {
  it('accepts valid host messages (object or JSON string)', () => {
    const msg = { protocol: PROTOCOL, version: PROTOCOL_VERSION, type: 'catalog', requestId: 'r1', payload: { scenes: [] } };
    expect(parseHostMessage(msg)).toEqual({ type: 'catalog', requestId: 'r1', payload: { scenes: [] } });
    expect(parseHostMessage(JSON.stringify(msg))?.type).toBe('catalog');
  });

  it('rejects foreign, versioned-off or malformed messages', () => {
    expect(parseHostMessage({ type: 'catalog', payload: {} })).toBeNull();
    expect(parseHostMessage({ protocol: PROTOCOL, version: 99, type: 'catalog', payload: {} })).toBeNull();
    expect(parseHostMessage({ protocol: PROTOCOL, version: PROTOCOL_VERSION, type: 'catalog', payload: 'x' })).toBeNull();
    expect(parseHostMessage({ protocol: PROTOCOL, version: PROTOCOL_VERSION, type: 'eval', code: '1' })).toBeNull();
    expect(parseHostMessage('{not json')).toBeNull();
  });
});

/** Minimal fake window pair to exercise the handshake without a browser. */
function fakeWindows(parentOrigin: string) {
  const listeners: ((e: MessageEvent) => void)[] = [];
  const posted: { message: unknown; target: string }[] = [];
  const parent = { postMessage: (message: unknown, target: string) => posted.push({ message, target }) };
  const win = {
    parent,
    location: { ancestorOrigins: [parentOrigin] },
    document: { referrer: '' },
    addEventListener: (_: string, l: (e: MessageEvent) => void) => listeners.push(l),
    removeEventListener: () => undefined,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id: number) => clearTimeout(id),
  } as unknown as Window;
  const deliver = (data: unknown, origin: string, source: unknown = parent) =>
    listeners.forEach((l) => l({ data, origin, source } as unknown as MessageEvent));
  return { win, posted, deliver, parent };
}

describe('ready/catalog handshake', () => {
  it('repeats ready until answered, then accepts only the parent from an allowed origin', () => {
    vi.useFakeTimers();
    const { win, posted, deliver } = fakeWindows('https://www.client-site.com');
    const bridge = new HostBridge({ rules: parseAllowedOrigins('https://www.client-site.com'), win, retryIntervalMs: 1000 });
    const messages: HostMessage[] = [];
    const statuses: BridgeStatus[] = [];
    const blocked: string[] = [];
    bridge.start({ onMessage: (m) => messages.push(m), onStatus: (s) => statuses.push(s), onBlockedOrigin: (o) => blocked.push(o) });

    expect(posted).toHaveLength(1);
    expect(posted[0].target).toBe('https://www.client-site.com');
    const requestId = (posted[0].message as { requestId: string }).requestId;
    vi.advanceTimersByTime(2100);
    expect(posted.length).toBe(3); // re-announced while the page was not listening yet

    const answer = { protocol: PROTOCOL, version: PROTOCOL_VERSION, type: 'catalog', requestId, payload: { scenes: [] } };
    deliver(answer, 'https://attacker.example'); // wrong origin
    deliver(answer, 'https://www.client-site.com', {}); // wrong source window
    expect(messages).toHaveLength(0);
    expect(blocked).toEqual(['https://attacker.example']);

    deliver(answer, 'https://www.client-site.com');
    expect(messages).toHaveLength(1);
    expect(statuses.at(-1)).toEqual({ state: 'connected', origin: 'https://www.client-site.com' });
    vi.advanceTimersByTime(5000);
    expect(posted.length).toBe(3); // stopped announcing after the answer
    bridge.dispose();
    vi.useRealTimers();
  });

  it('times out with a recoverable status when the page never answers', () => {
    vi.useFakeTimers();
    const { win } = fakeWindows('https://www.client-site.com');
    const bridge = new HostBridge({ rules: parseAllowedOrigins('https://www.client-site.com'), win, retryIntervalMs: 100, maxAttempts: 3 });
    const statuses: BridgeStatus[] = [];
    bridge.start({ onMessage: () => undefined, onStatus: (s) => statuses.push(s) });
    vi.advanceTimersByTime(1000);
    expect(statuses.at(-1)).toEqual({ state: 'timeout' });
    bridge.dispose();
    vi.useRealTimers();
  });
});
