# 05 — GitHub / Vercel handoff

```
Project: UV Printing Room Visualizer for Wix (photo visualizer)
Implementation: BUILT — editor and Wix integration package complete; installation on the
                client's Wix site PENDING ACCESS (see docs/PROPOSAL_COST_TIMELINE.md)
Stack: Vite 7.3.7 + React 19.2.9 + TypeScript 5.9.3, WebGL renderer; npm 10 with package-lock.json
Local path: /home/user/AR-Print-Simulator (cloud session workspace)
Local build: PASS — `npm run build` (Wix mode) and `npm run build:demo`
Checks: typecheck PASS, lint PASS, unit 32/32 PASS, e2e 18/18 PASS (Chromium; see docs/VERIFICATION_REPORT.md)
GitHub status: PUSHED
GitHub repo URL: https://github.com/lonadonia/AR-Print-Simulator
Visibility: not verified from this session (check the repository settings)
Branch: claude/dreamy-clarke-5fvq5e
Commit SHA (deployed code): b829ad717307e6c1441f206baaf195c3e4cab2fe
Vercel readiness: VERIFIED_READY — static Vite build, no vercel.json needed, no secrets
Vercel deployment: DEPLOYED (demo build), HTTP 200 for index.html and assets verified via the
                   Vercel API; not opened in a browser from this environment (vercel.app is
                   blocked by the session's network policy). The same commit was verified
                   visually and with e2e tests locally.
Vercel project: uv-room-visualizer-demo (team "hakim's projects")
Vercel URL: https://uv-room-visualizer-demo.vercel.app
            (deployment: https://uv-room-visualizer-demo-roajn6paw-hakims-projects-8cc34b62.vercel.app)
Deployment target: Vercel recorded it as the project's "production" deployment because the
                   pushed branch is the repository's only (default) branch. It is a new,
                   demo-only project with no custom domain; no client production system exists
                   or was changed.
Access: Vercel Authentication (SSO protection, "all except custom domains") is ON for this
        project, so the URL opens only for logged-in members of the Vercel team. To share it
        with judges/the client, disable it in Vercel → Project → Settings → Deployment
        Protection (owner decision).
Environment keys (names only): VITE_CATALOG_SOURCE, VITE_ALLOWED_PARENT_ORIGINS,
                               VITE_ALLOWED_IMAGE_HOSTS, VITE_APP_TITLE
                               (demo deployment uses the committed .env.demo via `npm run build:demo`)
Unresolved blockers: client Wix site access; client content/brand; hosting plan decision
                     (Vercel Hobby is non-commercial); real-device and non-Chromium browser tests
Next user action: 1) decide whether the demo URL should be public; 2) obtain Wix site access;
                  3) choose production hosting; 4) follow docs/WIX_INTEGRATION.md
```

## Vercel settings used

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Install command | `npm ci` |
| Build command | `npm run build:demo` (demo) — use `npm run build` + `VITE_*` env vars for the Wix production build |
| Output directory | `dist` |
| Node.js | 24.x selected by Vercel from `engines` (project setting 22.x was overridden; build passed) |

For the client's production editor create a separate project (or environment) with
`VITE_CATALOG_SOURCE=wix` and the real `VITE_ALLOWED_PARENT_ORIGINS`, on a plan that permits
commercial use.
