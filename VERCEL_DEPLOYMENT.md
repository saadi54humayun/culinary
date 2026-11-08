# Deploy Culinary to Vercel (React PWA + Express)

This repository has two independently deployable applications: `backend/` and
`frontend/`. Create **two Vercel projects from the same GitHub repository**.
The backend is deployed first. The frontend proxies `/api/*` requests to the
backend via an HTTPS rewrite, preserving relative API URLs and same-origin
browser cookies.

This is a deployment guide, not a claim that the application has already been
published. Test each part on the deployed domains before sharing the URL.

## Before starting

- Commit all local features, run your tests, and keep a backup of your database.
- Verify `git ls-files | grep -E '(^|/)(\.env($|\.)|\.vercel/)'` returns
  **no secrets** (the tracked `backend/.env.example` is intentionally safe).
  Review the Git history too if secrets may have been committed previously.
  Rotate any exposed credentials. Never paste real keys into GitHub issues.
- Use **Node 22** for both Vercel projects (and preferably for local builds).
- Create a **MongoDB Atlas** database and a strong database user. Get its
  `mongodb+srv://...` connection string. Vercel's outbound IPs may change; set
  Atlas network access appropriately. If broad access (`0.0.0.0/0`) is used
  for a hobby/serverless deployment, it increases exposure: require a strong
  unique DB password, minimal permissions, and TLS, and restrict networking
  more tightly when you can.
- Keep Cloudinary and your existing SMTP provider. Vercel doesn't block port
  587, but your mail provider still needs working credentials and delivery.
  `MAIL_MODE=preview` is **not** suitable for a live user signup flow.

## 1. Deploy backend first

