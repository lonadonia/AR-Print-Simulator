import { useSyncExternalStore } from 'react';
import { ImageLoadError, loadRemoteImage, type ImagePurpose, type LoadedImage } from './loadImage';

export type ImageEntry =
  | { status: 'loading' }
  | { status: 'ready'; image: LoadedImage }
  | { status: 'error'; error: ImageLoadError | Error };

/**
 * Keeps decoded working images (room photos and artwork) keyed by a stable id, so every print
 * area that uses the same artwork shares one bitmap and one GPU texture.
 */
class ImageStore {
  private entries = new Map<string, ImageEntry>();
  private listeners = new Set<() => void>();
  private version = 0;
  private controllers = new Map<string, AbortController>();
  maxTextureSize = 4096;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = () => this.version;

  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  get(key: string): ImageEntry | undefined {
    return this.entries.get(key);
  }

  ready(key: string): LoadedImage | null {
    const e = this.entries.get(key);
    return e?.status === 'ready' ? e.image : null;
  }

  /** Starts loading a catalog image unless it is already loading or loaded. */
  ensureRemote(key: string, url: string, purpose: ImagePurpose): void {
    const existing = this.entries.get(key);
    if (existing && existing.status !== 'error') return;
    if (existing) return; // errors stay until retry() so the UI can show them
    this.load(key, url, purpose);
  }

  retry(key: string, url: string, purpose: ImagePurpose): void {
    this.entries.delete(key);
    this.load(key, url, purpose);
  }

  private load(key: string, url: string, purpose: ImagePurpose) {
    const controller = new AbortController();
    this.controllers.set(key, controller);
    this.entries.set(key, { status: 'loading' });
    this.emit();
    loadRemoteImage(url, purpose, this.maxTextureSize, controller.signal)
      .then((image) => {
        if (this.controllers.get(key) !== controller) return;
        this.entries.set(key, { status: 'ready', image });
      })
      .catch((error: unknown) => {
        if (this.controllers.get(key) !== controller) return;
        this.entries.set(key, { status: 'error', error: error instanceof Error ? error : new Error(String(error)) });
      })
      .finally(() => {
        if (this.controllers.get(key) === controller) this.controllers.delete(key);
        this.emit();
      });
  }

  putLocal(key: string, image: LoadedImage): void {
    this.release(key, false);
    this.entries.set(key, { status: 'ready', image });
    this.emit();
  }

  /** Drops an image and frees its bitmap memory right away. */
  release(key: string, notify = true): void {
    this.controllers.get(key)?.abort();
    this.controllers.delete(key);
    const e = this.entries.get(key);
    if (e?.status === 'ready') {
      e.image.canvas.width = 0;
      e.image.canvas.height = 0;
    }
    if (this.entries.delete(key) && notify) this.emit();
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }
}

export const imageStore = new ImageStore();

/** Re-renders the caller whenever any image finishes loading or is released. */
export function useImageStore(): number {
  return useSyncExternalStore(imageStore.subscribe, imageStore.getVersion, imageStore.getVersion);
}
