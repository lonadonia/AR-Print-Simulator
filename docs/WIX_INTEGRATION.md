# Wix integration

**Status: integration code written; installation on the client's real Wix site is PENDING ACCESS.**
The site URL, editor type (Wix Editor or Wix Studio), plan and collaborator access were not
provided. Everything below was exercised against a local simulator (`wix/harness/`) that uses the
browser's real cross-origin messaging, not against Wix itself.

Wix documentation used (re-check against the live site before installing; the docs hosts were not
reachable from the build environment, so these were consulted through search summaries of the
official pages):

- Wix Studio — Adding an HTML iFrame Element: <https://support.wix.com/en/article/studio-editor-adding-an-html-iframe-element>
- Velo — Messaging between a site page and an HTML element: <https://dev.wix.com/docs/velo/velo-only-apis/$w/html-component/messaging-between-a-site-page-and-an-html-element>
- Velo — `$w.HtmlComponent.onMessage()` / `postMessage()`: <https://dev.wix.com/docs/velo/velo-only-apis/$w/html-component/on-message>
- Wix CMS — Collection permissions: <https://support.wix.com/en/article/how-do-i-work-with-data-permissions>
- Velo — `wix-data` query `limit()` (max 1000), `hasNext()`, `next()`

## Chosen route

One route only: **HTML iFrame element (website address mode) + Velo page code.**

```
Wix page (Velo page code)                          Editor (this app, HTTPS host)
  wix-data: read 4 collections  ──────────┐
  $w('#roomVisualizer').onMessage  ◄──────┼────── { type: 'ready', requestId }   (repeated until answered)
  $w('#roomVisualizer').postMessage ──────┴─────► { type: 'catalog', requestId, payload }
                                                   { type: 'catalog-error', message }
                                     ◄──────────── { type: 'catalog-received', counts }
```

Why: the editor is a self-contained app that needs WebGL and file pickers; an iframe isolates it
from the Wix page DOM, the documented messaging API is the supported way to pass data in, and
catalog reads stay on the Wix side using the site's own collection permissions. No CMS
credentials or tokens exist in the editor bundle.

## Installation steps

1. **Host the editor build** on an HTTPS host the owner controls (see `README.md → Deployment`):
   ```bash
   VITE_CATALOG_SOURCE=wix \
   VITE_ALLOWED_PARENT_ORIGINS=https://www.client-domain.com,https://client.wixsite.com \
   npm run build
   ```
   Put every origin the page is served from in `VITE_ALLOWED_PARENT_ORIGINS` (custom domain with
   and without `www` if both resolve, the free `*.wixsite.com` address if used). If the host sends
   a `Content-Security-Policy`, include `frame-ancestors` for the same origins.
2. **Create the CMS collections** described in [`WIX_CMS_SCHEMA.md`](WIX_CMS_SCHEMA.md) and set
   their permissions (read: anyone; write: admin/collaborators only).
3. **Add the element.** In the Wix editor: *Add → Embed code → Embed a site* (Wix Editor) or
   *Add → Embed → HTML iFrame* (Wix Studio). Choose **Website address**, paste the HTTPS URL of
   the hosted editor, and set the element ID to **`roomVisualizer`** (Properties panel / Dev Mode).
4. **Size the element.** Suggested: full content width; height about **780–860 px on desktop** and
   **680–760 px on mobile** (set separately in the mobile view). The editor fills the frame and
   scrolls its own control panel; it cannot enlarge a frame that is too small, so check that the
   bottom controls are reachable on a phone.
5. **Add the page code.** Enable Dev Mode / open the Code panel, select this page's code file and
   paste [`wix/velo/room-visualizer-page.js`](../wix/velo/room-visualizer-page.js). Adjust
   `ELEMENT_ID`, `COLLECTIONS` and optionally `THEME` (accent colour, font, radius) to match the site.
6. **Preview, then publish.** Wix preview may run on a different origin; if the editor shows
   *"The visualizer content did not arrive"* in preview, open *Details for the site owner* — it
   lists ignored origins — and add the needed origin to `VITE_ALLOWED_PARENT_ORIGINS` (rebuild).
7. **Test the published page as a logged-out visitor** (private window) on desktop and a real
   phone: rooms, artwork thumbnails and materials load; uploads work; areas can be edited by
   touch; nothing else on the page breaks.

