import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Point } from '../geometry/polygon';
import { imageFromSource, type LoadedImage } from '../imaging/loadImage';
import { Icon } from './icons';

/**
 * Camera capture for the room photo.
 *
 * Opens the device camera in the page (getUserMedia) with framing aids — a thirds grid, a
 * level indicator (where the device reports orientation), torch and front/back switching.
 * Tapping the live view captures the frame *and* remembers the tapped point, so the editor can
 * select that surface immediately. When live camera access is not possible (permission denied,
 * no camera, or the embedding page does not allow camera use in its iframe) the phone's own
 * camera app can still be used through the file picker.
 *
 * This is photo capture — the preview is not tracked live AR.
 */

export interface CameraResult {
  image: LoadedImage;
  /** Tapped point in the captured photo (normalized), if the user tapped the view to capture. */
  tap: Point | null;
}

type Status = { kind: 'starting' } | { kind: 'live' } | { kind: 'unavailable'; message: string };

interface Props {
  open: boolean;
  onClose: () => void;
  onCapture: (result: CameraResult) => void;
  onFile: (file: File) => void;
  maxTextureSize: number;
}

function cameraBlockedReason(): string | null {
  if (typeof window === 'undefined') return 'No browser window.';
  if (!window.isSecureContext) return 'The camera can only be used on a secure (HTTPS) page.';
  if (!navigator.mediaDevices?.getUserMedia) return 'This browser does not offer camera access to web pages.';
  const doc = document as Document & {
    permissionsPolicy?: { allowsFeature(f: string): boolean };
    featurePolicy?: { allowsFeature(f: string): boolean };
  };
  const policy = doc.permissionsPolicy ?? doc.featurePolicy;
  try {
    if (policy && !policy.allowsFeature('camera')) return 'The page this visualizer is embedded in does not allow live camera access.';
  } catch {
    /* unsupported policy API */
  }
  return null;
}

function errorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was not allowed. You can allow it in the browser settings, or use your camera app below.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'The camera is in use by another app. Close it and try again.';
  return 'The camera could not be started.';
}

