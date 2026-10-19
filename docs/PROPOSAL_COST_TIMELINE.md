# Scope, completion state, cost and timeline disclosure

Prepared for the contest entry owner to review **before submission / winner selection**. Nothing
in this document has been agreed by the client. Figures marked *estimate* are planning numbers,
not guarantees.

## 1. What is delivered: photo visualization (not tracked live AR)

The solution is a **photo-based room visualizer**. Customers use a sample room, upload a photo of
their own space or take one with the device camera (an in-page viewfinder, or the phone's camera
app where the page does not allow live camera access). Everything is then edited on the **still
photo**. Surfaces are selected with assisted tools — *magic select* (colour/edge region growing
with obstacle cutouts and a perspective estimate) and snapping to corners and edges found in the
photo — and the customer confirms and refines them; this is image processing, not AI
segmentation, and it can miss soft corners between similar-coloured walls (the tolerance and the
add/subtract modes handle that). There is **no live overlay, plane tracking or measurement**, and
the product should be described as a *Room Visualizer* / *Photo Visualizer*.

## 2. Completion state

| Item | State |
| --- | --- |
| Customer workflow (rooms, uploads, camera capture, multiple irregular areas, magic select and snapping, cutouts, perspective, artwork placement, pattern maker, materials with tile layouts, lighting, before/after, image export, mobile/desktop) | **Complete in the delivered source**, tested locally (see [verification report](VERIFICATION_REPORT.md)) |
| Wix integration code (Velo page code, messaging, validation, CMS schema, permissions, staff guide) | **Complete as an integration package**, tested against a local Wix-page simulator |
| Installation on the client's Wix site, CMS collections created, published-page and real-device testing | **Not done — pending access** (site URL, editor type, plan and collaborator access not provided) |
| Client branding, photos, artwork, materials | **Not supplied** — demo content is generated placeholder content |
| Hosting of the editor build | **Not decided** — must be agreed with the owner (see costs) |

The project should therefore be presented as *"working editor + ready integration package;
installation on your site follows once access is provided"*, not as fully installed.

## 3. Remaining work after access (task-based estimate)

| Task | Estimate |
| --- | --- |
| Inspect the Wix site (editor type, layout, fonts, colours, mobile view) | 1–2 h |
| Create the four collections, permissions, first categories; add the HTML element and page code; configure allowed origins; deploy the production build | 3–5 h |
| Verify Wix media URL conversion, thumbnails and CORS on the real site; fix if needed | 1–3 h |
| Match the editor's colours/fonts/spacing to the site (tokens + optional `THEME`) | 2–4 h |
| Test the published page as a logged-out visitor: Chrome, Edge, Firefox, desktop Safari, real iPhone (Safari) and Android (Chrome), including the camera (live viewfinder vs camera-app fallback inside the Wix iframe) and *Save image* downloads | 4–6 h |
| Load the client's first real rooms, artwork and materials; tune material settings against physical samples | 2–4 h (depends on volume) |
| Fixes from client review | 4–8 h |

**Timeline estimate:** about **3–5 working days** from the day access and content are provided,
depending on feedback rounds. Not guaranteed; it depends on the client's response time.

Whether this remaining work is covered by the **USD 500 award** is the entry owner's decision.
It is part of the requested scope (installation, testing, bug corrections), so the natural
assumption is *included*; confirm before submitting.

## 4. Recurring costs (verify current prices before quoting)

| Item | Notes |
| --- | --- |
| Hosting the editor (static files, HTTPS) | Vercel **Hobby is restricted to non-commercial personal use** per Vercel's fair-use guidelines, so it is **not suitable for the client's production site**. Vercel Pro is listed at about USD 20/month (per seat) — verify at vercel.com/pricing. Alternatives with free tiers for static sites (e.g. Cloudflare Pages, Netlify) should be checked against their current commercial-use terms. The build is plain static files, so moving hosts is simple. |
| Wix | The client's existing plan. Velo page code and the HTML iframe element are used; confirm on the client's plan that both are available. |
| Paid APIs / AI / visualizer subscriptions | **None.** |

No recurring fee is introduced by the code itself.

## 5. Not included (would be separate work if wanted)

| Possible addition | Status |
| --- | --- |
| **Live camera AR** (surface-tracked) | Not included. Rough approach: WebXR `immersive-ar` with hit-testing works in Chrome on ARCore-capable Android phones, but **not in iOS Safari**; iPhone support would need a native ARKit app or App Clip. WebXR inside a Wix iframe also needs an iframe permission (`xr-spatial-tracking`) that the Wix element may not allow, so AR would likely open in its own browser tab. *Estimate*: Android-only web prototype 40–60 h; iOS native support substantially more. Needs a separate decision and budget. |
| Physical measurement / print sizes from photos | Not included; sizes are visual. Would need calibration (a reference object or entered wall dimensions). |
| Backlit glass / lighting products | Not included beyond scene brightness/warmth; needs product definitions from the client. |
| Saving projects, PDF export, quotes, checkout, accounts | Not included (not requested). A JPEG of the preview can be saved/shared from the editor. |
| AI segmentation (learned models) | Not included. Selection uses classical image processing that runs locally; an AI model would add download size and possibly a paid service. |

## 6. Portfolio and claims

No portfolio links, testimonials or prior-project claims are included. Add only authentic
examples if the entry owner has them.
