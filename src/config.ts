import { parseAllowedOrigins } from './bridge/origins';
import type { CatalogSource } from './catalog/types';

/**
 * Build-time configuration (Vite `VITE_*` variables). These values are compiled into the public
 * browser bundle — never put secrets here. See `.env.example`.
 */
const env = import.meta.env;

function list(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  catalogSource: (env.VITE_CATALOG_SOURCE === 'demo' ? 'demo' : 'wix') as CatalogSource,
  parentOrigins: parseAllowedOrigins(env.VITE_ALLOWED_PARENT_ORIGINS),
  imageHosts: list(env.VITE_ALLOWED_IMAGE_HOSTS).length ? list(env.VITE_ALLOWED_IMAGE_HOSTS) : ['static.wixstatic.com'],
  appTitle: (env.VITE_APP_TITLE as string | undefined)?.trim() || 'Room Visualizer',
  debug: typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug'),
};