## Messaging protocol (v1)

Defined in `src/bridge/protocol.ts`; mirrored in the Velo file.

| Direction | Message |
| --- | --- |
| editor → page | `{ protocol: 'uv-room-visualizer', version: 1, type: 'ready' \| 'retry-catalog', requestId }` |
| page → editor | `{ protocol, version, type: 'catalog', requestId, payload: { categories, scenes, artwork, materials, theme, features } }` |
| page → editor | `{ protocol, version, type: 'catalog-error', requestId, message }` |
| editor → page | `{ protocol, version, type: 'catalog-received', requestId, counts }` (informational) |

Safety rules implemented in the editor:

- Messages are accepted only when `event.source === window.parent` **and** `event.origin` is on the
  allow-list; protocol name, version and shape are validated; everything else is ignored.
- Outgoing messages use one exact target origin (detected parent origin if allowed, otherwise each
  allow-listed exact origin) — never `"*"`.
- The handshake repeats `ready` every 1.5 s (up to 20 times) so start-up does not depend on which
  side loads first; after that a recoverable *"did not arrive"* screen with *Try again* is shown.
- Every catalog field is validated (`src/catalog/schema.ts`): HTTPS image URLs from allowed hosts
  only, no credentials in URLs, strings length-limited, numbers clamped, unknown categories ignored,
  duplicates dropped. Text is rendered as text only.
- A failed or missing production catalog is reported honestly; the editor never substitutes demo
  content. Visitors can still continue with their own photo and artwork.

Velo note: the page code reads only `event.data` from `onMessage`; it does not rely on
`event.origin`/`event.source` because Velo wraps the event and the HTML element is the only sender.

## Images and cross-origin access

- CMS image fields (`wix:image://v1/<id>/…`) are converted in page code to
  `https://static.wixstatic.com/media/<id>`; thumbnails use the `/v1/fill/w_…,h_…/` transform.
  **Pending verification on the real site** (pattern from Wix community answers, not an official
  API). If thumbnails fail, set `USE_WIX_THUMBNAILS = false`; the editor already falls back to
  the full image when a thumbnail does not load.
- WebGL can only use images whose server allows cross-origin use (CORS). If Wix media does not
  send `Access-Control-Allow-Origin`, library images show *"the server does not allow this image to
  be used in the preview"*. **Pending verification.** No open proxy is used as a workaround.
- Customer uploads never leave the browser.

## Camera inside the Wix iframe

The *Camera* button opens a live viewfinder only when the browser allows camera access to the
editor's frame. A cross-origin iframe needs the embedding page to grant it
(`allow="camera"` on the iframe, plus HTTPS and the visitor's permission). Whether Wix's HTML iFrame
element grants camera access is **not verified** (it could not be tested without the site); the
editor does not assume it. It checks the frame's permissions policy before asking, and when live
access is not possible it says so and offers **"Take a photo with the camera app"** — a file input
with `capture="environment"` that opens the phone's own camera and returns the photo to the
editor. That path works inside iframes in the browsers tested here (Chromium). The local simulator
(`wix/harness/host.html`, iframe `allow="fullscreen"` only) reproduces the blocked case and is
covered by an end-to-end test. Set `FEATURES.camera = false` in the page code to hide the button.

Photos taken either way stay in the visitor's browser like uploads.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| "Open the visualizer from the website" | The production build was opened directly; open the Wix page instead. |
| "did not arrive" + ignored origins listed | Add the listed origin to `VITE_ALLOWED_PARENT_ORIGINS`, rebuild, redeploy. |
| "did not arrive", nothing listed | Page code missing, element ID not `roomVisualizer`, or page code error (see browser console / Wix logs). |
| "could not be loaded" | Collection names/permissions; the page code logs the wix-data error to the console. |
| Library images unavailable | Image field empty, file deleted, CORS (see above). |
| Controls cut off on phones | Increase the element height in the mobile editor. |
| Camera shows "does not allow live camera access" | Expected when the iframe is not granted camera access; visitors use "Take a photo with the camera app". |
| Download of "Save image" does not start | Some embedded pages block downloads from iframes; the dialog shows the image so it can be saved with right-click / long-press, and phones offer *Share*. |
