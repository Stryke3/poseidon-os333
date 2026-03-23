# Deploy Poseidon Dashboard (Firestarter / Vercel / Firebase)

Mobile-friendly static build of the Poseidon dashboard for deployment via **Vercel** (Firestarter-style) or **Firebase Hosting**.

## What’s included

- **Mobile-responsive** layout (breakpoint 768px): stacked header, 2-column KPIs, touch-friendly kanban scroll and tap targets, safe-area padding for notched devices.
- **Static build**: no Node build step; the `frontend/` folder is the deployable artifact (HTML + JSX via Babel in browser, or use the same files with a static host).

## Deploy with Vercel (recommended for Firestarter)

1. Install Vercel CLI (optional): `npm i -g vercel`
2. From the **repo root**:
   ```bash
   vercel --prod
   ```
   When prompted, set **Root Directory** to `frontend` (or link the project in the Vercel dashboard with root `frontend`).
3. In the Vercel dashboard, add a rewrite so `/api/*` proxies to your Core API (e.g. `https://api.strykefox.com/$path*`). The repo’s `frontend/vercel.json` already includes:
   ```json
   "rewrites": [ { "source": "/api/:path*", "destination": "https://api.strykefox.com/:path*" } ]
   ```
4. Your dashboard will be live at `https://<your-project>.vercel.app`. Open on a phone to verify the mobile layout.

## Deploy with Firebase Hosting

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
4. `firebase.json` is set to use `frontend` as the public directory, so the dashboard is served as a SPA (all routes → `index.html`).
5. **API**: Firebase Hosting cannot proxy to an external API. Point the app at your Core API by either:
   - Hosting the frontend on a domain that can proxy `/api` to `api.strykefox.com`, or
   - Changing `API_BASE` in `frontend/src/App.jsx` to `https://api.strykefox.com` (or an env-based URL) and rebuilding/redeploying.

## Deploy with Firestarter (Vercel + Firebase)

If you use the [Firestarter](https://firestarter-site.vercel.app/) stack (Next.js + Vercel + Firebase):

1. Use the **Vercel** flow above and set the project root to `frontend` so the dashboard is the deployed app, or
2. Copy the contents of `frontend/` into your Firestarter app’s `public/` (or the appropriate static asset folder) and deploy through your existing Firestarter pipeline. The dashboard is static HTML/JS/CSS and works as a standalone SPA.

## Mobile checklist

- Viewport and theme-color set in `index.html`
- Responsive layout and touch targets in `App.jsx` (breakpoint 768px)
- Safe-area insets for notched devices
- Kanban horizontal scroll with `-webkit-overflow-scrolling: touch`

## Files

| Path | Purpose |
|------|--------|
| `frontend/` | Deployable static site (mobile-friendly) |
| `frontend/vercel.json` | Vercel rewrites (e.g. `/api` → Core API) |
| `firebase.json` | Firebase Hosting config (public dir: `frontend`) |
| `firestarter/README.md` | This deploy guide |
