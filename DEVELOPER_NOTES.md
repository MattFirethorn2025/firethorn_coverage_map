# Firethorn Coverage Map — Developer Notes

Internal read-only app: Oklahoma PLSS sections on a map, colored by landman from Monday.com. If you have not touched this repo in months, start here.

---

## Running locally

**Prerequisites:** Node.js (current LTS is fine), npm.

1. **Install dependencies**

   ```bash
   npm install
   cd client && npm install && cd ..
   cd server && npm install && cd ..
   ```

2. **Environment** — Create a `.env` file at the **repository root** (same folder as this file). The server loads it via `dotenv` from `server/index.js`. The Vite client reads `VITE_*` variables at build/dev time from `client/` (standard Vite behavior).

3. **Start both processes**

   From the repo root:

   ```bash
   npm run dev
   ```

   This runs `concurrently`:
   - **Client:** Vite dev server — [http://localhost:5173](http://localhost:5173)
   - **Server:** Express — [http://localhost:3001](http://localhost:3001)

   Or run them in two terminals:

   ```bash
   npm run dev:server   # Express on PORT or 3001
   npm run dev:client   # Vite on 5173
   ```

4. **API proxy** — In dev, the client calls `/api/...` and Vite proxies those requests to `http://localhost:3001` (`client/vite.config.js`). You normally only open the Vite URL in the browser.

5. **Production build (client only)**

   ```bash
   cd client && npm run build && npm run preview
   ```

   You still need the Express server (or equivalent) serving or proxying `/api` and the built static files, depending on your deploy layout.

---

## Environment variables

| Variable         | Where                                     | Purpose                                                                                                                                           |
| ---------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MONDAY_API_KEY` | **Root `.env`**                           | Monday GraphQL API token. Used only on the server; sent as the `Authorization` header in `server/routes/monday.js`. Never exposed to the browser. |
| `PORT`           | **Root `.env`** (optional)                | Express listen port. Defaults to **3001** if unset.                                                                                               |
| `VITE_CLIENT_ID` | **`client/.env` or root** (see Vite docs) | Azure AD app (client) ID for MSAL.                                                                                                                |
| `VITE_TENANT_ID` | Same                                      | Azure AD tenant ID. Used to build the authority URL in `client/src/authConfig.js`.                                                                |

**Do not commit `.env`.** The repo rules also mention other secrets (e.g. client secret) for Azure apps; this codebase’s login flow uses the **public** MSAL redirect flow with `openid`, `profile`, and `email` — there is **no** Express route consuming an Azure client secret for the map app itself. If you add backend Azure validation later, document new vars here.

**Production MSAL:** `client/src/authConfig.js` uses `import.meta.env.VITE_REDIRECT_URI` with a fallback to `http://localhost:5173/auth/callback`. Set `VITE_REDIRECT_URI` to `https://<your-netlify-site>.netlify.app/auth/callback` in Netlify's environment variables and register the same URI in the Azure app registration.

---

## Monday data pipeline (end to end)

1. **Source of truth** — A Monday.com board (`BOARD_ID` in `server/routes/monday.js`, currently `18394242733`). Rows are “sections” with columns for sec, township, range, county, landman (People column mapped to display text), status, prices, dates, etc.

2. **Server-only access** — The browser never calls `api.monday.com`. It only calls this app’s Express routes under `/api/monday`.

3. **`GET /api/monday/sections`** — If the in-memory cache is fresh (within `CACHE_TTL_MS`, **3 minutes**), returns cached `{ sections, conflicts, cachedAt }`. Otherwise it pages through Monday’s `items_page` (500 items per page, cursor until exhausted), aggregates items, runs `transformItems()`, stores the result in `sectionsCache`, and returns JSON.

4. **`transformItems()`** — Maps each item to a flat record (`sec`, `twp`, `range`, `county`, `landman`, `activity`, `priceNma`, …). Builds **`strKey`** as `sec|twp|range` with each part **trimmed and lowercased** (must stay consistent with the map merge).

5. **Conflicts** — If more than one **non-empty, non-“Unassigned”** landman appears for the same `strKey`, that key is listed in `conflicts` with the full list of rows. The map paints those polygons red and the details UI can show multiple cards.

6. **Client consumption** — `MapView.jsx` fetches `/api/monday/sections` on map load and on refresh; it keeps the latest payload in `mondayDataRef` for click/hover behavior.

---

## Map rendering: GeoJSON + Monday merge

1. **Static geometry** — `client/public/four_counties_plss.geojson` is served as a static file. It is produced offline by scripts in `scripts/` (see below). Features are PLSS section polygons with BLM-style properties (`FRSTDIVNO`, `TWNSHPNO`, `TWNSHPDIR`, `RANGENO`, `RANGEDIR`, etc.).

2. **MapLibre** — On `map` `"load"`, the client fetches the GeoJSON and Monday JSON in parallel, then runs **`mergeMondayIntoGeojson(geojson, mondayData)`** (defined in `MapView.jsx`). That function:
   - Builds a map of Monday rows by `strKey` (with a small rule: if duplicate keys exist, prefer a row that has an assigned landman over `"Unassigned"`).
   - Builds a set of conflict keys from `mondayData.conflicts`.
   - For each GeoJSON feature, computes the same **`strKey`** from feature properties (section + township + range, normalized) and writes `landman`, `activity`, `priceNma`, `county`, `inMonday`, `isConflict`, `strKey` onto **`feature.properties`**.

3. **Layers** — A single GeoJSON source `plss-sections` drives `plss-fill` and `plss-outline`. Fill color is driven by `landman` (with a fixed palette in `MapView.jsx`) and conflicts force red. Opacity is 0 for sections not in Monday (`inMonday`).

4. **Baseline ref pattern (`plssGeojsonBaselineRef`)** — On first load, a **deep copy** of the raw GeoJSON (before Monday fields are applied) is stored in `plssGeojsonBaselineRef`. Manual refresh and the 3‑minute poller **clone that baseline**, merge fresh Monday data, and call `getSource("plss-sections").setData(updatedGeojson)`. That avoids re-fetching the large static file on every refresh and prevents stale Monday fields from accumulating on top of each other.

---

## Authentication (MSAL, allowlist, callback)

1. **Library** — `@azure/msal-browser` + `@azure/msal-react`. The app instance is created in `client/src/main.jsx` and wrapped in `MsalProvider`.

2. **Login** — `Login.jsx` calls `loginRedirect(loginRequest)` with scopes `openid`, `profile`, `email`.

3. **Callback route** — `App.jsx` checks `window.location.pathname`. If it is `/auth/callback`, it renders **`AuthCallback.jsx`** instead of the map. That component runs `instance.handleRedirectPromise()`, reads the signed-in account, and derives an email from `idTokenClaims.email`, `idTokenClaims.preferred_username`, or `account.username`.

4. **Allowlist** — `AuthCallback.jsx` contains **`ALLOWED_EMAILS`**, a hardcoded `Set` of lowercase addresses. If the email is in the set, it calls `setActiveAccount` and `window.location.replace('/')`. If not, it sets a sessionStorage flag, logs the user out via `logoutRedirect`, and shows an access-denied message on return.

5. **Redirect URI** — Must match Azure app registration **exactly**. Dev default in code: `http://localhost:5173/auth/callback`. Post-logout redirect for denied users is `${window.location.origin}/auth/callback`.

6. **Session** — MSAL cache location is `sessionStorage` (`authConfig.js`), so a browser tab session ends when the tab/session storage is cleared.

---

## Cache and refresh

| Mechanism                      | Behavior                                                                                                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server TTL cache**           | `sectionsCache` in `server/routes/monday.js`. `GET /api/monday/sections` returns cached data if age &lt; **3 minutes** (`CACHE_TTL_MS`). Response may include `cachedAt` (ISO string).                                        |
| **`POST /api/monday/refresh`** | Sets `sectionsCache = null`. Does **not** fetch Monday by itself; the next `GET /api/monday/sections` repopulates the cache.                                                                                                  |
| **Client refresh**             | `handleRefreshMonday` in `MapView.jsx`: `POST /api/monday/refresh`, then `GET /api/monday/sections`, then merge into a clone of `plssGeojsonBaselineRef` and `setData` on the map source. Updates `lastRefreshed` on success. |
| **Polling**                    | A `useEffect` starts a **3‑minute** `setInterval` that invokes the same `handleRefreshMonday` (via a ref) only after the map has finished initial load (`mapMondayReady` and baseline ref set).                               |

---

## Key files

| Path                                       | Role                                                                                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                             | Root scripts: `dev`, `dev:client`, `dev:server`.                                                                                                                                        |
| `client/vite.config.js`                    | Dev proxy `/api` → `localhost:3001`.                                                                                                                                                    |
| `client/src/main.jsx`                      | MSAL bootstrap.                                                                                                                                                                         |
| `client/src/authConfig.js`                 | `msalConfig`, `loginRequest`; **check `redirectUri` for prod**.                                                                                                                         |
| `client/src/App.jsx`                       | Route split: `/auth/callback` vs login vs `MapView`.                                                                                                                                    |
| `client/src/pages/Login.jsx`               | Microsoft sign-in button.                                                                                                                                                               |
| `client/src/pages/AuthCallback.jsx`        | Redirect handler + email allowlist + logout for denied users.                                                                                                                           |
| `client/src/pages/MapView.jsx`             | MapLibre map, merge logic, refresh/polling, sidebar (legend, refresh, county zoom).                                                                                                     |
| `client/src/components/DetailsPanel.jsx`   | Slide-out detail cards for selected section / conflicts.                                                                                                                                |
| `client/src/components/FilterSidebar.jsx`  | **Not imported by the app today** — legacy or future UI; safe to ignore unless you wire it in.                                                                                          |
| `client/public/four_counties_plss.geojson` | Section polygons for the four-county window.                                                                                                                                            |
| `server/index.js`                          | Express app, loads root `.env`, mounts `monday` router, health check.                                                                                                                   |
| `server/routes/monday.js`                  | Monday GraphQL fetch, transform, cache, `GET /sections`, `POST /refresh`.                                                                                                               |
| `scripts/fetch-plss.js`                    | Downloads Oklahoma PLSS section GeoJSON from BLM ArcGIS into `oklahoma_plss_sections.geojson`.                                                                                          |
| `scripts/filter-plss.js`                   | Filters to the four-county STR window, dedupes by `FRSTDIVID`, normalizes `TWNSHPNO` / `RANGENO` padding; writes `four_counties_plss.geojson` (copy into `client/public/` for the app). |

---

## Known quirks and gotchas

1. **STR matching** — Map and Monday must agree on `strKey`: `sec|twp|range` after trim + lowercase. The map derives `sec` from `FRSTDIVNO` and township/range from `TWNSHPNO`, `TWNSHPDIR`, `RANGENO`, `RANGEDIR` using **numeric parse + 2-digit (township/range) padding**. Monday columns must use the same logical values (e.g. leading zeros in source data are stripped by `parseInt` on the map side). If a row does not color, compare raw Monday `sec` / `twp` / `range` to the GeoJSON properties for that polygon.

2. **County overlap / zoom buttons** — Sidebar “Zoom to County” uses **approximate** bounding boxes. Borders are not survey-accurate; two adjacent county buttons may show overlapping fringe areas. The static GeoJSON was built with a **township/range window** in `filter-plss.js` (not a strict county polygon), so county labels on Monday rows and map fitBounds are convenience layers, not legal boundaries.

3. **`plssGeojsonBaselineRef`** — Refresh **must** start from this snapshot. If you change the merge to mutate the source object in place without resetting from baseline, repeated refreshes can leave ghost properties or wrong joins.

4. **Landman colors** — The fill palette in `MapView.jsx` is a fixed object. Landmen not in the map will fall through to the default gray in the `match` expression.

5. **Monday pagination** — The GraphQL query uses `items_page(limit: 500, …)` with cursors. If the board grows past what the loop can fetch in one request chain, you may need to verify Monday API limits and error handling in `monday.js`.

6. **Hover panel** — Uses `document.getElementById` and `innerHTML` for the hover strip; it is not React-managed. Keep IDs stable if you refactor.

7. **`selectedStrKeyRef`** — Ref mirrors React state so map click handlers (registered once on load) see the latest selection without resubscribing.

8. **CORS** — Server uses `cors()` broadly. In production, tighten to your frontend origin if the API is public-facing.

---

## Quick sanity checklist

- [ ] Root `.env` has `MONDAY_API_KEY`.
- [ ] Client env has `VITE_CLIENT_ID` and `VITE_TENANT_ID`.
- [ ] Azure app has redirect URI for `…/auth/callback`.
- [ ] Your email is in `ALLOWED_EMAILS` (or you will be logged out with “access restricted”).
- [ ] `npm run dev` — open `http://localhost:5173`, sign in, map loads sections.

Welcome back.
