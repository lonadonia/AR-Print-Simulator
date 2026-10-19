import { useCallback, useEffect, useRef, useState } from 'react';
import { HostBridge, type BridgeStatus } from '../bridge/hostBridge';
import { buildDemoCatalog } from '../catalog/demoCatalog';
import { parseCatalog, type RejectedItem } from '../catalog/schema';
import type { Catalog } from '../catalog/types';
import { config } from '../config';

export type CatalogState =
  | { status: 'loading'; detail: string }
  | { status: 'ready'; catalog: Catalog; rejected: RejectedItem[] }
  | { status: 'error'; title: string; message: string; canRetry: boolean };

const EMPTY_WIX_CATALOG: Catalog = { source: 'wix', categories: [], scenes: [], artwork: [], materials: [], theme: null };

/**
 * Production: waits for the Wix page code to send the catalog through the iframe bridge.
 * Demo builds: uses the bundled sample content (explicitly labelled as demo in the UI).
 * A failed production load is reported honestly; it never falls back to demo content.
 */
export function useCatalog(): {
  state: CatalogState;
  retry: () => void;
  continueWithoutCatalog: () => void;
  blockedOrigins: string[];
  connectedOrigin: string | null;
} {
  const [state, setState] = useState<CatalogState>(() =>
    config.catalogSource === 'demo'
      ? (() => {
          const { catalog, rejected } = buildDemoCatalog(document.baseURI);
          return { status: 'ready', catalog, rejected } as CatalogState;
        })()
      : { status: 'loading', detail: 'Connecting to the website…' },
  );
  const [blockedOrigins, setBlocked] = useState<string[]>([]);
  const [connectedOrigin, setConnectedOrigin] = useState<string | null>(null);
  const bridgeRef = useRef<HostBridge | null>(null);

  useEffect(() => {
    if (config.catalogSource !== 'wix') return;
    const bridge = new HostBridge({ rules: config.parentOrigins });
    bridgeRef.current = bridge;
    const onStatus = (s: BridgeStatus) => {
      switch (s.state) {
        case 'waiting':
          setState((prev) =>
            prev.status === 'ready' ? prev : { status: 'loading', detail: s.attempts > 3 ? 'Still waiting for the website to send the visualizer content…' : 'Loading rooms, artwork and materials…' },
          );
          break;
        case 'connected':
          setConnectedOrigin(s.origin);
          break;
        case 'timeout':
          setState({
            status: 'error',
            title: 'The visualizer content did not arrive',
            message: 'The website page did not answer. This usually means the page code is not installed or the page is still loading.',
            canRetry: true,
          });
          break;
        case 'not-embedded':
          setState({
            status: 'error',
            title: 'Open the visualizer from the website',
            message: 'This editor gets its rooms, artwork and materials from the website it is installed on. Please open it from that page.',
            canRetry: false,
          });
          break;
        case 'misconfigured':
          setState({ status: 'error', title: 'The visualizer is not configured', message: s.reason, canRetry: false });
          break;
      }
    };
    bridge.start({
      onStatus,
      onBlockedOrigin: (origin) => setBlocked((prev) => (prev.includes(origin) ? prev : [...prev, origin].slice(-5))),
      onMessage: (message) => {
        if (message.type === 'catalog-error') {
          setState({ status: 'error', title: 'The visualizer content could not be loaded', message: message.message, canRetry: true });
          return;
        }
        const { catalog, rejected } = parseCatalog(message.payload, {
          source: 'wix',
          allowedImageHosts: config.imageHosts,
          allowRelativeUrls: false,
          baseUrl: document.baseURI,
        });
        if (rejected.length) console.warn('[visualizer] catalog items skipped', rejected);
        bridge.acknowledge({
          scenes: catalog.scenes.length,
          artwork: catalog.artwork.length,
          materials: catalog.materials.length,
          categories: catalog.categories.length,
          rejected: rejected.length,
        });
        setState({ status: 'ready', catalog, rejected });
      },
    });
    return () => {
      bridge.dispose();
      bridgeRef.current = null;
    };
  }, []);

  const retry = useCallback(() => {
    setState({ status: 'loading', detail: 'Trying again…' });
    bridgeRef.current?.retry();
  }, []);

  const continueWithoutCatalog = useCallback(() => {
    setState({ status: 'ready', catalog: EMPTY_WIX_CATALOG, rejected: [{ collection: 'catalog', id: null, reason: 'unavailable' }] });
  }, []);

  return { state, retry, continueWithoutCatalog, blockedOrigins, connectedOrigin };
}