1. On [vercel.com/new](https://vercel.com/new), import your GitHub `culinary`
   repository. Set the **Root Directory** to `backend`.
2. Project name: e.g. `culinary-api-<unique-name>` (choose your own).
3. Let Vercel detect **Express**. No build command or output directory is
   needed for the backend. Use Node.js **22.x**.
4. In **Project → Settings → Environment Variables**, set:

   | Variable | Purpose |
   | --- | --- |
   | `MONGODB_URI` | Your Atlas connection string (including database name) |
   | `SESSION_SECRET` | Random secret, at least 32 characters |
   | `OTP_SECRET` | **Different** random secret, at least 32 characters |
   | `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud |
   | `CLOUDINARY_API_KEY` | Server-side Cloudinary key |
   | `CLOUDINARY_API_SECRET` | Server-side Cloudinary secret |
   | `SMTP_HOST` | Your SMTP host |
   | `SMTP_PORT` | Usually `587` |
   | `SMTP_SECURE` | `false` for STARTTLS on 587 |
   | `SMTP_USER`, `SMTP_PASS` | SMTP credentials |
   | `MAIL_FROM` | Valid from-address authorized by your mail provider |
   | `USDA_API` | Nutrition API key (if using nutrition analysis) |
   | `GEMINI_API_KEY` | Gemini key (if using AI) |

   The optional variables `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS` remain supported.
   **Do not** manually set `PORT`, `VERCEL`, or `NODE_ENV` on Vercel. Do not
   expose keys with the `VITE_` prefix. Use Production environment initially;
   previews should have separate test data/credentials if enabled.
5. Deploy and visit `https://<backend-project>.vercel.app/api/health`.
   Expected response: `{"status":"ok","app":"Culinary"}`. The health
   endpoint checks the MongoDB connection; a 503 is a useful clue that Atlas
   settings or networking need attention.
6. Check **Deployment → Logs** if the backend fails. Confirm the service is
   publicly reachable from your browser (rather than protected by an
   authentication wall), otherwise the frontend proxy cannot reach it.

### Express and sessions on Vercel

`backend/index.js` now **exports** the Express app to Vercel but keeps
`npm start` working locally. `config/db.js` reuses a Mongoose connection per
warm function instance and coalesces concurrent connection attempts.
`connect-mongo` persists sessions in Atlas; do not replace it with
`express-session`'s MemoryStore. Behind Vercel's HTTPS proxy, secure,
HttpOnly, `SameSite=Lax` cookies are used and Express trusts the platform proxy.

## 2. Deploy frontend second

1. Import the **same** GitHub repository again in Vercel, creating a **second
   project**, e.g. `culinary-app-<unique-name>`.
2. Set **Root Directory** to `frontend`, framework **Vite**, Node.js **22.x**.
   The build command is `npm run build`, including the PWA service-worker
   generation. The output directory is `dist`.
3. Add frontend project **Environment Variable**:

   `CULINARY_BACKEND_ORIGIN=https://<backend-project>.vercel.app`

   Use the **origin only**—no `/api` path, no trailing path, no extra slash,
   no quotes. This is the only connection value needed on the frontend.
   It is a public URL, **not an API key**. If your backend URL changes,
   update this variable and redeploy the frontend.
4. Deploy. `frontend/vercel.mjs` supplies both an `/api/*` reverse proxy and
   a fallback to `/index.html` for React Router deep links. This proxy lets
   the frontend use session cookies without adding CORS rules or embedding
   the backend's domain into browser JavaScript.
5. Test `<frontend URL>/api/health`, **then** the home page and a nested path
   such as `/login` loaded directly in a new tab. If `/api/health` is HTML,
   check your frontend's Vercel configuration and root directory.

`frontend/vercel.mjs` runs during Vercel's build and will fail with a clear
error if `CULINARY_BACKEND_ORIGIN` isn't provided as a valid HTTPS origin.
Local Vite development continues to use the existing `/api` proxy to
`127.0.0.1:5001` and does **not** require this frontend Vercel variable.

## 3. Production smoke test (before announcing the URL)

- [ ] `/api/health` responds from both frontend and backend domains.
- [ ] Signup sends a **real** verification email, and OTP verification works.
- [ ] Login, refresh, `GET /api/auth/me`, and logout all work on the
      **frontend** domain. In browser DevTools, the session cookie should be
      `Secure`, `HttpOnly`, and have no separate backend `Domain` attribute.
- [ ] Create a recipe and upload a **small** test photo. The app limits images
      to **4 MB** because Vercel Functions impose a **4.5 MB request-body**
      limit including multipart overhead. Use direct-to-Cloudinary uploads
      later if you need larger files.
- [ ] Recipe discovery, comments, follows, saved recipes, pantry, grocery
      lists, meal planning, and nutrition endpoints work on deployed Atlas.
- [ ] Password reset works and the temporary reset cookie clears correctly.
- [ ] The Cooking Mode progress API persists and syncs between browser sessions.
- [ ] Install the frontend URL on iPhone via Safari → Add to Home Screen;
      test downloaded recipe access in airplane mode, then reconnection.
- [ ] Reinstall/redownload offline recipes after changing from the
      temporary Cloudflare-tunnel URL: PWA storage is **origin-specific**.
- [ ] Test an API error, retry behavior, and the AI UI when Gemini is slow.

## 4. Push and redeploy

From the `Culinary/` root:

```bash
git status
git diff --check
git add .gitignore backend frontend VERCEL_DEPLOYMENT.md
git commit -m "chore: prepare Culinary frontend and backend for Vercel"
git push origin main
```

Only do this after confirming that no real `.env` values have been tracked.
If the branch isn't `main`, push your branch and merge it after review.
Future pushes will automatically redeploy both connected Vercel projects.

## Troubleshooting

- `503 Database temporarily unavailable`: check Atlas URI, credentials,
  network access, and logs. Serverless functions need network access to Atlas.
- `401` after login: test via the **frontend** URL, inspect `Set-Cookie`,
  ensure `/api` is proxied, and confirm a single stable `SESSION_SECRET`.
- `404` on page refresh: check frontend Root Directory and `vercel.mjs`.
- `413 FUNCTION_PAYLOAD_TOO_LARGE`: compress photos below 4 MB or use
  direct-to-Cloudinary uploads.
- Emails don't arrive: confirm port 587, SMTP credentials, sender authorization,
  and provider restrictions; inspect backend logs. Open ports do not guarantee
  deliverability.
- The app loads but API returns HTML: `CULINARY_BACKEND_ORIGIN` may be absent
  or proxy rewrites may not be active; redeploy after updating env variables.
- Offline downloads don't appear after deployment: the Cloudflare temporary
  URL and new Vercel domain have separate browser storage and service workers.

Vercel Hobby is intended for personal/non-commercial use and has monthly usage
limits. Review the service's current terms before using it for business.
