import { detectParentOrigin, originAllowed, targetOriginsForParent, type OriginRule } from './origins';
import { makeEditorMessage, parseHostMessage, type EditorMessage, type HostMessage } from './protocol';

export type BridgeStatus =
  | { state: 'waiting'; attempts: number }
  | { state: 'connected'; origin: string }
  | { state: 'timeout' }
  | { state: 'not-embedded' }
  | { state: 'misconfigured'; reason: string };

export interface BridgeCallbacks {
  onMessage(message: HostMessage, origin: string): void;
  onStatus(status: BridgeStatus): void;
  /** Called for messages from origins that are not on the allow-list (for installer diagnostics). */
  onBlockedOrigin?(origin: string): void;
}

export interface BridgeOptions {
  rules: readonly OriginRule[];
  /** Interval between repeated `ready` announcements until the page answers. */
  retryIntervalMs?: number;
  maxAttempts?: number;
  win?: Window;
}

function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Editor side of the Wix messaging channel.
 *
 * The editor announces `ready` and repeats the announcement on a fixed interval until the page
 * code answers, so initialisation does not depend on which side loads first. Incoming messages
 * are accepted only from `window.parent` and from allow-listed origins.
 */
export class HostBridge {
  private readonly win: Window;
  private readonly rules: readonly OriginRule[];
  private readonly retryIntervalMs: number;
  private readonly maxAttempts: number;
  private timer: number | null = null;
  private attempts = 0;
  private requestId = randomId();
  private connectedOrigin: string | null = null;
  private answered = false;
  private callbacks: BridgeCallbacks | null = null;
  private readonly listener = (event: MessageEvent) => this.handle(event);

  constructor(options: BridgeOptions) {
    this.win = options.win ?? window;
    this.rules = options.rules;
    this.retryIntervalMs = options.retryIntervalMs ?? 1500;
    this.maxAttempts = options.maxAttempts ?? 20;
  }

  start(callbacks: BridgeCallbacks): void {
    this.callbacks = callbacks;
    if (this.win.parent === this.win) {
      callbacks.onStatus({ state: 'not-embedded' });
      return;
    }
    if (this.rules.length === 0) {
      callbacks.onStatus({ state: 'misconfigured', reason: 'No allowed parent origins are configured (VITE_ALLOWED_PARENT_ORIGINS).' });
      return;
    }
    this.win.addEventListener('message', this.listener);
    this.announce('ready');
  }

  /** Ask the page to load the catalog again (after an error or timeout). */
  retry(): void {
    if (!this.callbacks || this.win.parent === this.win || this.rules.length === 0) return;
    this.requestId = randomId();
    this.answered = false;
    this.attempts = 0;
    this.announce('retry-catalog');
  }

  acknowledge(counts: Extract<EditorMessage, { type: 'catalog-received' }>['counts']): void {
    this.post(makeEditorMessage('catalog-received', this.requestId, { counts }));
  }

  dispose(): void {
    this.stopTimer();
    this.win.removeEventListener('message', this.listener);
    this.callbacks = null;
  }

  private announce(type: 'ready' | 'retry-catalog'): void {
    this.stopTimer();
    const tick = () => {
      if (this.answered || !this.callbacks) return;
      if (this.attempts >= this.maxAttempts) {
        this.callbacks.onStatus({ state: 'timeout' });
        return;
      }
      this.attempts += 1;
      this.callbacks.onStatus({ state: 'waiting', attempts: this.attempts });
      this.post(makeEditorMessage(this.attempts === 1 ? type : 'ready', this.requestId, {}));
      this.timer = this.win.setTimeout(tick, this.retryIntervalMs);
    };
    tick();
  }

  private post(message: EditorMessage): void {
    const targets = this.connectedOrigin ? [this.connectedOrigin] : targetOriginsForParent(this.rules, detectParentOrigin(this.win));
    for (const target of targets) {
      try {
        this.win.parent.postMessage(message, target);
      } catch {
        /* invalid target origin — ignore */
      }
    }
  }

  private handle(event: MessageEvent): void {
    if (!this.callbacks) return;
    if (event.source !== this.win.parent) return;
    if (!originAllowed(event.origin, this.rules)) {
      this.callbacks.onBlockedOrigin?.(event.origin);
      return;
    }
    const message = parseHostMessage(event.data);
    if (!message) return;
    // Ignore stale answers to an earlier request (the page echoes requestId when it can).
    if (message.requestId && message.requestId !== this.requestId) return;
    this.answered = true;
    this.stopTimer();
    this.connectedOrigin = event.origin;
    this.callbacks.onStatus({ state: 'connected', origin: event.origin });
    this.callbacks.onMessage(message, event.origin);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      this.win.clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
