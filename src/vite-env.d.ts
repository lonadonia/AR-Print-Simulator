/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CATALOG_SOURCE?: string;
  readonly VITE_ALLOWED_PARENT_ORIGINS?: string;
  readonly VITE_ALLOWED_IMAGE_HOSTS?: string;
  readonly VITE_APP_TITLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
