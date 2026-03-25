# Deploy checklist — Netlify (client) + Render (Express)

Use this when shipping the Firethorn Coverage Map. Replace placeholder URLs (`your-app.netlify.app`, `your-api.onrender.com`) with real values.

---

## Pre-deploy

- [ ] **Monday API key** is ready (Monday.com → account → Developers → API token). You will paste it only into Render, never into Netlify or the repo.
- [ ] **Azure AD app** already exists (or Justin creates/updates it per [Azure section](#justin-azure-app-registration) below). You have the **Application (client) ID** and **Directory (tenant) ID**.
- [ ] **Production URLs decided:** Netlify site URL (e.g. `https://firethorn-map.netlify.app`) and Render service URL (e.g. `https://firethorn-api.onrender.com`).
- [ ] **MSAL redirect URI matches Netlify:** The app must use your Netlify origin + `/auth/callback` at build time. Today `client/src/authConfig.js` hardcodes `http://localhost:5173/auth/callback`. Before production build, either:
  - [ ] Point `redirectUri` at `https://<your-site>.netlify.app/auth/callback`, **or**
  - [ ] Add something like `import.meta.env.VITE_REDIRECT_URI` and set that variable in Netlify (preferred so dev vs prod stays automatic).
- [ ] **`AuthCallback.jsx` post-logout URL:** Denied users use `postLogoutRedirectUri: ${window.location.origin}/auth/callback`. No code change if the site is served from the same Netlify URL (origin is correct).
- [ ] **Allowlist:** Confirm deploy stakeholders’ Microsoft emails are in `ALLOWED_EMAILS` in `client/src/pages/AuthCallback.jsx` (lowercase). Commit and push if you add anyone.
- [ ] **Local production build check (optional but recommended):**
  - [ ] From `client/`: `VITE_CLIENT_ID=… VITE_TENANT_ID=… npm run build` (and `VITE_REDIRECT_URI` if you added it).
  - [ ] `npm run preview` and confirm the built bundle loads (API calls will fail until proxy/backend exist — that is OK for a static smoke check).

---

## Render — Express API

Create a **Web Service** that runs the Node server from this repo.

- [ ] **Connect** the GitHub (or Git) repository.
- [ ] **Root directory:** Leave **empty** (repository root) *or* set to `server` only if you adjust paths — simplest is **repo root** with custom commands below.
- [ ] **Runtime:** Node (match your local major version, e.g. 20 LTS).
- [ ] **Build command** (repo root):  
  `npm install --prefix server`
- [ ] **Start command** (repo root):  
  `node server/index.js`
- [ ] **Environment variables** (Render dashboard → Environment):
  - [ ] `MONDAY_API_KEY` — Monday API token (required for `/api/monday/sections`).
  - [ ] `PORT` — Usually **omit**; Render sets `PORT` automatically. The app uses `process.env.PORT || 3001`.
- [ ] **Health check path (if Render offers it):** `/api/health`
- [ ] **Deploy** and copy the service **public URL** (e.g. `https://firethorn-api.onrender.com`). You need it for Netlify and Azure.
- [ ] **Cold starts:** Free/spin-down tiers wake on first request; first load after idle may be slow — note for smoke tests.

**Note:** `server/index.js` loads `.env` from the parent of `server/` when a file exists. On Render, **dashboard env vars are enough**; you do not need to commit `.env`.

---

## Netlify — Vite client

- [ ] **Connect** the same repository.
- [ ] **Base directory:** `client` (recommended) so build context is the Vite app.
- [ ] **Build command:** `npm run build` (or `npm ci && npm run build` in CI-friendly pipelines).
- [ ] **Publish directory:** `dist` (relative to base `client`, i.e. `client/dist`).
- [ ] **Environment variables** (Site settings → Environment variables → same scope as build):
  - [ ] `VITE_CLIENT_ID` — Azure app client ID.
  - [ ] `VITE_TENANT_ID` — Azure tenant ID.
  - [ ] `VITE_REDIRECT_URI` — only if you wired `authConfig.js` to use it; value `https://<your-site>.netlify.app/auth/callback`.
- [ ] **Proxy API to Render:** The browser calls `/api/...` (same origin). Netlify must forward that to Render. Add **`netlify.toml`** at the **repo root** (or `client/netlify.toml` if the whole Netlify config lives under `client` — adjust paths accordingly), for example:

  ```toml
  [build]
    base = "client"
    command = "npm run build"
    publish = "dist"

  [[redirects]]
    from = "/api/*"
    to = "https://YOUR-SERVICE.onrender.com/api/:splat"
    status = 200
    force = true

  [[redirects]]
    from = "/*"
    to = "/index.html"
    status = 200
  ```

  - [ ] Replace `YOUR-SERVICE.onrender.com` with your Render hostname **exactly** (HTTPS, no trailing slash on the host).
  - [ ] Confirm `force = true` (or your Netlify version’s equivalent) so `/api/*` is proxied and not swallowed by the SPA rule.
- [ ] **Deploy** the site and note the **live URL** (`https://…netlify.app`).

---

## Post-deploy smoke tests

- [ ] Open `https://<netlify>/api/health` — should return JSON like `{ "status": "ok" }` (proves Netlify → Render proxy).
- [ ] Open `https://<render>/api/health` directly — same JSON (proves Render is up).
- [ ] Open `https://<netlify>/` — login page appears.
- [ ] **Sign in with Microsoft** (use an allowlisted account).
- [ ] After redirect, **map loads** (OSM basemap + section polygons).
- [ ] **Sections show color** where Monday has assignments (proves `/api/monday/sections` through the proxy).
- [ ] **Refresh Monday data** button: completes without error; **Updated** time changes.
- [ ] **Zoom to County** buttons move the map.
- [ ] **Click a section** — details panel opens with expected fields.
- [ ] **Non-allowlisted account** (optional): expect access denied message after callback (and logout flow), not the map.

---

## Justin — Azure app registration

*(Hand this section to Justin or tick it together.)*

- [ ] In [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → select (or create) the app used for this project.
- [ ] **Authentication** → **Platform configurations** → **Single-page application**:
  - [ ] Add **Redirect URI:** `https://<your-netlify-site>.netlify.app/auth/callback`
  - [ ] Keep **localhost** redirect for local dev if the team still uses it: `http://localhost:5173/auth/callback`
- [ ] Under **Logout URL** (if shown / required for your tenant): you may add `https://<your-netlify-site>.netlify.app/auth/callback` for parity with `postLogoutRedirectUri` used after denied access.
- [ ] **Certificates & secrets:** No **client secret** is required for the current public SPA flow (`loginRedirect` + `handleRedirectPromise`). Do not put secrets in the frontend.
- [ ] **API permissions:** Default **Microsoft Graph** delegated permissions are usually enough for `openid`, `profile`, `email` — confirm **User.Read** (or equivalent) is granted if your tenant requires explicit admin consent.
- [ ] **Grant admin consent** for the org if your IT policy requires it.
- [ ] Send the team the **Application (client) ID** and **Directory (tenant) ID** for Netlify env vars (`VITE_CLIENT_ID`, `VITE_TENANT_ID`).
- [ ] **Optional hardening:** If you later restrict the app to specific users/groups, note the app still enforces an **email allowlist in code** (`AuthCallback.jsx`); Azure assignment and that list should stay aligned.

---

## Quick reference

| Secret / value        | Where it lives        |
|-----------------------|------------------------|
| `MONDAY_API_KEY`      | Render only            |
| `VITE_CLIENT_ID`      | Netlify (build)        |
| `VITE_TENANT_ID`      | Netlify (build)        |
| Redirect URIs         | Azure + MSAL config    |
| Render service URL    | Netlify `netlify.toml` proxy target |

After everything is green, update **`DEVELOPER_NOTES.md`** if production URLs, env names, or proxy layout change so the next deploy stays boring.