export function CameraCapture({ open, onClose, onCapture, onFile, maxTextureSize }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'starting' });
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [multiCam, setMultiCam] = useState(false);
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({ supported: false, on: false });
  const [grid, setGrid] = useState(true);
  const [roll, setRoll] = useState<number | null>(null);
  const [needsMotionPermission, setNeedsMotionPermission] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Start / restart the stream.
  useEffect(() => {
    if (!open) {
      stop();
      return;
    }
    const blocked = cameraBlockedReason();
    if (blocked) {
      setStatus({ kind: 'unavailable', message: blocked });
      return;
    }
    let cancelled = false;
    setStatus({ kind: 'starting' });
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stop();
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => undefined);
        }
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorch({ supported: Boolean(caps.torch), on: false });
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          setMultiCam(devices.filter((d) => d.kind === 'videoinput').length > 1);
        } catch {
          setMultiCam(false);
        }
        setStatus({ kind: 'live' });
      })
      .catch((err) => !cancelled && setStatus({ kind: 'unavailable', message: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [open, facing, stop]);

  useEffect(() => () => stop(), [stop]);

  // Level indicator from device orientation (where available).
  useEffect(() => {
    if (!open) return;
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (DOE && typeof DOE.requestPermission === 'function') setNeedsMotionPermission(true);
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      const angle = (screen.orientation?.angle ?? 0) % 180;
      setRoll(angle === 0 ? e.gamma : e.beta);
    };
    window.addEventListener('deviceorientation', onOrient);
    return () => window.removeEventListener('deviceorientation', onOrient);
  }, [open]);

  const requestMotion = async () => {
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    try {
      if ((await DOE.requestPermission?.()) === 'granted') setNeedsMotionPermission(false);
    } catch {
      setNeedsMotionPermission(false);
    }
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch.on } as MediaTrackConstraintSet] });
      setTorch((t) => ({ ...t, on: !t.on }));
    } catch {
      setTorch({ supported: false, on: false });
    }
  };

  const capture = (tap: Point | null) => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    try {
      const image = imageFromSource(v, v.videoWidth, v.videoHeight, 'room', maxTextureSize);
      setFlash(true);
      window.setTimeout(() => setFlash(false), 180);
      stop();
      onCapture({ image, tap });
    } catch {
      setStatus({ kind: 'unavailable', message: 'The photo could not be captured. Please try again.' });
    }
  };

  /** Maps a tap on the cover-fitted (and, for the front camera, mirrored) preview into the frame. */
  const onTapView = (e: ReactPointerEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || status.kind !== 'live' || !v.videoWidth) return;
    const rect = v.getBoundingClientRect();
    const scale = Math.max(rect.width / v.videoWidth, rect.height / v.videoHeight);
    const dw = v.videoWidth * scale;
    const dh = v.videoHeight * scale;
    let x = (e.clientX - rect.left - (rect.width - dw) / 2) / dw;
    const y = (e.clientY - rect.top - (rect.height - dh) / 2) / dh;
    if (facing === 'user') x = 1 - x;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    capture({ x, y });
  };

  const level = roll === null ? null : Math.abs(roll) < 1.5;

  return (
    <dialog ref={dialogRef} className="rv-camera" aria-label="Camera" onClose={onClose} onCancel={onClose}>
      <div className="rv-camera__view" onPointerUp={onTapView}>
        <video ref={videoRef} className={`rv-camera__video${facing === 'user' ? ' is-mirrored' : ''}`} playsInline muted autoPlay aria-label="Live camera view" />
        {grid && status.kind === 'live' && <div className="rv-camera__grid" aria-hidden="true" />}
        {roll !== null && status.kind === 'live' && (
          <div className={`rv-camera__level${level ? ' is-level' : ''}`} aria-live="polite">
            <span className="rv-camera__horizon" style={{ transform: `rotate(${-roll}deg)` }} aria-hidden="true" />
            <span className="rv-camera__levelText">{level ? 'Level' : `${Math.round(roll)}°`}</span>
          </div>
        )}
        {flash && <div className="rv-camera__flash" aria-hidden="true" />}
        {status.kind === 'starting' && (
          <div className="rv-camera__msg" role="status">
            <span className="rv-spinner" aria-hidden="true" /> Starting the camera…
          </div>
        )}
        {status.kind === 'unavailable' && (
          <div className="rv-camera__msg rv-camera__msg--card" role="alert">
            <Icon name="camera" size={28} />
            <p>{status.message}</p>
            <button type="button" className="rv-btn rv-btn--primary" onClick={() => fileRef.current?.click()}>
              <Icon name="camera" />
              <span>Take a photo with the camera app</span>
            </button>
          </div>
        )}
      </div>

      <div className="rv-camera__top">
        <button type="button" className="rv-camera__icon" onClick={onClose} aria-label="Close camera">
          <Icon name="close" />
        </button>
        <span className="rv-camera__title">Room camera</span>
        <span className="rv-camera__spacer" />
        {status.kind === 'live' && (
          <>
            <button type="button" className={`rv-camera__icon${grid ? ' is-on' : ''}`} onClick={() => setGrid((g) => !g)} aria-pressed={grid} aria-label="Framing grid">
              <Icon name="frame" />
            </button>
            {torch.supported && (
              <button type="button" className={`rv-camera__icon${torch.on ? ' is-on' : ''}`} onClick={toggleTorch} aria-pressed={torch.on} aria-label="Torch">
                <Icon name="bolt" />
              </button>
            )}
            {multiCam && (
              <button type="button" className="rv-camera__icon" onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} aria-label="Switch camera">
                <Icon name="switch" />
              </button>
            )}
          </>
        )}
      </div>

      <div className="rv-camera__bottom">
        <p className="rv-camera__hint">
          {status.kind === 'live'
            ? 'Stand square to the surface and keep it all in view. Tap the surface to capture and select it, or press the shutter.'
            : 'You can also take the photo with your camera app.'}
        </p>
        {needsMotionPermission && status.kind === 'live' && (
          <button type="button" className="rv-camera__link" onClick={requestMotion}>
            Show level indicator
          </button>
        )}
        <div className="rv-camera__controls">
          <button type="button" className="rv-camera__link" onClick={() => fileRef.current?.click()}>
            Camera app
          </button>
          <button type="button" className="rv-camera__shutter" onClick={() => capture(null)} disabled={status.kind !== 'live'} aria-label="Capture photo">
            <span />
          </button>
          <span className="rv-camera__link rv-camera__link--ghost" aria-hidden="true">
            Camera app
          </span>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="rv-visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) {
            stop();
            onFile(file);
          }
        }}
      />
    </dialog>
  );
}
