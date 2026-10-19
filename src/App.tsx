import { useEffect } from 'react';
import type { Theme } from './catalog/types';
import { config } from './config';
import { Editor } from './Editor';
import { useCatalog } from './hooks/useCatalog';
import { StatusScreen } from './ui/StatusScreen';

/** Applies the optional theme sent by the Wix page (accent colour, font, corner radius). */
function useTheme(theme: Theme | null | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    const set = (name: string, value: string | undefined) => (value ? root.style.setProperty(name, value) : root.style.removeProperty(name));
    set('--rv-accent', theme?.accent);
    set('--rv-accent-ink', theme?.accentText);
    set('--rv-font', theme?.fontFamily);
    set('--rv-radius', theme?.radius !== undefined ? `${theme.radius}px` : undefined);
  }, [theme]);
}

export function App() {
  const { state, retry, continueWithoutCatalog, blockedOrigins } = useCatalog();
  useTheme(state.status === 'ready' ? state.catalog.theme : null);

  useEffect(() => {
    document.title = config.appTitle;
  }, []);

  if (state.status === 'loading') return <StatusScreen loading title={config.appTitle} message={state.detail} />;
  if (state.status === 'error') {
    return (
      <StatusScreen
        title={state.title}
        message={state.message}
        onRetry={state.canRetry ? retry : undefined}
        onContinue={continueWithoutCatalog}
        diagnostics={blockedOrigins.length ? blockedOrigins.map((o) => `Ignored messages from ${o} (not in VITE_ALLOWED_PARENT_ORIGINS).`) : undefined}
      />
    );
  }
  const unavailable = state.catalog.source === 'wix' && state.rejected.some((r) => r.collection === 'catalog' && r.reason === 'unavailable');
  return <Editor catalog={state.catalog} catalogUnavailable={unavailable} />;
}
