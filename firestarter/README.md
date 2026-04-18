# Firestarter / static dashboard (optional)

**Canonical deployment** for the full POSEIDON stack is **Docker Compose** on your own server or VM — see the repo [README.md](../README.md) and [docker-compose.yml](../docker-compose.yml). The dashboard runs as the **dashboard** service behind **nginx** in that setup.

This folder documents **optional** ways to ship a **mobile-friendly static** or **edge-hosted** build of the dashboard (Vercel, Firebase Hosting, legacy Firestarter-style flows). Use these when you deliberately want the UI on a CDN or edge network while APIs stay on Compose or public API URLs.

## What’s included

- **Mobile-responsive** layout (breakpoint 768px): stacked header, 2-column KPIs, touch-friendly kanban, safe-area padding.
- **Static-oriented** notes: some paths assume a static build; the main app in `frontend/` is **Next.js** — prefer the Compose-based dashboard for production unless you maintain a separate static pipeline.

## Optional: Vercel (edge dashboard)

1. Install Vercel CLI (optional): `npm i -g vercel`
2. From the **repo root**:

   ```bash
   vercel --prod
   ```

   When prompted, set **Root Directory** to `frontend` (or link in the Vercel dashboard with root `frontend`).
3. In the Vercel dashboard, configure rewrites so `/api/*` reaches your Core API (e.g. `https://api.example.com/$path*`). [frontend/vercel.json](../frontend/vercel.json) may include example rewrites — align them with your real API hostnames.
4. Smoke-test on a phone after deploy.

## Optional: Firebase Hosting

1. Install Firebase CLI: `npm i -g firebase-tools`
2. Log in and select or create a project:

   ```bash
   firebase login
   firebase use --add
   ```

3. From the **repo root** (where `firebase.json` lives):

   ```bash
   firebase deploy
   ```

4. `firebase.json` uses `frontend` as the public directory for SPA-style hosting.
5. **API routing:** Firebase Hosting does not proxy to your backend by default. Either terminate `/api` at another reverse proxy, or configure the app to call public API base URLs via environment variables at build time.

## Optional: Firestarter (Vercel + Firebase)

If you use a [Firestarter](https://firestarter-site.vercel.app/)-style stack:

1. Use the Vercel flow above with project root `frontend`, or
2. Copy static assets into your Firestarter app’s public folder per that project’s conventions.

## Mobile checklist

- Viewport and theme-color in `index.html` (if using a static entry)
- Responsive layout and touch targets
- Safe-area insets for notched devices
- Kanban horizontal scroll with `-webkit-overflow-scrolling: touch` where applicable

## Files

| Path | Purpose |
|------|---------|
| [frontend/](../frontend/) | Next.js dashboard (also used by Compose) |
| [frontend/vercel.json](../frontend/vercel.json) | Example Vercel rewrites for edge deploys |
| [firebase.json](../firebase.json) | Firebase Hosting config |
