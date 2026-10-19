/**
 * Message protocol between the Wix page code (Velo) and the editor running in the HTML iframe
 * element. Keep in sync with `wix/velo/room-visualizer-page.js`.
 *
 * Handshake:
 *   editor → page  { protocol, version, type: 'ready', requestId }        (repeated until answered)
 *   page → editor  { protocol, version, type: 'catalog', requestId, payload }
 *              or  { protocol, version, type: 'catalog-error', requestId, message }
 *   editor → page  { protocol, version, type: 'retry-catalog', requestId } (user pressed Retry)
 *   editor → page  { protocol, version, type: 'catalog-received', requestId, counts } (acknowledgement)
 */

export const PROTOCOL = 'uv-room-visualizer';
export const PROTOCOL_VERSION = 1;

export type EditorMessage =
  | { protocol: typeof PROTOCOL; version: number; type: 'ready'; requestId: string }
  | { protocol: typeof PROTOCOL; version: number; type: 'retry-catalog'; requestId: string }
  | {
      protocol: typeof PROTOCOL;
      version: number;
      type: 'catalog-received';
      requestId: string;
      counts: { scenes: number; artwork: number; materials: number; categories: number; rejected: number };
    };

export type HostMessage =
  | { type: 'catalog'; requestId: string | null; payload: unknown }
  | { type: 'catalog-error'; requestId: string | null; message: string };

/** Hard cap on accepted catalog message size (characters of JSON) to avoid memory abuse. */
export const MAX_MESSAGE_CHARS = 5_000_000;

export function makeEditorMessage<T extends EditorMessage['type']>(
  type: T,
  requestId: string,
  extra: Omit<Extract<EditorMessage, { type: T }>, 'protocol' | 'version' | 'type' | 'requestId'>,
): EditorMessage {
  return { protocol: PROTOCOL, version: PROTOCOL_VERSION, type, requestId, ...extra } as EditorMessage;
}

/** Parses and validates a message from the host page. Returns null for anything unexpected. */
export function parseHostMessage(data: unknown): HostMessage | null {
  let value = data;
  if (typeof value === 'string') {
    if (value.length > MAX_MESSAGE_CHARS) return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const m = value as Record<string, unknown>;
  if (m.protocol !== PROTOCOL) return null;
  if (m.version !== PROTOCOL_VERSION) return null;
  const requestId = typeof m.requestId === 'string' && m.requestId.length <= 64 ? m.requestId : null;
  if (m.type === 'catalog') {
    if (typeof m.payload !== 'object' || m.payload === null) return null;
    return { type: 'catalog', requestId, payload: m.payload };
  }
  if (m.type === 'catalog-error') {
    const message = typeof m.message === 'string' ? m.message.slice(0, 300) : 'The site could not load the visualizer content.';
    return { type: 'catalog-error', requestId, message };
  }
  return null;
}
